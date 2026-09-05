<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Scopes\OrganizationScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);

    $this->user1 = User::create([
        'name' => 'User One',
        'email' => 'user1@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $this->user2 = User::create([
        'name' => 'User Two',
        'email' => 'user2@beta.test',
        'password' => Hash::make('password123'),
    ]);

    $this->acmeMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->user1->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->user2->id,
        'role' => Role::ADMIN->value,
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('tenant scoped queries automatically filter by the active organization context', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $members = OrganizationMember::all();

    expect($members)->toHaveCount(1)
        ->and($members->first()->id)->toBe($this->acmeMember->id)
        ->and($members->first()->organization_id)->toBe($this->acmeOrg->id);
});

test('tenant scoped queries do not leak records from other organizations', function () {
    OrganizationContext::setCurrent($this->betaOrg);

    $members = OrganizationMember::all();

    expect($members)->toHaveCount(1)
        ->and($members->first()->id)->toBe($this->betaMember->id)
        ->and($members->first()->organization_id)->toBe($this->betaOrg->id);
});

test('creating tenant scoped model in active context automatically assigns organization_id', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $newUser = User::create([
        'name' => 'User Three',
        'email' => 'user3@acme.test',
        'password' => Hash::make('password123'),
    ]);

    $newMember = OrganizationMember::create([
        'user_id' => $newUser->id,
        'role' => Role::AGENT->value,
    ]);

    expect($newMember->organization_id)->toBe($this->acmeOrg->id);

    $this->assertDatabaseHas('organization_members', [
        'id' => $newMember->id,
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $newUser->id,
    ]);
});

test('organization scope can be bypassed using withoutGlobalScope', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $allMembers = OrganizationMember::withoutGlobalScope(OrganizationScope::class)->get();

    expect($allMembers->count())->toBeGreaterThanOrEqual(2);
});
