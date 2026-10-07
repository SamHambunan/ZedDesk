<?php

namespace App\Events;

use App\Models\Ticket;
use App\Services\OrganizationLiveChannel;
use App\Services\TicketLiveChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Str;

class TicketChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    public const STATUS_CHANGED = 'status_changed';

    public const ASSIGNMENT_CHANGED = 'assignment_changed';

    public bool $afterCommit = true;

    public int $tries = 5;

    public int $backoff = 3;

    public string $broadcastQueue = 'broadcasts';

    public string $eventId;

    public int $organizationId;

    public string $ticketId;

    public int $revision;

    public function __construct(Ticket $ticket, public string $changeType)
    {
        $current = $ticket->fresh();
        $this->eventId = (string) Str::uuid();
        $this->organizationId = (int) $current->organization_id;
        $this->ticketId = $current->id;
        $this->revision = (int) $current->revision;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel(app(OrganizationLiveChannel::class)->name($this->organizationId)),
            new PrivateChannel(app(TicketLiveChannel::class)->name($this->ticketId)),
        ];
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
            'change_type' => $this->changeType,
            'revision' => $this->revision,
        ];
    }
}
