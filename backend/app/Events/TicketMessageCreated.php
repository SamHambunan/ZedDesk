<?php

namespace App\Events;

use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Services\TicketLiveChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

class TicketMessageCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public bool $afterCommit = true;

    public int $tries = 5;

    public int $backoff = 3;

    public string $broadcastQueue = 'broadcasts';

    public string $eventId;

    public int $organizationId;

    public string $ticketId;

    public int $revision;

    public Ticket $ticket;

    public function __construct(
        public TicketMessage $message,
        ?Ticket $ticket = null
    ) {
        $this->ticket = $ticket ?? $message->ticket ?? Ticket::withoutGlobalScopes()->findOrFail($message->ticket_id);
        $this->eventId = (string) Str::uuid();
        $this->organizationId = (int) $this->ticket->organization_id;
        $this->ticketId = $this->ticket->id;
        $this->revision = (int) $this->ticket->revision;
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel(app(TicketLiveChannel::class)->name($this->ticketId))];
    }

    public function broadcastAs(): string
    {
        return 'ticket.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'event_id' => $this->eventId,
            'organization_id' => $this->organizationId,
            'ticket_id' => $this->ticketId,
            'change_type' => 'message_created',
            'revision' => $this->revision,
        ];
    }
}
