<?php

namespace App\Broadcasting;

use App\Services\OrganizationLiveChannel;
use App\Services\OrganizationPresenceChannel;
use Laravel\Reverb\Contracts\Connection;
use Laravel\Reverb\Protocols\Pusher\Channels\PresenceChannel;
use Laravel\Reverb\Protocols\Pusher\Contracts\ChannelManager;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;
use React\EventLoop\Loop;
use React\EventLoop\TimerInterface;

class GracefulOrganizationPresenceChannel extends PresenceChannel
{
    /** @var array<string, TimerInterface> */
    private array $pendingDepartures = [];

    /** @var array<string, array> */
    private array $memberInfo = [];

    public function subscribe(Connection $connection, ?string $auth = null, ?string $data = null): void
    {
        if (! $this->isCurrentGeneration()) {
            throw new ConnectionUnauthorized;
        }

        parent::subscribe($connection, $auth, $data);
    }

    public function unsubscribe(Connection $connection): void
    {
        parent::unsubscribe($connection);
        $this->retireWhenEmpty($connection);
    }

    public function data(): array
    {
        $data = parent::data();
        foreach ($this->pendingDepartures as $memberId => $timer) {
            if (in_array((string) $memberId, array_map('strval', $data['presence']['ids']), true)) {
                continue;
            }

            $data['presence']['ids'][] = (string) $memberId;
            $data['presence']['hash'][$memberId] = $this->memberInfo[$memberId] ?? [];
            $data['presence']['count']++;
        }

        return $data;
    }

    protected function broadcastMemberAdded(Connection $connection, array $userData): void
    {
        $memberId = (string) ($userData['user_id'] ?? '');
        $this->memberInfo[$memberId] = $userData['user_info'] ?? [];
        if (isset($this->pendingDepartures[$memberId])) {
            Loop::cancelTimer($this->pendingDepartures[$memberId]);
            unset($this->pendingDepartures[$memberId]);

            return;
        }

        if ($this->isCurrentGeneration()) {
            parent::broadcastMemberAdded($connection, $userData);
        }
    }

    protected function broadcastMemberRemoved(Connection $connection, int|string $userId): void
    {
        $memberId = (string) $userId;
        $this->pendingDepartures[$memberId] = Loop::addTimer(
            OrganizationPresenceChannel::OFFLINE_GRACE_SECONDS,
            function () use ($connection, $memberId, $userId): void {
                unset($this->pendingDepartures[$memberId]);
                if (! $this->userIsSubscribed($memberId)) {
                    if ($this->isCurrentGeneration()) {
                        parent::broadcastMemberRemoved($connection, $userId);
                    }
                    unset($this->memberInfo[$memberId]);
                    $this->retireWhenEmpty($connection);
                }
            }
        );
    }

    private function isCurrentGeneration(): bool
    {
        return str_ends_with($this->name(), '.'.app(OrganizationLiveChannel::class)->generation());
    }

    private function retireWhenEmpty(Connection $connection): void
    {
        if ($this->connections->isEmpty() && $this->pendingDepartures === []) {
            $manager = app(ChannelManager::class)->for($connection->app());
            if ($manager instanceof PresenceChannelManager) {
                $manager->retire($this);
            }
        }
    }
}
