<?php

namespace App\Services;

use App\Models\User;

class TicketViewingPresenceChannel
{
    public function __construct(
        private TicketLiveChannel $ticketChannels,
        private OrganizationPresenceChannel $organizationPresence,
        private OrganizationLiveChannel $organizationChannels,
    ) {}

    public function name(string $ticketId): string
    {
        return 'ticket.'.$ticketId.'.viewers.'.$this->organizationChannels->generation();
    }

    public function mayJoin(User $user, string $ticketId, string $generation): array|false
    {
        if (! $this->ticketChannels->mayJoin($user, $ticketId, $generation)) {
            return false;
        }

        $member = $this->organizationPresence->memberFor($user);

        return $member === null ? false : ['member_id' => $member->id, 'name' => $user->name];
    }
}
