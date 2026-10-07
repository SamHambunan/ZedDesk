<?php

namespace App\Events;

use App\Models\Ticket;
use App\Services\CustomerTicketLiveChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Str;

class CustomerTicketChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    public const MESSAGE_CREATED = 'message_created';

    public const STATUS_CHANGED = 'status_changed';

    public const DELETED = 'deleted';

    public bool $afterCommit = true;

    public int $tries = 5;

    public int $backoff = 3;

    public string $broadcastQueue = 'broadcasts';

    public string $eventId;

    public string $ticketId;

    public int $organizationId;

    public string $customerId;

    public int $revision;

    public ?string $deletionChannel = null;

    public function __construct(Ticket $ticket, public string $changeType)
    {
        $current = Ticket::withoutGlobalScopes()->withTrashed()->findOrFail($ticket->id);
        $this->eventId = (string) Str::uuid();
        $this->ticketId = $current->id;
        $this->organizationId = (int) $current->organization_id;
        $this->customerId = (string) $current->customer_id;
        $this->revision = (int) $current->revision;
        if ($changeType === self::DELETED) {
            // This contains no Ticket data. Preserve the channel that held live subscribers at deletion.
            $this->deletionChannel = app(CustomerTicketLiveChannel::class)->name($this->ticketId);
        }
    }

    public function broadcastOn(): array
    {
        $ticket = Ticket::withoutGlobalScopes()->withTrashed()->find($this->ticketId);
        if (! $ticket
            || (int) $ticket->organization_id !== $this->organizationId
            || (string) $ticket->customer_id !== $this->customerId
            || ($this->changeType === self::DELETED) !== $ticket->trashed()) {
            return [];
        }

        return [new PrivateChannel($this->deletionChannel ?? app(CustomerTicketLiveChannel::class)->name($this->ticketId))];
    }

    public function broadcastAs(): string
    {
        return $this->changeType === self::DELETED ? 'ticket.unavailable' : 'ticket.changed';
    }

    public function broadcastWith(): array
    {
        if ($this->changeType === self::DELETED) {
            return [];
        }

        return [
            'event_id' => $this->eventId,
            'organization_id' => $this->organizationId,
            'ticket_id' => $this->ticketId,
            'change_type' => $this->changeType,
            'revision' => $this->revision,
        ];
    }
}
