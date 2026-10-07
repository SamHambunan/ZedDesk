<?php

namespace App\Services;

use App\Models\Ticket;
use App\Models\User;

class TicketLiveChannel
{
    public function __construct(private OrganizationLiveChannel $organizationChannels) {}

    public function name(string $ticketId): string
    {
        return 'ticket.'.$ticketId.'.'.$this->organizationChannels->generation();
    }

    public function mayJoin(User $user, string $ticketId, string $generation): bool
    {
        $ticket = Ticket::withoutGlobalScopes()->whereKey($ticketId)->whereNull('deleted_at')->first();

        return $ticket !== null
            && $this->organizationChannels->mayJoin($user, (string) $ticket->organization_id, $generation);
    }
}
