<?php

namespace App\Services;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

class TicketFieldEditor
{
    public function __construct(private TicketStateMachine $stateMachine, private AuditLogWriter $auditLogWriter) {}

    public function updateStatus(Ticket $ticket, string $status, ?int $expectedRevision): ?array
    {
        return $this->apply($ticket, 'status', $expectedRevision,
            fn (Ticket $current) => $this->stateMachine->transitionTo($current, $status));
    }

    public function updatePriority(Ticket $ticket, string $priority, ?int $expectedRevision, User $actor): ?array
    {
        return $this->apply($ticket, 'priority', $expectedRevision,
            function (Ticket $current) use ($priority, $actor) {
                $old = $current->priority;
                $current->updatePriority($priority);
                if ($current->priority !== $old) {
                    $this->auditLogWriter->recordPriorityChange($current, $actor, $old, $current->priority);
                }
            });
    }

    /**
     * Compare and mutate while holding one PostgreSQL Ticket row lock.
     *
     * @return array<string, int|string>|null Current field snapshot on conflict.
     */
    private function apply(Ticket $ticket, string $field, ?int $expectedRevision, Closure $change): ?array
    {
        return DB::transaction(fn () => app(DurableDelivery::class)->capture(function () use ($ticket, $field, $expectedRevision, $change) {
            $current = Ticket::whereKey($ticket->id)->lockForUpdate()->firstOrFail();
            $revisionField = "{$field}_revision";

            if ($expectedRevision !== null && $expectedRevision !== $current->$revisionField) {
                $value = $current->$field;

                return [
                    $field => $value instanceof TicketStatus || $value instanceof TicketPriority
                        ? $value->value : (string) $value,
                    $revisionField => $current->$revisionField,
                    'revision' => $current->revision,
                ];
            }

            $change($current);

            return null;
        }));
    }
}
