<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeUser = User::create([
        'name' => 'Acme Admin',
        'email' => 'admin@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->otherUser = User::create([
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
        'user_id' => $this->acmeUser->id,
        'role' => Role::ADMIN->value,
    ]);

    OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->otherUser->id,
        'role' => Role::ADMIN->value,
    ]);
});

test('unknown subdomain returns 404 not found', function () {
    $response = $this->getJson('http://unknown-org.localhost/api/workspace');

    $response->assertStatus(404)
        ->assertJson([
            'message' => 'Organization not found.',
        ]);
});

test('unauthenticated request to organization subdomain returns 401 unauthorized', function () {
    $response = $this->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(401);
});

test('authenticated user who is not an organization member receives 403 forbidden', function () {
    $token = $this->otherUser->createToken('test-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(403)
        ->assertJson([
            'message' => 'Forbidden. You are not an Organization Member of this Organization.',
        ]);
});

test('authenticated organization member receives 200 with organization and user details and admin role', function () {
    $token = $this->acmeUser->createToken('test-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(200)
        ->assertJson([
            'organization' => [
                'id' => $this->acmeOrg->id,
                'name' => 'Acme Corporation',
                'slug' => 'acme',
            ],
            'user' => [
                'id' => $this->acmeUser->id,
                'name' => 'Acme Admin',
                'email' => 'admin@acme.test',
            ],
            'role' => 'admin',
        ]);
});

test('authenticated organization member with agent role receives agent role in workspace', function () {
    $agentUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password123'),
    ]);

    OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $agentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $token = $agentUser->createToken('test-token')->plainTextToken;

    $response = $this->withHeader('Authorization', 'Bearer ' . $token)
        ->getJson('http://acme.localhost/api/workspace');

    $response->assertStatus(200)
        ->assertJson([
            'organization' => [
                'id' => $this->acmeOrg->id,
                'name' => 'Acme Corporation',
                'slug' => 'acme',
            ],
            'user' => [
                'id' => $agentUser->id,
                'name' => 'Acme Agent',
                'email' => 'agent@acme.test',
            ],
            'role' => 'agent',
        ]);
});
