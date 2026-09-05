<?php

use App\Enums\Role;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->inviter = User::create([
        'name' => 'Acme Admin',
        'email' => 'admin@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->inviter->id,
        'role' => Role::ADMIN->value,
    ]);
});

test('invitee can view invitation details using valid token', function () {
    $invitation = Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'prospective@example.com',
        'role' => Role::AGENT,
        'token' => 'valid-token-12345',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->getJson('/api/invitations/valid-token-12345');

    $response->assertStatus(200)
        ->assertJson([
            'invitation' => [
                'email' => 'prospective@example.com',
                'role' => 'agent',
                'organization_name' => 'Acme Corporation',
                'organization_slug' => 'acme',
            ],
        ]);

    expect($response->json('invitation.expires_at'))->toBeString();
});

test('viewing non-existent invitation token returns 404', function () {
    $response = $this->getJson('/api/invitations/non-existent-token');

    $response->assertStatus(404)
        ->assertJson([
            'message' => 'Invitation not found.',
        ]);
});

test('viewing expired invitation token returns 410 error', function () {
    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'expired@example.com',
        'role' => Role::AGENT,
        'token' => 'expired-token',
        'expires_at' => now()->subDay(),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->getJson('/api/invitations/expired-token');

    $response->assertStatus(410)
        ->assertJson([
            'message' => 'This invitation has expired.',
        ]);
});

test('viewing revoked invitation token returns 410 error', function () {
    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'revoked@example.com',
        'role' => Role::AGENT,
        'token' => 'revoked-token',
        'expires_at' => now()->addDays(7),
        'revoked_at' => now()->subHour(),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->getJson('/api/invitations/revoked-token');

    $response->assertStatus(410)
        ->assertJson([
            'message' => 'This invitation has been revoked.',
        ]);
});

test('viewing already accepted invitation token returns 422 error', function () {
    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'accepted@example.com',
        'role' => Role::AGENT,
        'token' => 'accepted-token',
        'expires_at' => now()->addDays(7),
        'accepted_at' => now()->subHour(),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->getJson('/api/invitations/accepted-token');

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'This invitation has already been accepted.',
        ]);
});

test('new user can accept invitation by providing name and password, creating user and organization member', function () {
    $invitation = Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'newstaff@example.com',
        'role' => Role::AGENT,
        'token' => 'new-user-invite-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->postJson('/api/invitations/new-user-invite-token/accept', [
        'name' => 'Alice Staff',
        'password' => 'SecurePassword123!',
        'password_confirmation' => 'SecurePassword123!',
    ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'message',
            'token',
            'user' => ['id', 'name', 'email'],
            'organization' => ['id', 'name', 'slug'],
            'role',
        ]);

    expect($response->json('user.name'))->toBe('Alice Staff')
        ->and($response->json('user.email'))->toBe('newstaff@example.com')
        ->and($response->json('role'))->toBe('agent')
        ->and($response->json('token'))->toBeString();

    $this->assertDatabaseHas('users', [
        'email' => 'newstaff@example.com',
        'name' => 'Alice Staff',
    ]);

    $newUser = User::where('email', 'newstaff@example.com')->first();

    $this->assertDatabaseHas('organization_members', [
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $newUser->id,
        'role' => 'agent',
    ]);

    $invitation->refresh();
    expect($invitation->accepted_at)->not->toBeNull();
});

test('new user acceptance fails when password confirmation fails or password is too short', function () {
    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'shortpass@example.com',
        'role' => Role::AGENT,
        'token' => 'shortpass-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->postJson('/api/invitations/shortpass-token/accept', [
        'name' => 'Short Pass',
        'password' => 'short',
        'password_confirmation' => 'different',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

test('new user acceptance fails if user account already exists without authentication', function () {
    User::create([
        'name' => 'Existing Person',
        'email' => 'existing@example.com',
        'password' => Hash::make('password123'),
    ]);

    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'existing@example.com',
        'role' => Role::AGENT,
        'token' => 'existing-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->postJson('/api/invitations/existing-token/accept', [
        'name' => 'Existing Person',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'A User with this email already exists. Please authenticate before accepting the invitation.',
        ]);
});

test('existing user can accept invitation after authenticating, linking user to organization member', function () {
    $existingUser = User::create([
        'name' => 'Bob Existing',
        'email' => 'bob@existing.test',
        'password' => Hash::make('password123'),
    ]);

    $invitation = Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'bob@existing.test',
        'role' => Role::ADMIN,
        'token' => 'bob-invite-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $token = $existingUser->createToken('bob-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/invitations/bob-invite-token/accept');

    $response->assertStatus(200)
        ->assertJson([
            'message' => 'Invitation accepted successfully.',
            'user' => [
                'id' => $existingUser->id,
                'name' => 'Bob Existing',
                'email' => 'bob@existing.test',
            ],
            'organization' => [
                'id' => $this->acmeOrg->id,
                'name' => 'Acme Corporation',
                'slug' => 'acme',
            ],
            'role' => 'admin',
        ]);

    $this->assertDatabaseHas('organization_members', [
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $existingUser->id,
        'role' => 'admin',
    ]);

    $invitation->refresh();
    expect($invitation->accepted_at)->not->toBeNull();
});

test('existing user acceptance fails if authenticated user email does not match invitation email', function () {
    $wrongUser = User::create([
        'name' => 'Wrong User',
        'email' => 'wrong@test.com',
        'password' => Hash::make('password123'),
    ]);

    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'target@test.com',
        'role' => Role::AGENT,
        'token' => 'mismatch-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $token = $wrongUser->createToken('wrong-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/invitations/mismatch-token/accept');

    $response->assertStatus(403)
        ->assertJson([
            'message' => 'The authenticated user email does not match this invitation.',
        ]);
});

test('existing user acceptance fails if user is already a member of the organization', function () {
    $existingMember = User::create([
        'name' => 'Already Member',
        'email' => 'member@acme.test',
        'password' => Hash::make('password123'),
    ]);

    OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $existingMember->id,
        'role' => Role::AGENT->value,
    ]);

    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'member@acme.test',
        'role' => Role::ADMIN,
        'token' => 'already-member-token',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $token = $existingMember->createToken('member-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/invitations/already-member-token/accept');

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'You are already an Organization Member of this Organization.',
        ]);
});

test('invitation acceptance fails when token is expired or revoked', function () {
    Invitation::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'expiredaccept@test.com',
        'role' => Role::AGENT,
        'token' => 'expired-accept-token',
        'expires_at' => now()->subDay(),
        'invited_by_user_id' => $this->inviter->id,
    ]);

    $response = $this->postJson('/api/invitations/expired-accept-token/accept', [
        'name' => 'Tester',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(410)
        ->assertJson([
            'message' => 'This invitation has expired.',
        ]);
});
