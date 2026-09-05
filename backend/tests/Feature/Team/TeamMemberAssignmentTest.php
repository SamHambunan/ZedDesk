<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->adminUser = User::create([
        'name' => 'Acme Admin',
        'email' => 'admin@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->agentUser1 = User::create([
        'name' => 'Acme Agent 1',
        'email' => 'agent1@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->agentUser2 = User::create([
        'name' => 'Acme Agent 2',
        'email' => 'agent2@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->otherOrgUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.test',
        'password' => Hash::make('password123'),
    ]);

    $this->unaffiliatedUser = User::create([
        'name' => 'Unaffiliated Person',
        'email' => 'lonely@outside.test',
        'password' => Hash::make('password123'),
    ]);

    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);

    $this->acmeAdminMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->adminUser->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->acmeAgentMember1 = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->agentUser1->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeAgentMember2 = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->agentUser2->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->otherOrgUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->adminToken = $this->adminUser->createToken('admin-token')->plainTextToken;
    $this->agentToken = $this->agentUser1->createToken('agent-token')->plainTextToken;
    $this->otherOrgToken = $this->otherOrgUser->createToken('beta-token')->plainTextToken;

    $this->team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support Engineers',
        'description' => 'Handles technical questions',
    ]);
});

test('admin can add an organization member to a team', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'organization_member_id' => $this->acmeAgentMember1->id,
        ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'message',
            'team' => [
                'id',
                'name',
                'members',
            ],
        ]);

    $this->assertDatabaseHas('team_members', [
        'team_id' => $this->team->id,
        'organization_member_id' => $this->acmeAgentMember1->id,
    ]);

    expect($this->team->fresh()->members)->toHaveCount(1);
});

test('admin can add member using user_id if organization member belongs to the organization', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'user_id' => $this->agentUser2->id,
        ]);

    $response->assertStatus(201);

    $this->assertDatabaseHas('team_members', [
        'team_id' => $this->team->id,
        'organization_member_id' => $this->acmeAgentMember2->id,
    ]);
});

test('admin can remove an organization member from a team', function () {
    $this->team->members()->attach($this->acmeAgentMember1->id);

    $this->assertDatabaseHas('team_members', [
        'team_id' => $this->team->id,
        'organization_member_id' => $this->acmeAgentMember1->id,
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$this->team->id}/members/{$this->acmeAgentMember1->id}");

    $response->assertStatus(200);

    $this->assertDatabaseMissing('team_members', [
        'team_id' => $this->team->id,
        'organization_member_id' => $this->acmeAgentMember1->id,
    ]);

    // Organization member remains intact
    $this->assertDatabaseHas('organization_members', [
        'id' => $this->acmeAgentMember1->id,
    ]);
});

test('system prevents adding users who are not organization members of that organization to a team', function () {
    // Attempt with user belonging to a different organization
    $response1 = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'organization_member_id' => $this->betaMember->id,
        ]);

    $response1->assertStatus(422);

    // Attempt with unaffiliated user_id
    $response2 = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'user_id' => $this->unaffiliatedUser->id,
        ]);

    $response2->assertStatus(422);

    // Attempt with completely non-existent id
    $response3 = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'organization_member_id' => 999999,
        ]);

    $response3->assertStatus(422);

    $this->assertDatabaseEmpty('team_members');
});

test('system prevents duplicate member assignments to the same team', function () {
    $this->team->members()->attach($this->acmeAgentMember1->id);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'organization_member_id' => $this->acmeAgentMember1->id,
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['organization_member_id']);

    expect($this->team->fresh()->members)->toHaveCount(1);
});

test('deleting a team leaves the underlying organization members intact', function () {
    $this->team->members()->attach($this->acmeAgentMember1->id);
    $this->team->members()->attach($this->acmeAgentMember2->id);

    $this->assertDatabaseHas('team_members', [
        'team_id' => $this->team->id,
        'organization_member_id' => $this->acmeAgentMember1->id,
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$this->team->id}");

    $response->assertStatus(200);

    // Team and pivot records are deleted
    $this->assertDatabaseMissing('teams', ['id' => $this->team->id]);
    $this->assertDatabaseMissing('team_members', ['team_id' => $this->team->id]);

    // Organization members remain completely intact
    $this->assertDatabaseHas('organization_members', ['id' => $this->acmeAgentMember1->id]);
    $this->assertDatabaseHas('organization_members', ['id' => $this->acmeAgentMember2->id]);
    $this->assertDatabaseHas('users', ['id' => $this->agentUser1->id]);
    $this->assertDatabaseHas('users', ['id' => $this->agentUser2->id]);
});

test('agent cannot add or remove members and receives 403 forbidden', function () {
    // Attempt add
    $addResponse = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->postJson("http://acme.localhost/api/teams/{$this->team->id}/members", [
            'organization_member_id' => $this->acmeAgentMember2->id,
        ]);

    $addResponse->assertStatus(403);

    $this->team->members()->attach($this->acmeAgentMember1->id);

    // Attempt remove
    $removeResponse = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->deleteJson("http://acme.localhost/api/teams/{$this->team->id}/members/{$this->acmeAgentMember1->id}");

    $removeResponse->assertStatus(403);
});

test('teams and team memberships are strictly isolated between different organizations', function () {
    $betaTeam = Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Team',
    ]);
    $betaTeam->members()->attach($this->betaMember->id);

    // Acme admin attempts to add member to beta team
    $response1 = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson("http://acme.localhost/api/teams/{$betaTeam->id}/members", [
            'organization_member_id' => $this->acmeAgentMember1->id,
        ]);

    $response1->assertStatus(404);

    // Acme admin attempts to remove member from beta team
    $response2 = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$betaTeam->id}/members/{$this->betaMember->id}");

    $response2->assertStatus(404);
});

test('organization members can be listed for team assignment', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->getJson('http://acme.localhost/api/members');

    $response->assertStatus(200)
        ->assertJsonStructure([
            'members' => [
                '*' => [
                    'id',
                    'organization_id',
                    'user_id',
                    'role',
                    'user' => [
                        'id',
                        'name',
                        'email',
                    ],
                ],
            ],
        ]);

    $memberUserIds = collect($response->json('members'))->pluck('user_id')->all();
    expect($memberUserIds)->toContain($this->adminUser->id, $this->agentUser1->id, $this->agentUser2->id)
        ->and($memberUserIds)->not->toContain($this->otherOrgUser->id);
});
