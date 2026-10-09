<?php

namespace App\Services;

use App\Events\MemberInboxChanged;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TicketNotificationService
{
    public function ticketCreated(Ticket $ticket): void
    {
        $members = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $ticket->organization_id)
            ->pluck('id');

        $this->notify($ticket, $members, 'ticket_created', []);
    }

    public function assignmentChanged(Ticket $ticket, ?int $previousTeamId, ?int $previousMemberId, ?int $actorMemberId): void
    {
        $recipientIds = $this->currentHandlerIds($ticket);

        if ($previousMemberId !== null) {
            $recipientIds[] = $previousMemberId;
        }

        $recipients = $this->eligibleRecipients($ticket, $recipientIds, $actorMemberId);

        $this->notify($ticket, $recipients, 'assignment_changed', [
            'from_team_id' => $previousTeamId,
            'from_member_id' => $previousMemberId,
            'to_team_id' => $ticket->assigned_team_id,
            'to_member_id' => $ticket->assigned_member_id,
            'actor_member_id' => $actorMemberId,
        ]);
    }

    public function conversationChanged(Ticket $ticket, TicketMessage $message): void
    {
        $customerReply = $message->isPublicReply() && $message->isCustomerAuthor();
        $memberNote = $message->isInternalNote() && $message->author_type === OrganizationMember::class;
        if (! $customerReply && ! $memberNote) {
            return;
        }

        $actorMemberId = $memberNote ? (int) $message->author_id : null;
        $recipients = $this->eligibleRecipients($ticket, $this->currentHandlerIds($ticket), $actorMemberId);

        $this->notify($ticket, $recipients, $customerReply ? 'customer_public_reply' : 'internal_note', [
            'message_id' => $message->id,
            'actor_member_id' => $actorMemberId,
        ]);
    }

    private function currentHandlerIds(Ticket $ticket): array
    {
        if ($ticket->assigned_member_id !== null) {
            return [$ticket->assigned_member_id];
        }

        if ($ticket->assigned_team_id !== null) {
            return DB::table('team_members')
                ->where('team_id', $ticket->assigned_team_id)
                ->pluck('organization_member_id')->all();
        }

        return OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $ticket->organization_id)
            ->pluck('id')->all();
    }

    private function eligibleRecipients(Ticket $ticket, array $recipientIds, ?int $actorMemberId): Collection
    {
        return OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $ticket->organization_id)
            ->whereIn('id', array_unique($recipientIds))
            ->when($actorMemberId !== null, fn ($query) => $query->where('id', '!=', $actorMemberId))
            ->pluck('id');
    }

    /**
     * Write notifications in the caller's Ticket transaction. The partial unique index
     * and UPSERT keep one unread item per member and Ticket under concurrent activity.
     */
    private function notify(Ticket $ticket, Collection $members, string $activityType, array $metadata): void
    {
        foreach ($members as $memberId) {
            $now = now();
            DB::statement(
                'INSERT INTO notifications (id, organization_id, recipient_member_id, ticket_id, activity_type, latest_activity_metadata, latest_activity_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
                 ON CONFLICT (recipient_member_id, ticket_id) WHERE read_at IS NULL
                 DO UPDATE SET activity_type = EXCLUDED.activity_type,
                    latest_activity_metadata = EXCLUDED.latest_activity_metadata,
                    latest_activity_at = EXCLUDED.latest_activity_at,
                    updated_at = EXCLUDED.updated_at',
                [(string) Str::uuid(), $ticket->organization_id, $memberId, $ticket->id, $activityType,
                    json_encode((object) $metadata, JSON_THROW_ON_ERROR), $now, $now, $now]
            );

            MemberInboxChanged::dispatch((int) $ticket->organization_id, (int) $memberId);
        }
    }
}
