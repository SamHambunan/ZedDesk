<?php

namespace App\Events;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TicketStatusChanged
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Ticket $ticket,
        public TicketStatus|string|null $previousStatus = null,
        public TicketStatus|string|null $newStatus = null
    ) {}
}
