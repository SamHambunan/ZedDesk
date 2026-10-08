<?php

namespace App\Services;

use App\Events\MemberInboxChanged;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TicketNotificationService
{
    public function ticketCreated(Ticket $ticket): void
    {
        $this->notify($ticket);
    }

    /**
     * Write notifications in the caller's Ticket transaction. The partial unique index
     * and UPSERT keep one unread item per member and Ticket under concurrent activity.
     */
    private function notify(Ticket $ticket): void
    {
        $members = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $ticket->organization_id)
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
                [(string) Str::uuid(), $ticket->organization_id, $memberId, $ticket->id, 'ticket_created',
                    '{}', $now, $now, $now]
            );

            MemberInboxChanged::dispatch((int) $ticket->organization_id, (int) $memberId);
        }
    }
}
