<?php

namespace App\Policies;

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;

class TicketPolicy
{
    /**
     * Determine whether the user can view any tickets within the active organization.
     */
    public function viewAny(User $user, ?Organization $organization = null): bool
    {
        $organization = $organization ?? OrganizationContext::getCurrent();

        if (! $organization) {
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

    /**
     * Determine whether the user can view a specific ticket.
     */
    public function view(User $user, Ticket $ticket): bool
    {
        $organization = OrganizationContext::getCurrent();

        if (! $organization || $ticket->organization_id !== $organization->id) {
            return false;
        }

        return $this->viewAny($user, $organization);
    }

    /**
     * Determine whether the user can update the ticket (status, priority, assignments, tags).
     */
    public function update(User $user, Ticket $ticket): bool
    {
        return $this->view($user, $ticket);
    }

    /**
     * Determine whether the user can soft-delete the ticket (Admins only).
     */
    public function delete(User $user, Ticket $ticket): bool
    {
        $organization = OrganizationContext::getCurrent();

        if (! $organization || $ticket->organization_id !== $organization->id) {
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

        return $role === Role::ADMIN;
    }

    /**
     * Determine whether the user can restore a soft-deleted ticket (Admins only).
     */
    public function restore(User $user, Ticket $ticket): bool
    {
        return $this->delete($user, $ticket);
    }
}
