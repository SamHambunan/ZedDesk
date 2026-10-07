<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\OrganizationMember;
use App\Models\User;

class OrganizationLiveChannel
{
    public function name(int $organizationId): string
    {
        return 'organization.'.$organizationId.'.'.$this->generation();
    }

    public function mayJoin(User $user, string $organizationId, string $generation): bool
    {
        $organization = OrganizationContext::getCurrent();

        return $organization !== null
            && (string) $organization->id === $organizationId
            && $generation === $this->generation()
            && OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->where('user_id', $user->id)
                ->exists();
    }

    private function generation(): string
    {
        return (string) intdiv(now()->timestamp, 300);
    }
}
