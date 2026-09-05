<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationMemberController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $members = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->with('user')
            ->get()
            ->map(function (OrganizationMember $member) {
                $role = $member->role instanceof Role ? $member->role->value : (string) $member->role;

                return [
                    'id' => $member->id,
                    'organization_id' => $member->organization_id,
                    'user_id' => $member->user_id,
                    'role' => $role,
                    'user' => $member->user ? [
                        'id' => $member->user->id,
                        'name' => $member->user->name,
                        'email' => $member->user->email,
                    ] : null,
                ];
            });

        return response()->json([
            'organization_members' => $members,
            'members' => $members,
        ]);
    }
}
