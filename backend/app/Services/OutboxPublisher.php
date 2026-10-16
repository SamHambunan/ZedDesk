<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\Organization;
use App\Models\Ticket;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

class OutboxPublisher
{
    public function publish(string $signalId, string $reservationToken): void
    {
        OrganizationContext::clear();
        try {
            $signal = DB::table('delivery_outbox')->where('id', $signalId)
                ->where('reservation_token', $reservationToken)
                ->whereNull('delivered_at')->whereNull('quarantined_at')->first();
            if (! $signal) {
                return;
            }

            try {
                $organization = Organization::find($signal->organization_id);
                if (! $organization) {
                    throw new InvalidArgumentException('Delivery Organization is unavailable.');
                }
                OrganizationContext::setCurrent($organization);
                $envelope = json_decode($signal->envelope, true, 512, JSON_THROW_ON_ERROR);
                $channels = $this->channels($signal, $envelope);
                if ($channels !== []) {
                    $isCustomerDeletion = $signal->kind === 'customer_ticket' && ($envelope['change_type'] ?? null) === 'deleted';
                    $eventName = match (true) {
                        $signal->kind === 'member_inbox' => 'inbox.changed',
                        $isCustomerDeletion => 'ticket.unavailable',
                        default => 'ticket.changed',
                    };
                    $payload = $isCustomerDeletion ? [] : $envelope;

                    try {
                        Broadcast::connection('reverb')->broadcast($channels, $eventName, $payload);
                    } catch (Throwable $error) {
                        app(OutboxFailure::class)->record($signal, $error, true);

                        return;
                    }
                }

                DB::table('delivery_outbox')->where('id', $signalId)
                    ->where('reservation_token', $reservationToken)->update([
                        'delivered_at' => now(),
                        'reservation_token' => null,
                        'reserved_until' => null,
                        'last_error' => null,
                        'updated_at' => now(),
                    ]);
            } catch (Throwable $error) {
                $failure = app(OutboxFailure::class);
                $failure->record($signal, $error, $failure->isInfrastructure($error));
            }
        } finally {
            OrganizationContext::clear();
        }
    }

    private function channels(object $signal, array $envelope): array
    {
        if (($envelope['event_id'] ?? null) !== $signal->id
            || (int) ($envelope['organization_id'] ?? 0) !== (int) $signal->organization_id) {
            throw new InvalidArgumentException('Delivery identity mismatch.');
        }

        if ($signal->kind === 'member_inbox') {
            if (! $signal->recipient_member_id || ! $signal->ticket_id
                || (int) ($envelope['recipient_member_id'] ?? 0) !== (int) $signal->recipient_member_id) {
                throw new InvalidArgumentException('Incomplete member delivery identity.');
            }
            $memberExists = DB::table('organization_members')->where('id', $signal->recipient_member_id)
                ->where('organization_id', $signal->organization_id)->exists();
            $notificationExists = DB::table('notifications')->where('recipient_member_id', $signal->recipient_member_id)
                ->where('organization_id', $signal->organization_id)->where('ticket_id', $signal->ticket_id)->exists();
            $ticketAvailable = DB::table('tickets')->where('id', $signal->ticket_id)
                ->where('organization_id', $signal->organization_id)->whereNull('deleted_at')->exists();
            if (! $memberExists || ! $notificationExists || ! $ticketAvailable) {
                return [];
            }

            return [new PrivateChannel(app(MemberNotificationChannel::class)->name((int) $signal->organization_id, (int) $signal->recipient_member_id))];
        }

        if (! $signal->ticket_id || ($envelope['ticket_id'] ?? null) !== $signal->ticket_id
            || ! isset($envelope['revision'], $envelope['change_type'])) {
            throw new InvalidArgumentException('Incomplete Ticket delivery identity.');
        }
        $ticket = Ticket::withoutGlobalScopes()->withTrashed()->whereKey($signal->ticket_id)
            ->where('organization_id', $signal->organization_id)->first();
        if (! $ticket) {
            return [];
        }

        if ($signal->kind === 'customer_ticket') {
            if (! $signal->customer_id || (string) $ticket->customer_id !== (string) $signal->customer_id) {
                return [];
            }
            $customerExists = DB::table('customers')->where('id', $signal->customer_id)
                ->where('organization_id', $signal->organization_id)->exists();
            if (! $customerExists) {
                return [];
            }

            if ($envelope['change_type'] === 'deleted') {
                if (! $ticket->trashed() || $this->isObsoleteOrInvalid($ticket, (int) $envelope['revision'])) {
                    return [];
                }

                $channelName = $envelope['deletion_channel'] ?? app(CustomerTicketLiveChannel::class)->name($signal->ticket_id);

                return [new PrivateChannel($channelName)];
            }

            if ($ticket->trashed() || $this->isObsoleteOrInvalid($ticket, (int) $envelope['revision'])) {
                return [];
            }

            return [new PrivateChannel(app(CustomerTicketLiveChannel::class)->name($signal->ticket_id))];
        }

        if ($signal->kind !== 'staff_ticket') {
            throw new InvalidArgumentException('Unknown delivery kind.');
        }

        if ($envelope['change_type'] === 'deleted') {
            if (! $ticket->trashed() || $this->isObsoleteOrInvalid($ticket, (int) $envelope['revision'])) {
                return [];
            }

            return [
                new PrivateChannel(app(TicketLiveChannel::class)->name($signal->ticket_id)),
                new PrivateChannel(app(OrganizationLiveChannel::class)->name((int) $signal->organization_id)),
            ];
        }

        if ($ticket->trashed() || $this->isObsoleteOrInvalid($ticket, (int) $envelope['revision'])) {
            return [];
        }

        if ($envelope['change_type'] === 'created') {
            return [new PrivateChannel(app(OrganizationLiveChannel::class)->name((int) $signal->organization_id))];
        }

        $channels = [new PrivateChannel(app(TicketLiveChannel::class)->name($signal->ticket_id))];
        if ($envelope['change_type'] !== 'message_created') {
            $channels[] = new PrivateChannel(app(OrganizationLiveChannel::class)->name((int) $signal->organization_id));
        }

        return $channels;
    }

    private function isObsoleteOrInvalid(Ticket $ticket, int $envelopeRevision): bool
    {
        if ($ticket->revision > $envelopeRevision) {
            return true;
        }

        if ($ticket->revision < $envelopeRevision) {
            throw new InvalidArgumentException('Delivery revision exceeds the Ticket revision.');
        }

        return false;
    }
}
