<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Enums\TicketPriority;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

class AuditLogWriter
{
    public function recordPriorityChange(Ticket $ticket, User $actor, TicketPriority $old, TicketPriority $new): void
    {
        $organizationId = OrganizationContext::getCurrentId();
        if ($organizationId === null || (int) $ticket->organization_id !== $organizationId) {
            throw new LogicException('Audit Organization must match the verified Ticket Organization.');
        }

        DB::table('audit_logs')->insert([
            'id' => (string) Str::uuid(),
            'occurred_at' => now(),
            'classification' => 'business',
            'action' => 'ticket.priority_changed',
            'outcome' => 'success',
            'organization_id' => $organizationId,
            'actor_type' => 'user',
            'actor_id' => (string) $actor->id,
            'target_type' => 'ticket',
            'target_id' => $ticket->id,
            'changes' => json_encode(['priority' => ['old' => $old->value, 'new' => $new->value]], JSON_THROW_ON_ERROR),
            'request_location' => '/api/tickets/{ticket}/priority',
        ]);
    }
}
