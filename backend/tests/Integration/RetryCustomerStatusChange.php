<?php

namespace Tests\Integration;

use App\Models\Ticket;
use App\Services\TicketStateMachine;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class RetryCustomerStatusChange implements ShouldQueue
{
    use InteractsWithQueue, Queueable;

    public int $tries = 3;

    public int $backoff = 1;

    public function __construct(public string $ticketId)
    {
        $this->onQueue('broadcasts');
    }

    public function handle(TicketStateMachine $states): void
    {
        if ($this->attempts() === 1) {
            throw new \RuntimeException('Simulated transient worker failure');
        }

        $ticket = Ticket::withoutGlobalScopes()->findOrFail($this->ticketId);
        $states->transitionTo($ticket, 'resolved');
    }
}
