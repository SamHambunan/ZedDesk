<?php

namespace App\Events;

use App\Models\Ticket;
use App\Services\OrganizationLiveChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

class TicketCreated implements ShouldBroadcast
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

    public function __construct(
        public Ticket $ticket
    ) {
        $this->eventId = (string) Str::uuid();
        $this->organizationId = (int) $ticket->organization_id;
        $this->ticketId = $ticket->id;
        $this->revision = (int) $ticket->revision;
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel(app(OrganizationLiveChannel::class)->name($this->organizationId))];
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
            'change_type' => 'created',
            'revision' => $this->revision,
        ];
    }
}
