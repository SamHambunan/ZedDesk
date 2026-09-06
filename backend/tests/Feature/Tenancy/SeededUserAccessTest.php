<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;

uses(RefreshDatabase::class);

beforeEach(function () {
    Artisan::call('db:seed');
    $this->acmeOrg = Organization::where('slug', 'acme')->first();
    $this->tier1Team = Team::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->where('name', 'Support Tier 1')
        ->first();
});

test('seeded admin can log in and access acme workspace with full administrative privileges', function () {
    // 1. Log in with seeded admin credentials
    $loginResponse = $this->postJson('/api/login', [
        'email' => 'admin@acme.test',
        'password' => 'password',
    ]);

    $loginResponse->assertStatus(200)
        ->assertJsonStructure(['user', 'token']);

    $token = $loginResponse->json('token');
    $authHeader = ['Authorization' => 'Bearer '.$token];

    // 2. Access workspace
    $workspaceResponse = $this->withHeaders($authHeader)
        ->getJson('http://acme.localhost/api/workspace');

    $workspaceResponse->assertStatus(200)
        ->assertJson([
            'organization' => [
                'id' => $this->acmeOrg->id,
                'slug' => 'acme',
            ],
            'user' => [
                'email' => 'admin@acme.test',
            ],
            'role' => Role::ADMIN->value,
        ]);

    // 3. Admin can list members
    $membersResponse = $this->withHeaders($authHeader)
        ->getJson('http://acme.localhost/api/organization-members');
    $membersResponse->assertStatus(200);

    // 4. Admin can invite new members and revoke invitations
    $invitationResponse = $this->withHeaders($authHeader)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'newhire@acme.test',
            'role' => Role::AGENT->value,
        ]);
    $invitationResponse->assertStatus(201);
    $invitationId = $invitationResponse->json('invitation.id');

    $listInvitationsResponse = $this->withHeaders($authHeader)
        ->getJson('http://acme.localhost/api/invitations');
    $listInvitationsResponse->assertStatus(200);

    $revokeResponse = $this->withHeaders($authHeader)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitationId}");
    $revokeResponse->assertStatus(200);

    // 5. Admin can create, update, and manage teams
    $createTeamResponse = $this->withHeaders($authHeader)
        ->postJson('http://acme.localhost/api/teams', [
            'name' => 'DevOps Support',
            'description' => 'Infrastructure and operations assistance',
        ]);
    $createTeamResponse->assertStatus(201);
    $teamId = $createTeamResponse->json('team.id');

    $updateTeamResponse = $this->withHeaders($authHeader)
        ->putJson("http://acme.localhost/api/teams/{$teamId}", [
            'name' => 'Platform Support',
            'description' => 'Platform and site reliability',
        ]);
    $updateTeamResponse->assertStatus(200)
        ->assertJsonPath('team.name', 'Platform Support');

    $adminMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->where('user_id', $loginResponse->json('user.id'))
        ->first();

    $addMemberResponse = $this->withHeaders($authHeader)
        ->postJson("http://acme.localhost/api/teams/{$teamId}/members", [
            'organization_member_id' => $adminMember->id,
        ]);
    $addMemberResponse->assertStatus(201);

    $removeMemberResponse = $this->withHeaders($authHeader)
        ->deleteJson("http://acme.localhost/api/teams/{$teamId}/members/{$adminMember->id}");
    $removeMemberResponse->assertStatus(200);

    $deleteTeamResponse = $this->withHeaders($authHeader)
        ->deleteJson("http://acme.localhost/api/teams/{$teamId}");
    $deleteTeamResponse->assertStatus(200);
});

test('seeded agent can log in and access acme workspace with agent privileges only', function () {
    // 1. Log in with seeded agent credentials
    $loginResponse = $this->postJson('/api/login', [
        'email' => 'agent@acme.test',
        'password' => 'password',
    ]);

    $loginResponse->assertStatus(200)
        ->assertJsonStructure(['user', 'token']);

    $token = $loginResponse->json('token');
    $authHeader = ['Authorization' => 'Bearer '.$token];

    // 2. Access workspace
    $workspaceResponse = $this->withHeaders($authHeader)
        ->getJson('http://acme.localhost/api/workspace');

    $workspaceResponse->assertStatus(200)
        ->assertJson([
            'organization' => [
                'id' => $this->acmeOrg->id,
                'slug' => 'acme',
            ],
            'user' => [
                'email' => 'agent@acme.test',
            ],
            'role' => Role::AGENT->value,
        ]);

    // 3. Agent can view teams and single team
    $listTeamsResponse = $this->withHeaders($authHeader)
        ->getJson('http://acme.localhost/api/teams');
    $listTeamsResponse->assertStatus(200)
        ->assertJsonFragment(['name' => 'Support Tier 1']);

    $showTeamResponse = $this->withHeaders($authHeader)
        ->getJson("http://acme.localhost/api/teams/{$this->tier1Team->id}");
    $showTeamResponse->assertStatus(200)
        ->assertJsonPath('team.name', 'Support Tier 1');

    // 4. Agent is forbidden from creating, updating, or deleting teams
    $createTeamResponse = $this->withHeaders($authHeader)
        ->postJson('http://acme.localhost/api/teams', [
            'name' => 'Unauthorized Team',
        ]);
    $createTeamResponse->assertStatus(403);

    $updateTeamResponse = $this->withHeaders($authHeader)
        ->putJson("http://acme.localhost/api/teams/{$this->tier1Team->id}", [
            'name' => 'Hacked Name',
        ]);
    $updateTeamResponse->assertStatus(403);

    $deleteTeamResponse = $this->withHeaders($authHeader)
        ->deleteJson("http://acme.localhost/api/teams/{$this->tier1Team->id}");
    $deleteTeamResponse->assertStatus(403);

    // 5. Agent is forbidden from modifying team members
    $addMemberResponse = $this->withHeaders($authHeader)
        ->postJson("http://acme.localhost/api/teams/{$this->tier1Team->id}/members", [
            'user_id' => $loginResponse->json('user.id'),
        ]);
    $addMemberResponse->assertStatus(403);

    // 6. Agent is forbidden from managing invitations
    $createInvitationResponse = $this->withHeaders($authHeader)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'unauthorized@acme.test',
            'role' => Role::AGENT->value,
        ]);
    $createInvitationResponse->assertStatus(403);
});
