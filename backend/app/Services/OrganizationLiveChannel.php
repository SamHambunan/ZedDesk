<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\OrganizationMember;
use App\Models\User;

class OrganizationLiveChannel
{
    public function name(int $organizationId): string
    {
        return 'organization.'.$organizationId.'.'.intdiv(now()->timestamp, 300);
    }

    public function mayJoin(User $user, string $organizationId, string $generation): bool
    {
        $organization = OrganizationContext::getCurrent();

        return $organization !== null
            && (string) $organization->id === $organizationId
            && $generation === (string) intdiv(now()->timestamp, 300)
            && OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->where('user_id', $user->id)
                ->exists();
    }
}
