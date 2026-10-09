<?php

namespace App\Broadcasting;

use App\Services\OrganizationLiveChannel;
use Laravel\Reverb\Contracts\Connection;
use Laravel\Reverb\Protocols\Pusher\Channels\PresenceChannel;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;
use React\EventLoop\Loop;
use React\EventLoop\TimerInterface;

class TicketViewingPresenceChannel extends PresenceChannel
{
    /** @var array<string, TimerInterface> */
    private array $typingTimers = [];

    public function broadcast(array $payload, ?Connection $except = null): void
    {
        if (! str_starts_with($payload['event'] ?? '', 'client-')) {
            parent::broadcast($payload, $except);

            return;
        }

        $memberId = $except === null ? null : $this->find($except)?->data('user_id');

        if (! $this->isCurrentGeneration()
            || $payload['event'] !== 'client-typing'
            || ! is_bool($payload['data']['typing'] ?? null)
            || $memberId === null) {
            return;
        }

        $memberId = (string) $memberId;
        if (isset($this->typingTimers[$memberId])) {
            Loop::cancelTimer($this->typingTimers[$memberId]);
            unset($this->typingTimers[$memberId]);
        }

        if ($payload['data']['typing']) {
            $this->typingTimers[$memberId] = Loop::addTimer(
                \App\Services\TicketViewingPresenceChannel::TYPING_EXPIRES_AFTER_SECONDS,
                function () use ($memberId, $except): void {
                    unset($this->typingTimers[$memberId]);
                    if ($this->isCurrentGeneration() && $this->userIsSubscribed($memberId)) {
                        parent::broadcast([
                            'event' => 'client-typing',
                            'channel' => $this->name(),
                            'data' => ['typing' => false],
                            'user_id' => $memberId,
                        ], $this->find($except) === null ? null : $except);
                    }
                }
            );
        }

        parent::broadcast([
            'event' => 'client-typing',
            'channel' => $this->name(),
            'data' => ['typing' => $payload['data']['typing']],
            'user_id' => $memberId,
        ], $except);
    }

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
