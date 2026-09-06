<?php

use App\Enums\Role;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;

uses(RefreshDatabase::class);

beforeEach(function () {
    Artisan::call('db:seed');

    $this->acmeOrg = Organization::where('slug', 'acme')->first();
    $this->betaOrg = Organization::where('slug', 'beta')->first();

    $this->acmeAdmin = User::where('email', 'admin@acme.test')->first();
    $this->acmeAgent = User::where('email', 'agent@acme.test')->first();
    $this->betaAdmin = User::where('email', 'admin@beta.test')->first();
    $this->betaAgent = User::where('email', 'agent@beta.test')->first();

    $this->acmeTeam = Team::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->where('name', 'Support Tier 1')
        ->first();

    $this->betaTeam = Team::withoutGlobalScopes()
        ->where('organization_id', $this->betaOrg->id)
        ->where('name', 'Beta Support')
        ->first();

    $this->acmeAdminToken = $this->acmeAdmin->createToken('acme-admin')->plainTextToken;
    $this->acmeAgentToken = $this->acmeAgent->createToken('acme-agent')->plainTextToken;
    $this->betaAdminToken = $this->betaAdmin->createToken('beta-admin')->plainTextToken;
    $this->betaAgentToken = $this->betaAgent->createToken('beta-agent')->plainTextToken;
});

test('users from acme cannot access beta workspace or endpoints', function () {
    // Acme Admin attempting to access Beta workspace
    $response = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->getJson('http://beta.localhost/api/workspace');

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);

    // Acme Agent attempting to access Beta workspace
    $response = $this->withHeader('Authorization', 'Bearer '.$this->acmeAgentToken)
        ->getJson('http://beta.localhost/api/workspace');

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);

    // Acme Admin attempting to list Beta teams
    $response = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->getJson('http://beta.localhost/api/teams');

    $response->assertStatus(403);
});

test('users from beta cannot access acme workspace or endpoints', function () {
    // Beta Admin attempting to access Acme workspace
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);

    // Beta Agent attempting to access Acme workspace
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);

    // Beta Admin attempting to list Acme teams
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->getJson('http://acme.localhost/api/teams');

    $response->assertStatus(403);
});

test('acme user cannot view or mutate beta team resources even with known team ID', function () {
    // 1. Cannot view beta team from acme host
    $viewResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->getJson("http://acme.localhost/api/teams/{$this->betaTeam->id}");

    $viewResponse->assertStatus(404)
        ->assertJson(['message' => 'Team not found.']);

    // 2. Cannot update beta team from acme host
    $updateResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->putJson("http://acme.localhost/api/teams/{$this->betaTeam->id}", [
            'name' => 'Hostile Takeover',
        ]);

    $updateResponse->assertStatus(404)
        ->assertJson(['message' => 'Team not found.']);

    // 3. Cannot delete beta team from acme host
    $deleteResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->deleteJson("http://acme.localhost/api/teams/{$this->betaTeam->id}");

    $deleteResponse->assertStatus(404)
        ->assertJson(['message' => 'Team not found.']);

    // 4. Cannot add members to beta team from acme host
    $addMemberResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->betaTeam->id}/members", [
            'user_id' => $this->acmeAdmin->id,
        ]);

    $addMemberResponse->assertStatus(404)
        ->assertJson(['message' => 'Team not found.']);
});

test('system prevents adding users from another organization to a team', function () {
    // Acme Admin attempting to add Beta Agent (who is not an Acme member) to Acme Team
    $response = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->postJson("http://acme.localhost/api/teams/{$this->acmeTeam->id}/members", [
            'user_id' => $this->betaAgent->id,
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['user_id']);

    expect($this->acmeTeam->fresh()->members->pluck('id'))->not->toContain($this->betaAgent->id);
});

test('central hub organization listing isolates tenant organization members per user', function () {
    // Acme Admin sees only Acme
    $acmeResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->getJson('/api/organizations');

    $acmeResponse->assertStatus(200);
    $acmeSlugs = collect($acmeResponse->json())->pluck('slug')->all();
    expect($acmeSlugs)->toContain('acme')
        ->and($acmeSlugs)->not->toContain('beta');

    $this->app['auth']->forgetGuards();

    // Beta Admin sees only Beta
    $betaResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->getJson('/api/organizations');

    $betaResponse->assertStatus(200);
    $betaSlugs = collect($betaResponse->json())->pluck('slug')->all();
    expect($betaSlugs)->toContain('beta')
        ->and($betaSlugs)->not->toContain('acme');
});

test('invitations are strictly isolated between organizations', function () {
    // Acme Admin creates invitation in Acme
    $createResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'contractor@acme.test',
            'role' => Role::AGENT->value,
        ]);
    $createResponse->assertStatus(201);
    $invitationId = $createResponse->json('invitation.id');

    $this->app['auth']->forgetGuards();

    // Beta Admin listing invitations in Beta does NOT see Acme invitation
    $betaListResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->getJson('http://beta.localhost/api/invitations');
    $betaListResponse->assertStatus(200);
    $betaInvitationIds = collect($betaListResponse->json('invitations'))->pluck('id')->all();
    expect($betaInvitationIds)->not->toContain($invitationId);

    // Beta Admin cannot delete Acme invitation
    $deleteResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->deleteJson("http://beta.localhost/api/invitations/{$invitationId}");
    $deleteResponse->assertStatus(404);
});
