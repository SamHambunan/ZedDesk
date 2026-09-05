<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Enum;

class InvitationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage invitations.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $invitations = Invitation::where('organization_id', $organization->id)
            ->pending()
            ->with('invitedByUser:id,name,email')
            ->latest()
            ->get()
            ->map(fn (Invitation $invitation) => [
                'id' => $invitation->id,
                'email' => $invitation->email,
                'role' => $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role,
                'token' => $invitation->token,
                'expires_at' => $invitation->expires_at->toISOString(),
                'created_at' => $invitation->created_at->toISOString(),
                'invited_by' => $invitation->invitedByUser ? [
                    'id' => $invitation->invitedByUser->id,
                    'name' => $invitation->invitedByUser->name,
                    'email' => $invitation->invitedByUser->email,
                ] : null,
            ]);

        return response()->json(['invitations' => $invitations]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage invitations.'], 403);
        }

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'role' => ['required', new Enum(Role::class)],
        ]);

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');
        $normalizedEmail = strtolower(trim($validated['email']));

        $isMember = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->whereHas('user', fn ($query) => $query->whereRaw('LOWER(email) = ?', [$normalizedEmail]))
            ->exists();

        if ($isMember) {
            return response()->json([
                'message' => 'This user is already an Organization Member of this Organization.',
                'errors' => [
                    'email' => ['This user is already an Organization Member of this Organization.'],
                ],
            ], 422);
        }

        $hasPending = Invitation::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->whereRaw('LOWER(email) = ?', [$normalizedEmail])
            ->pending()
            ->exists();

        if ($hasPending) {
            return response()->json([
                'message' => 'A pending Invitation already exists for this email address.',
                'errors' => [
                    'email' => ['A pending Invitation already exists for this email address.'],
                ],
            ], 422);
        }

        $invitation = Invitation::create([
            'organization_id' => $organization->id,
            'email' => $normalizedEmail,
            'role' => $validated['role'],
            'token' => Str::random(64),
            'expires_at' => now()->addDays(7),
            'invited_by_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Invitation created successfully.',
            'invitation' => [
                'id' => $invitation->id,
                'email' => $invitation->email,
                'role' => $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role,
                'token' => $invitation->token,
                'expires_at' => $invitation->expires_at->toISOString(),
                'created_at' => $invitation->created_at->toISOString(),
            ],
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return response()->json(['message' => 'Forbidden. Only admins can manage invitations.'], 403);
        }

        /** @var Organization $organization */
        $organization = $request->attributes->get('organization');

        $invitation = Invitation::where('organization_id', $organization->id)->find($id);

        if (! $invitation) {
            return response()->json(['message' => 'Invitation not found.'], 404);
        }

        if ($invitation->isAccepted()) {
            return response()->json(['message' => 'Cannot revoke an invitation that has already been accepted.'], 422);
        }

        if ($invitation->isRevoked()) {
            return response()->json(['message' => 'This invitation has already been revoked.'], 422);
        }

        if ($invitation->isExpired()) {
            return response()->json(['message' => 'Cannot revoke an invitation that has already expired.'], 422);
        }

        $invitation->update(['revoked_at' => now()]);

        return response()->json(['message' => 'Invitation revoked successfully.']);
    }

    public function show(string $token): JsonResponse
    {
        $invitationOrResponse = $this->findInvitationByToken($token);
        if ($invitationOrResponse instanceof JsonResponse) {
            return $invitationOrResponse;
        }
        $invitation = $invitationOrResponse;

        return response()->json([
            'invitation' => [
                'email' => $invitation->email,
                'role' => $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role,
                'organization_name' => $invitation->organization->name,
                'organization_slug' => $invitation->organization->slug,
                'expires_at' => $invitation->expires_at->toISOString(),
            ],
        ]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $invitationOrResponse = $this->findInvitationByToken($token);
        if ($invitationOrResponse instanceof JsonResponse) {
            return $invitationOrResponse;
        }
        $invitation = $invitationOrResponse;

        $user = auth('sanctum')->user() ?? $request->user('sanctum');

        if ($user) {
            if (strtolower($user->email) !== strtolower($invitation->email)) {
                return response()->json([
                    'message' => 'The authenticated user email does not match this invitation.',
                ], 403);
            }

            $alreadyMember = OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', $invitation->organization_id)
                ->where('user_id', $user->id)
                ->exists();

            if ($alreadyMember) {
                return response()->json([
                    'message' => 'You are already an Organization Member of this Organization.',
                ], 422);
            }

            DB::transaction(function () use ($invitation, $user) {
                OrganizationMember::create([
                    'organization_id' => $invitation->organization_id,
                    'user_id' => $user->id,
                    'role' => $invitation->role,
                ]);

                $invitation->update(['accepted_at' => now()]);
            });

            return response()->json([
                'message' => 'Invitation accepted successfully.',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                ],
                'organization' => [
                    'id' => $invitation->organization->id,
                    'name' => $invitation->organization->name,
                    'slug' => $invitation->organization->slug,
                ],
                'role' => $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role,
            ]);
        }

        // Unauthenticated flow
        $existingUser = User::whereRaw('LOWER(email) = ?', [strtolower($invitation->email)])->first();
        if ($existingUser) {
            return response()->json([
                'message' => 'A User with this email already exists. Please authenticate before accepting the invitation.',
            ], 422);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $newUser = DB::transaction(function () use ($invitation, $validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => strtolower($invitation->email),
                'password' => Hash::make($validated['password']),
            ]);

            OrganizationMember::create([
                'organization_id' => $invitation->organization_id,
                'user_id' => $user->id,
                'role' => $invitation->role,
            ]);

            $invitation->update(['accepted_at' => now()]);

            return $user;
        });

        $token = $newUser->createToken('auth-token')->plainTextToken;

        return response()->json([
            'message' => 'Invitation accepted successfully.',
            'token' => $token,
            'user' => [
                'id' => $newUser->id,
                'name' => $newUser->name,
                'email' => $newUser->email,
            ],
            'organization' => [
                'id' => $invitation->organization->id,
                'name' => $invitation->organization->name,
                'slug' => $invitation->organization->slug,
            ],
            'role' => $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role,
        ], 201);
    }

    private function isAdmin(Request $request): bool
    {
        $role = $request->attributes->get('role');
        $roleValue = $role instanceof Role ? $role->value : (string) $role;

        return $roleValue === Role::ADMIN->value;
    }

    private function findInvitationByToken(string $token): Invitation|JsonResponse
    {
        $invitation = Invitation::withoutGlobalScopes()
            ->with('organization')
            ->where('token', $token)
            ->first();

        if (! $invitation) {
            return response()->json(['message' => 'Invitation not found.'], 404);
        }

        if ($invitation->isRevoked()) {
            return response()->json(['message' => 'This invitation has been revoked.'], 410);
        }

        if ($invitation->isAccepted()) {
            return response()->json(['message' => 'This invitation has already been accepted.'], 422);
        }

        if ($invitation->isExpired()) {
            return response()->json(['message' => 'This invitation has expired.'], 410);
        }

        return $invitation;
    }
}
