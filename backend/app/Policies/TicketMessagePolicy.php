<?php

namespace App\Policies;

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;

class TicketMessagePolicy
{
    /**
     * Determine whether the user can author messages on the given ticket.
     */
    public function create(User $user, Ticket|TicketMessage $ticket): bool
    {
        $ticketModel = $ticket instanceof TicketMessage ? $ticket->ticket : $ticket;

        if (! $ticketModel) {
            return false;
        }

        $organization = OrganizationContext::getCurrent();

        if (! $organization || $ticketModel->organization_id !== $organization->id) {
            return false;
        }

        $member = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();

        if (! $member) {
            return false;
        }

        $role = $member->role instanceof Role ? $member->role : Role::tryFrom((string) $member->role);

        return in_array($role, [Role::ADMIN, Role::AGENT], true);
    }
}
