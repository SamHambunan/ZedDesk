<?php

use App\Contracts\RateLimitStore;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Services\RateLimitAttempt;
use App\Services\RedisRateLimitStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    config([
        'rate_limits.authenticated_per_minute' => 3,
        'rate_limits.authenticated_writes_per_minute' => 1,
        'rate_limits.key_prefix' => 'test:'.Str::random(20),
    ]);

    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->user = User::factory()->create();
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->user->id,
        'role' => 'admin',
    ]);
    $this->token = $this->user->createToken('rate-limit-test')->plainTextToken;
});

test('member allowance covers reads and writes and expires at the next minute', function () {
    $this->travelTo(now()->startOfMinute()->addSeconds(10));
    $this->withToken($this->token);

    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk();
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')
        ->assertStatus(429)->assertHeader('Retry-After', '50');
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    $this->getJson('http://acme.localhost/api/workspace')
        ->assertStatus(429)->assertHeader('Retry-After', '50');

    $this->travel(51)->seconds();
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
});

test('users and organizations have independent allowances even when requests share an IP', function () {
    $otherUser = User::factory()->create();
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $otherUser->id,
        'role' => 'agent',
    ]);
    $otherToken = $otherUser->createToken('rate-limit-test')->plainTextToken;
    $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other']);
    OrganizationMember::create([
        'organization_id' => $otherOrg->id,
        'user_id' => $this->user->id,
        'role' => 'admin',
    ]);

    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.1'])->withToken($this->token);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    }
    $this->getJson('http://acme.localhost/api/workspace')->assertStatus(429);
    Auth::forgetGuards();
    $this->withToken($otherToken)->getJson('http://acme.localhost/api/workspace')->assertOk();
    Auth::forgetGuards();
    $this->withToken($this->token)->getJson('http://other.localhost/api/workspace')->assertOk();
});

test('global routes use verified user identity and invalid credentials remain unauthorized', function () {
    $this->withToken($this->token);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('/api/organizations')->assertOk();
    }
    $this->getJson('/api/organizations')->assertStatus(429);
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    Auth::forgetGuards();
    $this->withToken('invalid')->getJson('/api/organizations')->assertStatus(401);
});

test('non-members remain forbidden even when their user has exhausted another organization allowance', function () {
    $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other']);
    $this->withToken($this->token);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    }

    $this->getJson('http://other.localhost/api/workspace')->assertStatus(403);
    $this->getJson('http://acme.localhost/api/workspace')->assertStatus(429);
});

test('role-based authorization denial remains forbidden after the allowance is exhausted', function () {
    $agent = User::factory()->create();
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $agent->id,
        'role' => 'agent',
    ]);
    $this->withToken($agent->createToken('rate-limit-test')->plainTextToken);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    }

    $this->getJson('http://acme.localhost/api/audit-logs')->assertStatus(403);
    $this->postJson('http://acme.localhost/api/teams', ['name' => 'Denied'])->assertStatus(403);
});

test('authenticated invitation acceptance uses the global write allowance', function () {
    $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other']);
    Invitation::create([
        'organization_id' => $otherOrg->id,
        'email' => $this->user->email,
        'role' => 'agent',
        'token' => 'rate-limit-invitation',
        'expires_at' => now()->addDay(),
        'invited_by_user_id' => $this->user->id,
    ]);

    $this->withToken($this->token);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('/api/organizations')->assertOk();
    }
    $this->postJson('/api/invitations/rate-limit-invitation/accept')
        ->assertStatus(429);
    expect(OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $otherOrg->id)
        ->where('user_id', $this->user->id)
        ->exists())->toBeFalse();
});

test('PostgreSQL enforces limits when Redis fails and both failures return unavailable', function () {
    $this->withToken($this->token);
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();

    $this->app->bind(RedisRateLimitStore::class, fn () => new class extends RedisRateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('Redis unavailable');
        }
    });
    $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    $this->getJson('http://acme.localhost/api/workspace')->assertStatus(429);

    $this->app->bind(RateLimitStore::class, fn () => unavailableRateLimitStore());
    $this->getJson('http://acme.localhost/api/workspace')->assertStatus(503);
});

test('a PostgreSQL limiter error does not block a request while Redis enforces the policy', function () {
    $this->app->bind(RateLimitStore::class, fn () => unavailableRateLimitStore());

    $this->withToken($this->token);
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/workspace')->assertOk();
    }
    $this->getJson('http://acme.localhost/api/workspace')->assertStatus(429);
});

function unavailableRateLimitStore(): RateLimitStore
{
    return new class implements RateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('PostgreSQL limiter unavailable');
        }
    };
}
