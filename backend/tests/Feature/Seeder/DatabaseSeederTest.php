<?php

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('database seeder populates acme and beta organizations with users and teams', function () {
    Artisan::call('db:seed');

    // 1. Verify Acme Organization
    $acmeOrg = Organization::where('slug', 'acme')->first();
    expect($acmeOrg)->not->toBeNull()
        ->and($acmeOrg->name)->toBe('Acme Corporation');

    // 2. Verify Acme Users & Passwords
    $acmeAdmin = User::where('email', 'admin@acme.test')->first();
    expect($acmeAdmin)->not->toBeNull()
        ->and($acmeAdmin->name)->toBe('Acme Admin')
        ->and(Hash::check('password', $acmeAdmin->password))->toBeTrue();

    $acmeAgent = User::where('email', 'agent@acme.test')->first();
    expect($acmeAgent)->not->toBeNull()
        ->and($acmeAgent->name)->toBe('Acme Agent')
        ->and(Hash::check('password', $acmeAgent->password))->toBeTrue();

    // 3. Verify Acme Organization Members & Roles
    $acmeAdminMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('user_id', $acmeAdmin->id)
        ->first();
    expect($acmeAdminMember)->not->toBeNull()
        ->and($acmeAdminMember->role)->toBe(Role::ADMIN);

    $acmeAgentMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('user_id', $acmeAgent->id)
        ->first();
    expect($acmeAgentMember)->not->toBeNull()
        ->and($acmeAgentMember->role)->toBe(Role::AGENT);

    // 4. Verify Acme Teams and Member Assignments
    $supportTier1 = Team::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('name', 'Support Tier 1')
        ->first();
    expect($supportTier1)->not->toBeNull()
        ->and($supportTier1->members->pluck('id')->all())->toContain($acmeAgentMember->id);

    $billingSupport = Team::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('name', 'Billing Support')
        ->first();
    expect($billingSupport)->not->toBeNull()
        ->and($billingSupport->members->pluck('id')->all())->toContain($acmeAdminMember->id)
        ->and($billingSupport->members->pluck('id')->all())->toContain($acmeAgentMember->id);

    // 5. Verify Beta Organization
    $betaOrg = Organization::where('slug', 'beta')->first();
    expect($betaOrg)->not->toBeNull()
        ->and($betaOrg->name)->toBe('Beta Corporation');

    // 6. Verify Beta Users
    $betaAdmin = User::where('email', 'admin@beta.test')->first();
    expect($betaAdmin)->not->toBeNull()
        ->and($betaAdmin->name)->toBe('Beta Admin')
        ->and(Hash::check('password', $betaAdmin->password))->toBeTrue();

    $betaAgent = User::where('email', 'agent@beta.test')->first();
    expect($betaAgent)->not->toBeNull()
        ->and($betaAgent->name)->toBe('Beta Agent')
        ->and(Hash::check('password', $betaAgent->password))->toBeTrue();

    // 7. Verify Beta Organization Members & Roles
    $betaAdminMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $betaOrg->id)
        ->where('user_id', $betaAdmin->id)
        ->first();
    expect($betaAdminMember)->not->toBeNull()
        ->and($betaAdminMember->role)->toBe(Role::ADMIN);

    $betaAgentMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $betaOrg->id)
        ->where('user_id', $betaAgent->id)
        ->first();
    expect($betaAgentMember)->not->toBeNull()
        ->and($betaAgentMember->role)->toBe(Role::AGENT);

    // 8. Verify Beta Teams
    $betaSupport = Team::withoutGlobalScopes()
        ->where('organization_id', $betaOrg->id)
        ->where('name', 'Beta Support')
        ->first();
    expect($betaSupport)->not->toBeNull()
        ->and($betaSupport->members->pluck('id')->all())->toContain($betaAgentMember->id);

    $betaEscalations = Team::withoutGlobalScopes()
        ->where('organization_id', $betaOrg->id)
        ->where('name', 'Beta Escalations')
        ->first();
    expect($betaEscalations)->not->toBeNull()
        ->and($betaEscalations->members->pluck('id')->all())->toContain($betaAdminMember->id);
});

test('database seeder runs idempotently without duplicating records', function () {
    // First run
    Artisan::call('db:seed');

    $orgCount1 = Organization::count();
    $userCount1 = User::count();
    $memberCount1 = OrganizationMember::withoutGlobalScopes()->count();
    $teamCount1 = Team::withoutGlobalScopes()->count();
    $teamMemberCount1 = DB::table('team_members')->count();

    expect($orgCount1)->toBe(2)
        ->and($userCount1)->toBe(4)
        ->and($memberCount1)->toBe(4)
        ->and($teamCount1)->toBe(4)
        ->and($teamMemberCount1)->toBe(5);

    // Second run
    Artisan::call('db:seed');

    expect(Organization::count())->toBe($orgCount1)
        ->and(User::count())->toBe($userCount1)
        ->and(OrganizationMember::withoutGlobalScopes()->count())->toBe($memberCount1)
        ->and(Team::withoutGlobalScopes()->count())->toBe($teamCount1)
        ->and(DB::table('team_members')->count())->toBe($teamMemberCount1);
});
