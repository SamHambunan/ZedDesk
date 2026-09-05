<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
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

    $this->otherOrgUser = User::create([
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

    OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->adminUser->id,
        'role' => Role::ADMIN->value,
    ]);

    OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->agentUser->id,
        'role' => Role::AGENT->value,
    ]);

    OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->otherOrgUser->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->adminToken = $this->adminUser->createToken('admin-token')->plainTextToken;
    $this->agentToken = $this->agentUser->createToken('agent-token')->plainTextToken;
    $this->otherOrgToken = $this->otherOrgUser->createToken('beta-token')->plainTextToken;
});

test('admin can create an invitation with email and role', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'newcolleague@acme.test',
            'role' => 'agent',
        ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'message',
            'invitation' => [
                'id',
                'email',
                'role',
                'token',
                'expires_at',
                'created_at',
            ],
        ]);

    expect($response->json('invitation.email'))->toBe('newcolleague@acme.test')
        ->and($response->json('invitation.role'))->toBe('agent');

    $this->assertDatabaseHas('organization_invitations', [
        'organization_id' => $this->acmeOrg->id,
        'email' => 'newcolleague@acme.test',
        'role' => 'agent',
        'invited_by_user_id' => $this->adminUser->id,
    ]);
});

test('admin can create an invitation with admin role', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'coadmin@acme.test',
            'role' => 'admin',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('invitation.role', 'admin');

    $this->assertDatabaseHas('organization_invitations', [
        'organization_id' => $this->acmeOrg->id,
        'email' => 'coadmin@acme.test',
        'role' => 'admin',
    ]);
});

test('non-admin agent cannot create an invitation and receives 403 forbidden', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->agentToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'another@acme.test',
            'role' => 'agent',
        ]);

    $response->assertStatus(403);
});

test('invitation creation fails when email is already an active organization member', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'agent@acme.test',
            'role' => 'agent',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('invitation creation fails when a pending invitation already exists for the email', function () {
    $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'invitee@acme.test',
            'role' => 'agent',
        ])
        ->assertStatus(201);

    $duplicateResponse = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'invitee@acme.test',
            'role' => 'admin',
        ]);

    $duplicateResponse->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('invitation creation validates required fields and role enum', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'not-an-email',
            'role' => 'superadmin',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'role']);
});

test('admin can list pending invitations for the organization', function () {
    $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'pending1@acme.test',
            'role' => 'agent',
        ]);

    $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'pending2@acme.test',
            'role' => 'admin',
        ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->getJson('http://acme.localhost/api/invitations');

    $response->assertStatus(200)
        ->assertJsonCount(2, 'invitations');

    $emails = collect($response->json('invitations'))->pluck('email')->all();
    expect($emails)->toContain('pending1@acme.test')
        ->and($emails)->toContain('pending2@acme.test');
});

test('agent cannot list invitations and receives 403 forbidden', function () {
    $response = $this->withHeader('Authorization', 'Bearer ' . $this->agentToken)
        ->getJson('http://acme.localhost/api/invitations');

    $response->assertStatus(403);
});

test('admin can revoke an active invitation', function () {
    $createResponse = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->postJson('http://acme.localhost/api/invitations', [
            'email' => 'torevoke@acme.test',
            'role' => 'agent',
        ]);

    $invitationId = $createResponse->json('invitation.id');

    $revokeResponse = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitationId}");

    $revokeResponse->assertStatus(200);

    $this->assertDatabaseHas('organization_invitations', [
        'id' => $invitationId,
    ]);

    $this->assertNotNull(\Illuminate\Support\Facades\DB::table('organization_invitations')->where('id', $invitationId)->value('revoked_at'));

    // Listing pending invitations should no longer include the revoked invitation
    $listResponse = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->getJson('http://acme.localhost/api/invitations');

    $listResponse->assertStatus(200)
        ->assertJsonCount(0, 'invitations');
});

test('agent cannot revoke an invitation and receives 403 forbidden', function () {
    $invitation = \App\Models\Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'agentrevoke@acme.test',
        'role' => Role::AGENT,
        'token' => \Illuminate\Support\Str::random(64),
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->agentToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitation->id}");

    $response->assertStatus(403);
});

test('admin cannot revoke an invitation from another organization', function () {
    $invitation = \App\Models\Invitation::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'beta@invitee.test',
        'role' => Role::AGENT,
        'token' => \Illuminate\Support\Str::random(64),
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->otherOrgUser->id,
    ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitation->id}");

    $response->assertStatus(404);
});

test('admin cannot revoke an already revoked invitation', function () {
    $invitation = \App\Models\Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'alreadyrevoked@acme.test',
        'role' => Role::AGENT,
        'token' => \Illuminate\Support\Str::random(64),
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
        'revoked_at' => now()->subHour(),
    ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitation->id}");

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'This invitation has already been revoked.',
        ]);
});

test('admin cannot revoke an expired invitation', function () {
    $invitation = \App\Models\Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'alreadyexpired@acme.test',
        'role' => Role::AGENT,
        'token' => \Illuminate\Support\Str::random(64),
        'expires_at' => now()->subDay(),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitation->id}");

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'Cannot revoke an invitation that has already expired.',
        ]);
});

test('admin cannot revoke an accepted invitation', function () {
    $invitation = \App\Models\Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'alreadyaccepted@acme.test',
        'role' => Role::AGENT,
        'token' => \Illuminate\Support\Str::random(64),
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
        'accepted_at' => now()->subHour(),
    ]);

    $response = $this->withHeader('Authorization', 'Bearer ' . $this->adminToken)
        ->deleteJson("http://acme.localhost/api/invitations/{$invitation->id}");

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'Cannot revoke an invitation that has already been accepted.',
        ]);
});
