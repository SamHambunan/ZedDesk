<?php

use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('authenticated user can list only organizations they belong to with their role', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $otherUser = User::factory()->create();

    $org1 = Organization::create([
        'name' => 'Org One',
        'slug' => 'org-one',
    ]);
    OrganizationMember::create([
        'organization_id' => $org1->id,
        'user_id' => $user->id,
        'role' => 'admin',
    ]);

    $org2 = Organization::create([
        'name' => 'Org Two',
        'slug' => 'org-two',
    ]);
    OrganizationMember::create([
        'organization_id' => $org2->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    $unrelatedOrg = Organization::create([
        'name' => 'Unrelated Org',
        'slug' => 'unrelated-org',
    ]);
    OrganizationMember::create([
        'organization_id' => $unrelatedOrg->id,
        'user_id' => $otherUser->id,
        'role' => 'admin',
    ]);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/organizations');

    $response->assertStatus(200)
        ->assertJsonCount(2);

    $data = $response->json();

    $org1Data = collect($data)->firstWhere('slug', 'org-one');
    expect($org1Data)->not->toBeNull()
        ->and($org1Data['name'])->toBe('Org One')
        ->and($org1Data['role'])->toBe('admin');

    $org2Data = collect($data)->firstWhere('slug', 'org-two');
    expect($org2Data)->not->toBeNull()
        ->and($org2Data['name'])->toBe('Org Two')
        ->and($org2Data['role'])->toBe('agent');

    $unrelatedData = collect($data)->firstWhere('slug', 'unrelated-org');
    expect($unrelatedData)->toBeNull();
});

test('listing organizations requires authentication', function () {
    $response = $this->getJson('/api/organizations');

    $response->assertStatus(401);
});
