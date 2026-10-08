<?php

namespace App\Services;

use App\Events\MemberInboxChanged;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TicketNotificationService
{
    public function ticketCreated(Ticket $ticket): void
    {
        $this->notify($ticket, 'ticket_created', [], null, $this->handlerIds($ticket));
    }

    public function assignmentChanged(Ticket $ticket, ?int $outgoingMemberId, ?int $actorMemberId): void
    {
        $recipients = $this->handlerIds($ticket);
        if ($outgoingMemberId !== null) {
            $recipients[] = $outgoingMemberId;
        }
        $this->notify($ticket, 'assignment_changed', [
            'assigned_team_id' => $ticket->assigned_team_id,
            'assigned_member_id' => $ticket->assigned_member_id,
        ], $actorMemberId, $recipients);
    }

    public function messageCreated(Ticket $ticket, TicketMessage $message): void
    {
        if ($message->isCustomerAuthor() && $message->isPublicReply()) {
            $type = 'customer_public_reply';
            $actor = null;
        } elseif ($message->isInternalNote() && $message->author_type === OrganizationMember::class) {
            $type = 'internal_note';
            $actor = (int) $message->author_id;
        } else {
            return;
        }

        $this->notify($ticket, $type, ['message_id' => $message->id], $actor, $this->handlerIds($ticket));
    }

    private function handlerIds(Ticket $ticket): array
    {
        if ($ticket->assigned_member_id !== null) {
            return [(int) $ticket->assigned_member_id];
        }

        if ($ticket->assigned_team_id !== null) {
            return Team::withoutGlobalScopes()->whereKey($ticket->assigned_team_id)->first()
                ?->members()->pluck('organization_members.id')->map(fn ($id) => (int) $id)->all() ?? [];
        }

        return OrganizationMember::withoutGlobalScopes()->where('organization_id', $ticket->organization_id)
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * Write notifications in the caller's Ticket transaction. The partial unique index
     * and UPSERT keep one unread item per member and Ticket under concurrent activity.
     */
    private function notify(Ticket $ticket, string $activityType, array $metadata, ?int $actorMemberId, array $recipientIds): void
    {
        $members = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $ticket->organization_id)
            ->whereIn('id', array_unique($recipientIds))
            ->when($actorMemberId, fn ($query) => $query->where('id', '!=', $actorMemberId))
            ->pluck('id');

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
                    json_encode($metadata, JSON_THROW_ON_ERROR), $now, $now, $now]
            );

            MemberInboxChanged::dispatch((int) $ticket->organization_id, (int) $memberId);
        }
    }
}
