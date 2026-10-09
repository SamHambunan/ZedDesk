<?php

namespace App\Broadcasting;

use App\Services\OrganizationLiveChannel;
use Laravel\Reverb\Contracts\Connection;
use Laravel\Reverb\Protocols\Pusher\Channels\PresenceChannel;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;

class TicketViewingPresenceChannel extends PresenceChannel
{
    public function subscribe(Connection $connection, ?string $auth = null, ?string $data = null): void
    {
        if (! $this->isCurrentGeneration()) {
            throw new ConnectionUnauthorized;
        }

        parent::subscribe($connection, $auth, $data);
    }

    protected function broadcastMemberAdded(Connection $connection, array $userData): void
    {
        if ($this->isCurrentGeneration()) {
            parent::broadcastMemberAdded($connection, $userData);
        }
    }

    protected function broadcastMemberRemoved(Connection $connection, int|string $userId): void
    {
        if ($this->isCurrentGeneration()) {
            parent::broadcastMemberRemoved($connection, $userId);
        }
    }

    private function isCurrentGeneration(): bool
    {
        return str_ends_with($this->name(), '.'.app(OrganizationLiveChannel::class)->generation());
    }
}
