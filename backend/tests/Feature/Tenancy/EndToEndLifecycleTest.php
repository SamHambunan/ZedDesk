<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('full end-to-end lifecycle: registration -> org creation -> invitation -> team assignment -> member access', function () {
    // =========================================================================
    // Step 1: Global User Registration on Central Hub
    // =========================================================================
    $registerResponse = $this->postJson('/api/register', [
        'name' => 'Grace Founder',
        'email' => 'grace@gamma.test',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ]);

    $registerResponse->assertStatus(201)
        ->assertJsonStructure(['user', 'token']);

    $founderToken = $registerResponse->json('token');
    $founderUserId = $registerResponse->json('user.id');

    // =========================================================================
    // Step 2: Organization Creation by Authenticated User
    // =========================================================================
    $createOrgResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->postJson('/api/organizations', [
            'name' => 'Gamma Technologies',
            'slug' => 'gamma',
        ]);

    $createOrgResponse->assertStatus(201)
        ->assertJson([
            'organization' => [
                'name' => 'Gamma Technologies',
                'slug' => 'gamma',
            ],
            'role' => Role::ADMIN->value,
        ]);

    $orgId = $createOrgResponse->json('organization.id');

    // =========================================================================
    // Step 3: Access Workspace on Subdomain with Admin Privileges
    // =========================================================================
    $workspaceResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->getJson('http://gamma.localhost/api/workspace');

    $workspaceResponse->assertStatus(200)
        ->assertJson([
            'organization' => [
                'id' => $orgId,
                'name' => 'Gamma Technologies',
                'slug' => 'gamma',
            ],
            'user' => [
                'id' => $founderUserId,
                'email' => 'grace@gamma.test',
            ],
            'role' => Role::ADMIN->value,
        ]);

    // =========================================================================
    // Step 4: Admin Creates Invitation for Colleague
    // =========================================================================
    $invitationResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->postJson('http://gamma.localhost/api/invitations', [
            'email' => 'leo@gamma.test',
            'role' => Role::AGENT->value,
        ]);

    $invitationResponse->assertStatus(201)
        ->assertJsonStructure([
            'message',
            'invitation' => ['id', 'email', 'role', 'token', 'expires_at'],
        ]);

    $invitationToken = $invitationResponse->json('invitation.token');
    $invitationId = $invitationResponse->json('invitation.id');

    // =========================================================================
    // Step 5: Colleague Inspects and Accepts Invitation
    // =========================================================================
    $this->flushHeaders();
    $this->app['auth']->forgetGuards();

    $inspectInvitationResponse = $this->getJson("/api/invitations/{$invitationToken}");
    $inspectInvitationResponse->assertStatus(200)
        ->assertJson([
            'invitation' => [
                'organization_name' => 'Gamma Technologies',
                'organization_slug' => 'gamma',
                'role' => Role::AGENT->value,
                'email' => 'leo@gamma.test',
            ],
        ]);

    $acceptResponse = $this->postJson("/api/invitations/{$invitationToken}/accept", [
        'name' => 'Leo Support',
        'password' => 'SecurePass123!',
        'password_confirmation' => 'SecurePass123!',
    ]);

    $acceptResponse->assertStatus(201)
        ->assertJsonStructure(['token', 'user', 'organization', 'role'])
        ->assertJson([
            'user' => [
                'name' => 'Leo Support',
                'email' => 'leo@gamma.test',
            ],
            'role' => Role::AGENT->value,
        ]);

    $colleagueToken = $acceptResponse->json('token');
    $colleagueUserId = $acceptResponse->json('user.id');

    // =========================================================================
    // Step 6: Admin Creates Team and Assigns Colleague
    // =========================================================================
    $this->flushHeaders();
    $this->app['auth']->forgetGuards();

    $createTeamResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->postJson('http://gamma.localhost/api/teams', [
            'name' => 'Customer Champions',
            'description' => 'First-line responsive support for Gamma customers',
        ]);

    $createTeamResponse->assertStatus(201)
        ->assertJsonPath('team.name', 'Customer Champions');

    $teamId = $createTeamResponse->json('team.id');

    // Find colleague's organization member record
    $membersListResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->getJson('http://gamma.localhost/api/organization-members');

    $membersListResponse->assertStatus(200);
    $leoMember = collect($membersListResponse->json('members'))->firstWhere('user_id', $colleagueUserId);
    expect($leoMember)->not->toBeNull();

    $addMemberResponse = $this->withHeader('Authorization', 'Bearer '.$founderToken)
        ->postJson("http://gamma.localhost/api/teams/{$teamId}/members", [
            'organization_member_id' => $leoMember['id'],
        ]);

    $addMemberResponse->assertStatus(201);

    // =========================================================================
    // Step 7: Colleague Accesses Workspace, Views Team, and Enforces RBAC
    // =========================================================================
    $this->flushHeaders();
    $this->app['auth']->forgetGuards();

    $colleagueWorkspace = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->getJson('http://gamma.localhost/api/workspace');

    $colleagueWorkspace->assertStatus(200)
        ->assertJson([
            'user' => [
                'id' => $colleagueUserId,
                'name' => 'Leo Support',
            ],
            'role' => Role::AGENT->value,
        ]);

    // Colleague lists teams and sees member association
    $colleagueTeams = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->getJson('http://gamma.localhost/api/teams');

    $colleagueTeams->assertStatus(200)
        ->assertJsonFragment(['name' => 'Customer Champions']);

    $championTeam = collect($colleagueTeams->json('teams'))->firstWhere('id', $teamId);
    expect($championTeam)->not->toBeNull()
        ->and($championTeam['members'])->toHaveCount(1)
        ->and($championTeam['members'][0]['user_id'])->toBe($colleagueUserId);

    // RBAC: Colleague (agent) forbidden from admin operations
    $forbiddenCreateTeam = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->postJson('http://gamma.localhost/api/teams', ['name' => 'Illegal Team']);
    $forbiddenCreateTeam->assertStatus(403);

    $forbiddenInvitation = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->postJson('http://gamma.localhost/api/invitations', [
            'email' => 'hacker@gamma.test',
            'role' => Role::AGENT->value,
        ]);
    $forbiddenInvitation->assertStatus(403);

    $forbiddenDeleteTeam = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->deleteJson("http://gamma.localhost/api/teams/{$teamId}");
    $forbiddenDeleteTeam->assertStatus(403);

    // =========================================================================
    // Step 8: Logout & Bearer Token Revocation
    // =========================================================================
    $logoutResponse = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->postJson('/api/logout');

    $logoutResponse->assertStatus(200)
        ->assertJson(['message' => 'Logged out successfully']);

    expect(User::find($colleagueUserId)->tokens()->count())->toBe(0);

    $this->flushHeaders();
    $this->app['auth']->forgetGuards();

    $revokedResponse = $this->withHeader('Authorization', 'Bearer '.$colleagueToken)
        ->getJson('http://gamma.localhost/api/workspace');

    $revokedResponse->assertStatus(401);
});
