<?php

namespace App\Events;

use App\Services\MemberNotificationChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Str;

class MemberInboxChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    public bool $afterCommit = true;

    public int $tries = 5;

    public int $backoff = 3;

    public string $broadcastQueue = 'broadcasts';

    public string $eventId;

    public function __construct(
        public int $organizationId,
        public int $recipientMemberId
    ) {
        $this->eventId = (string) Str::uuid();
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel(app(MemberNotificationChannel::class)->name($this->organizationId, $this->recipientMemberId))];
    }

    public function broadcastAs(): string
    {
        return 'inbox.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'event_id' => $this->eventId,
            'organization_id' => $this->organizationId,
            'recipient_member_id' => $this->recipientMemberId,
        ];
    }
}
