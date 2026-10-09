<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\OrganizationMember;
use App\Models\User;

class OrganizationPresenceChannel
{
    public const OFFLINE_GRACE_SECONDS = 30;

    public function __construct(private OrganizationLiveChannel $organizationChannels) {}

    public function name(int $organizationId): string
    {
        return 'organization.'.$organizationId.'.members.'.$this->organizationChannels->generation();
    }

    public function memberFor(User $user): ?OrganizationMember
    {
        $organization = OrganizationContext::getCurrent();

        return $organization === null ? null : OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();
    }

    public function mayJoin(User $user, string $organizationId, string $generation): array|false
    {
        $organization = OrganizationContext::getCurrent();
        if ($organization === null
            || (string) $organization->id !== $organizationId
            || $generation !== $this->organizationChannels->generation()) {
            return false;
        }

        $member = $this->memberFor($user);
        if ($member === null) {
            return false;
        }

        return ['member_id' => $member->id, 'name' => $user->name];
    }
}
