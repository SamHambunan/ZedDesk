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

    $this->agentUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->otherOrgAdmin = User::create([
        'name' => 'Beta Admin',
        'email' => 'admin@beta.test',
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

    $this->acmeAgentMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->agentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaAdminMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->otherOrgAdmin->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->adminToken = $this->adminUser->createToken('admin-token')->plainTextToken;
    $this->agentToken = $this->agentUser->createToken('agent-token')->plainTextToken;
    $this->otherOrgToken = $this->otherOrgAdmin->createToken('beta-token')->plainTextToken;
});

test('admin can create a team with name and description within the organization', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson('http://acme.localhost/api/teams', [
            'name' => 'Tier 1 Support',
            'description' => 'First response and general inquiries',
        ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'message',
            'team' => [
                'id',
                'organization_id',
                'name',
                'description',
                'created_at',
                'updated_at',
                'members',
            ],
        ]);

    expect($response->json('team.name'))->toBe('Tier 1 Support')
        ->and($response->json('team.description'))->toBe('First response and general inquiries')
        ->and($response->json('team.organization_id'))->toBe($this->acmeOrg->id)
        ->and($response->json('team.members'))->toBeArray();

    $this->assertDatabaseHas('teams', [
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tier 1 Support',
        'description' => 'First response and general inquiries',
    ]);
});

test('admin cannot create a team with missing name', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson('http://acme.localhost/api/teams', [
            'description' => 'No name provided',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

test('admin cannot create a duplicate team name within the same organization', function () {
    Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support',
        'description' => 'Existing team',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->postJson('http://acme.localhost/api/teams', [
            'name' => 'Support',
            'description' => 'Duplicate team name',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

test('different organizations can create teams with the same name', function () {
    Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Support',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->otherOrgToken)
        ->postJson('http://beta.localhost/api/teams', [
            'name' => 'Billing Support',
            'description' => 'Beta team with same name',
        ]);

    $response->assertStatus(201);

    $this->assertDatabaseHas('teams', [
        'organization_id' => $this->betaOrg->id,
        'name' => 'Billing Support',
    ]);
});

test('agent cannot create a team and receives 403 forbidden', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->postJson('http://acme.localhost/api/teams', [
            'name' => 'Unauthorized Team',
        ]);

    $response->assertStatus(403);
});

test('admin and agent can list teams within their organization', function () {
    Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support Team Alpha',
        'description' => 'First team',
    ]);
    Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support Team Beta',
        'description' => 'Second team',
    ]);
    Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Other Org Team',
    ]);

    // Admin listing
    $adminResponse = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->getJson('http://acme.localhost/api/teams');

    $adminResponse->assertStatus(200)
        ->assertJsonCount(2, 'teams');

    $names = collect($adminResponse->json('teams'))->pluck('name')->all();
    expect($names)->toContain('Support Team Alpha', 'Support Team Beta')
        ->and($names)->not->toContain('Other Org Team');

    // Agent listing
    $agentResponse = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->getJson('http://acme.localhost/api/teams');

    $agentResponse->assertStatus(200)
        ->assertJsonCount(2, 'teams');
});

test('admin and agent can view single team by id within their organization', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Escalations Team',
        'description' => 'Handles urgent issues',
    ]);

    $adminResponse = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->getJson("http://acme.localhost/api/teams/{$team->id}");

    $adminResponse->assertStatus(200)
        ->assertJsonPath('team.name', 'Escalations Team');

    $agentResponse = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->getJson("http://acme.localhost/api/teams/{$team->id}");

    $agentResponse->assertStatus(200)
        ->assertJsonPath('team.name', 'Escalations Team');
});

test('user cannot view a team belonging to another organization', function () {
    $betaTeam = Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Secret Team',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->getJson("http://acme.localhost/api/teams/{$betaTeam->id}");

    $response->assertStatus(404);
});

test('admin can update team details', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Old Name',
        'description' => 'Old description',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->putJson("http://acme.localhost/api/teams/{$team->id}", [
            'name' => 'Updated Name',
            'description' => 'Updated description',
        ]);

    $response->assertStatus(200)
        ->assertJsonPath('team.name', 'Updated Name')
        ->assertJsonPath('team.description', 'Updated description');

    $this->assertDatabaseHas('teams', [
        'id' => $team->id,
        'name' => 'Updated Name',
        'description' => 'Updated description',
    ]);
});

test('agent cannot update a team and receives 403 forbidden', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tier 2 Support',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->putJson("http://acme.localhost/api/teams/{$team->id}", [
            'name' => 'Attempted Update',
        ]);

    $response->assertStatus(403);
});

test('admin cannot update a team belonging to another organization', function () {
    $betaTeam = Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Team',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->putJson("http://acme.localhost/api/teams/{$betaTeam->id}", [
            'name' => 'Hijacked Team',
        ]);

    $response->assertStatus(404);
});

test('admin can delete a team', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Deletable Team',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$team->id}");

    $response->assertStatus(200);

    $this->assertDatabaseMissing('teams', [
        'id' => $team->id,
    ]);
});

test('agent cannot delete a team and receives 403 forbidden', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Protected Team',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->agentToken)
        ->deleteJson("http://acme.localhost/api/teams/{$team->id}");

    $response->assertStatus(403);
});

test('admin cannot delete a team belonging to another organization', function () {
    $betaTeam = Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Delete Protected',
    ]);

    $response = $this->withHeader('Authorization', 'Bearer '.$this->adminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$betaTeam->id}");

    $response->assertStatus(404);

    $this->assertDatabaseHas('teams', [
        'id' => $betaTeam->id,
    ]);
});
