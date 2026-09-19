<?php

namespace App\Events;

use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TicketMessageCreated
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Ticket $ticket;

    public function __construct(
        public TicketMessage $message,
        ?Ticket $ticket = null
    ) {
        $this->ticket = $ticket ?? $message->ticket ?? Ticket::withoutGlobalScopes()->findOrFail($message->ticket_id);
    }
}
