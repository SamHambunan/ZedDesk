<?php

namespace App\Broadcasting;

use App\Services\OrganizationLiveChannel;
use Laravel\Reverb\Events\ChannelCreated;
use Laravel\Reverb\Protocols\Pusher\Channels\Channel;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;
use Laravel\Reverb\Protocols\Pusher\Managers\ArrayChannelManager;

class OrganizationPresenceChannelManager extends ArrayChannelManager
{
    public function remove(Channel $channel): void
    {
        if ($channel instanceof GracefulOrganizationPresenceChannel) {
            return;
        }

        parent::remove($channel);
    }

    public function retire(GracefulOrganizationPresenceChannel $channel): void
    {
        parent::remove($channel);
    }

    public function findOrCreate(string $channelName): Channel
    {
        if (! preg_match('/^presence-organization\.\d+\.members\.(\d+)$/', $channelName, $matches)) {
            return parent::findOrCreate($channelName);
        }

        if ($matches[1] !== app(OrganizationLiveChannel::class)->generation()) {
            throw new ConnectionUnauthorized;
        }

        if ($channel = $this->find($channelName)) {
            return $channel;
        }

        $channel = new GracefulOrganizationPresenceChannel($channelName);
        $this->applications[$this->application->id()][$channelName] = $channel;
        ChannelCreated::dispatch($channel);

        return $channel;
    }
}
