<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $teams = Team::where('organization_id', $organization->id)
            ->with(['members.user'])
            ->latest()
            ->get()
            ->map(fn (Team $team) => $this->formatTeam($team));

        return response()->json(['teams' => $teams]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage teams.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('teams', 'name')->where('organization_id', $organization->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $team = Team::create([
            'organization_id' => $organization->id,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json([
            'message' => 'Team created successfully.',
            'team' => $this->formatTeam($team->load('members.user')),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $team = Team::where('organization_id', $organization->id)
            ->with(['members.user'])
            ->find($id);

        if (! $team) {
            return response()->json(['message' => 'Team not found.'], 404);
        }

        return response()->json(['team' => $this->formatTeam($team)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage teams.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $team = Team::where('organization_id', $organization->id)->find($id);

        if (! $team) {
            return response()->json(['message' => 'Team not found.'], 404);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('teams', 'name')
                    ->where('organization_id', $organization->id)
                    ->ignore($team->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $team->update($validated);

        return response()->json([
            'message' => 'Team updated successfully.',
            'team' => $this->formatTeam($team->fresh('members.user')),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage teams.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $team = Team::where('organization_id', $organization->id)->find($id);

        if (! $team) {
            return response()->json(['message' => 'Team not found.'], 404);
        }

        $team->delete();

        return response()->json(['message' => 'Team deleted successfully.']);
    }

    public function addMember(Request $request, int $teamId): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage team members.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $team = Team::where('organization_id', $organization->id)->find($teamId);

        if (! $team) {
            return response()->json(['message' => 'Team not found.'], 404);
        }

        $request->validate([
            'organization_member_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
        ]);

        $memberId = $request->input('organization_member_id');
        $userId = $request->input('user_id');

        if (! $memberId && ! $userId) {
            return response()->json([
                'message' => 'Either organization_member_id or user_id must be provided.',
                'errors' => ['organization_member_id' => ['Either organization_member_id or user_id must be provided.']],
            ], 422);
        }

        $query = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id);

        if ($memberId) {
            $query->where('id', $memberId);
        } else {
            $query->where('user_id', $userId);
        }

        $member = $query->first();

        $errorKey = $memberId ? 'organization_member_id' : 'user_id';

        if (! $member) {
            return response()->json([
                'message' => 'The member does not belong to this organization.',
                'errors' => [$errorKey => ['The member does not belong to this organization.']],
            ], 422);
        }

        if ($team->members()->where('organization_member_id', $member->id)->exists()) {
            return response()->json([
                'message' => 'The member is already assigned to this team.',
                'errors' => [$errorKey => ['The member is already assigned to this team.']],
            ], 422);
        }

        $team->members()->attach($member->id);

        return response()->json([
            'message' => 'Member added to team successfully.',
            'team' => $this->formatTeam($team->fresh('members.user')),
        ], 201);
    }

    public function removeMember(Request $request, int $teamId, int $memberId): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage team members.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $team = Team::where('organization_id', $organization->id)->find($teamId);

        if (! $team) {
            return response()->json(['message' => 'Team not found.'], 404);
        }

        $teamMember = $team->members()
            ->where('organization_members.id', $memberId)
            ->first();

        if (! $teamMember) {
            return response()->json(['message' => 'Member not found in this team.'], 404);
        }

        $team->members()->detach($teamMember->id);

        return response()->json([
            'message' => 'Member removed from team successfully.',
            'team' => $this->formatTeam($team->fresh('members.user')),
        ]);
    }

    private function isAdmin(Request $request): bool
    {
        $role = $request->attributes->get('role');
        $roleValue = $role instanceof Role ? $role->value : (string) $role;

        return $roleValue === Role::ADMIN->value;
    }

    private function formatTeam(Team $team): array
    {
        return [
            'id' => $team->id,
            'organization_id' => $team->organization_id,
            'name' => $team->name,
            'description' => $team->description,
            'created_at' => $team->created_at?->toISOString(),
            'updated_at' => $team->updated_at?->toISOString(),
            'members' => $team->members->map(function (OrganizationMember $member) {
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
            })->values()->all(),
        ];
    }
}
