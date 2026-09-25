<?php

use App\Models\Invitation;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

test('authenticated user can create an organization with valid slug and becomes admin member', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/organizations', [
            'name' => 'Acme Corporation',
            'slug' => 'acme-corp',
        ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'organization' => [
                'id',
                'name',
                'slug',
                'created_at',
                'updated_at',
            ],
            'role',
        ]);

    expect($response->json('organization.name'))->toBe('Acme Corporation')
        ->and($response->json('organization.slug'))->toBe('acme-corp')
        ->and($response->json('role'))->toBe('admin');

    $orgId = $response->json('organization.id');

    $this->assertDatabaseHas('organizations', [
        'id' => $orgId,
        'name' => 'Acme Corporation',
        'slug' => 'acme-corp',
    ]);

    $this->assertDatabaseHas('organization_members', [
        'organization_id' => $orgId,
        'user_id' => $user->id,
        'role' => 'admin',
    ]);
});

test('organization creation requires authentication', function () {
    $response = $this->postJson('/api/organizations', [
        'name' => 'Acme Corporation',
        'slug' => 'acme-corp',
    ]);

    $response->assertStatus(401);
});

test('organization creation fails when required fields are missing', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/organizations', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'slug']);
});

test('organization creation fails when slug format is invalid', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $invalidSlugs = ['ACME', 'acme_corp', '-acme', 'acme-', 'ac', 'acme..corp', 'acme corp'];

    foreach ($invalidSlugs as $slug) {
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/organizations', [
                'name' => 'Acme Test',
                'slug' => $slug,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['slug']);
    }
});

test('organization creation fails when slug is reserved', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $reservedSlugs = ['api', 'admin', 'www', 'central', 'app', 'support', 'mail', 'billing'];

    foreach ($reservedSlugs as $slug) {
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/organizations', [
                'name' => 'Test Reserved',
                'slug' => $slug,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['slug']);
    }
});

test('organization creation fails when slug is already taken', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    Organization::create([
        'name' => 'Existing Organization',
        'slug' => 'existing-company',
    ]);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/organizations', [
            'name' => 'New Duplicate',
            'slug' => 'existing-company',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['slug']);
});

test('check slug endpoint verifies availability and returns proper messages', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    Organization::create([
        'name' => 'Existing Org',
        'slug' => 'taken-slug',
    ]);

    // Available slug
    $res1 = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/organizations/check-slug?slug=fresh-slug');
    $res1->assertStatus(200)
        ->assertJson(['available' => true]);

    // Taken slug
    $res2 = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/organizations/check-slug?slug=taken-slug');
    $res2->assertStatus(200)
        ->assertJson(['available' => false, 'message' => 'This subdomain is already taken.']);

    // Reserved slug
    $res3 = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/organizations/check-slug?slug=admin');
    $res3->assertStatus(200)
        ->assertJson(['available' => false, 'message' => 'This subdomain is reserved by the system.']);
});

test('user invitations endpoint returns pending invitations for authenticated user email', function () {
    $user = User::factory()->create(['email' => 'member@example.com']);
    $token = $user->createToken('test_token')->plainTextToken;

    $org = Organization::create([
        'name' => 'Target Org',
        'slug' => 'target-org',
    ]);

    Invitation::create([
        'organization_id' => $org->id,
        'email' => 'member@example.com',
        'role' => 'agent',
        'token' => Str::random(64),
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $user->id,
    ]);

    $res = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/user/invitations');

    $res->assertStatus(200)
        ->assertJsonStructure(['invitations' => [['id', 'organizationName', 'role', 'token']]]);
    expect($res->json('invitations.0.organizationName'))->toBe('Target Org');
});
