<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Models\OrganizationMember;
use App\Models\User;

class MemberNotificationChannel
{
    public function name(int $organizationId, int $memberId): string
    {
        return 'organization.'.$organizationId.'.member.'.$memberId.'.notifications.'.app(OrganizationLiveChannel::class)->generation();
    }

    public function mayJoin(User $user, string $organizationId, string $memberId, string $generation): bool
    {
        return (string) OrganizationContext::getCurrentId() === $organizationId
            && $generation === app(OrganizationLiveChannel::class)->generation()
            && OrganizationMember::withoutGlobalScopes()
                ->whereKey($memberId)
                ->where('organization_id', $organizationId)
                ->where('user_id', $user->id)
                ->exists();
    }
}
