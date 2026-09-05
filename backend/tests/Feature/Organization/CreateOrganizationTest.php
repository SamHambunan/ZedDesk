<?php

use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

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
        'name' => 'Existing Company',
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
