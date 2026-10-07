<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Ticket;

class CustomerTicketLiveChannel
{
    public function __construct(private OrganizationLiveChannel $organizationChannels) {}

    public function tokenMatchesTicket(array $payload, string $ticketId): bool
    {
        return isset($payload['ticket_id']) && $payload['ticket_id'] === $ticketId;
    }

    public function name(string $ticketId): string
    {
        return 'customer.ticket.'.$ticketId.'.'.$this->organizationChannels->generation();
    }

    public function mayJoin(Customer $customer, string $ticketId, string $generation): bool
    {
        $organization = OrganizationContext::getCurrent();

        return $organization !== null
            && (int) $organization->id === (int) $customer->organization_id
            && $generation === $this->organizationChannels->generation()
            && Ticket::withoutGlobalScopes()
                ->whereKey($ticketId)
                ->where('organization_id', $organization->id)
                ->where('customer_id', $customer->id)
                ->whereNull('deleted_at')
                ->exists();
    }
}
