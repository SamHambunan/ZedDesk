<?php

use App\Contracts\RateLimitStore;
use App\Models\Organization;
use App\Services\RateLimitAttempt;
use App\Services\RedisRateLimitStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['rate_limits.key_prefix' => 'test:'.Str::random(20)]);
    Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->travelTo(now()->startOfMinute()->addSeconds(10));
});

test('public entry points cap attempts per IP even when submitted identities change', function (string $path, int $status) {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson($path, ['email' => 'person'.$i.'@example.com'])->assertStatus($status);
    }
    $this->postJson($path, ['email' => 'another@example.com'])
        ->assertStatus(429)->assertHeader('Retry-After', '50');
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
        ->postJson($path, [])->assertStatus(422);
})->with([
    ['/api/register', 422],
    ['http://acme.localhost/api/portal/tickets', 422],
    ['http://acme.localhost/api/portal/magic-link', 404],
]);

test('login restricts a normalized submitted identity and IP without changing credentials', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/login', ['email' => 'Somebody@example.com', 'password' => 'wrong'])->assertStatus(422);
    }
    $this->postJson('/api/login', ['email' => 'somebody@example.com', 'password' => 'wrong'])
        ->assertStatus(429)->assertHeader('Retry-After', '50');
    $this->postJson('/api/login', ['email' => 'other@example.com', 'password' => 'wrong'])->assertStatus(422);
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
        ->postJson('/api/login', ['email' => 'Somebody@example.com', 'password' => 'wrong'])->assertStatus(422);
    $this->travel(51)->seconds();
    $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
        ->postJson('/api/login', ['email' => 'Somebody@example.com', 'password' => 'wrong'])->assertStatus(422);
});

test('login has an aggregate IP cap across submitted identities', function () {
    for ($i = 0; $i < 100; $i++) {
        $this->postJson('/api/login', ['email' => 'person'.$i.'@example.com', 'password' => 'wrong'])->assertStatus(422);
    }
    $this->postJson('/api/login', ['email' => 'fresh@example.com', 'password' => 'wrong'])->assertStatus(429);
});

test('identity restrictions remain independent of configurable public IP safeguards', function (string $policy, string $path, int $status) {
    config(['rate_limits.'.$policy.'_per_ip_per_minute' => 20]);
    for ($i = 0; $i < 5; $i++) {
        $this->postJson($path, ['email' => 'Somebody@example.com'])->assertStatus($status);
    }
    $this->postJson($path, ['email' => 'somebody@example.com'])->assertStatus(429);
    $this->postJson($path, ['email' => 'other@example.com'])->assertStatus($status);
})->with([
    ['registration', '/api/register', 422],
    ['ticket_creation', 'http://acme.localhost/api/portal/tickets', 422],
    ['access_link', 'http://acme.localhost/api/portal/magic-link', 404],
]);

test('public policies fall back with no fresh allowance and fail closed when both stores fail', function () {
    for ($i = 0; $i < 4; $i++) {
        $this->postJson('/api/register')->assertStatus(422);
    }
    $this->app->bind(RedisRateLimitStore::class, fn () => new class extends RedisRateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('Redis unavailable');
        }
    });
    $this->postJson('/api/register')->assertStatus(422);
    $this->postJson('/api/register')->assertStatus(429)->assertHeader('Retry-After', '50');
    $this->travel(51)->seconds();
    $this->postJson('/api/register')->assertStatus(422);
    $this->app->bind(RateLimitStore::class, fn () => new class implements RateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('PostgreSQL unavailable');
        }
    });
    $this->postJson('/api/register')->assertStatus(503);
});

test('valid registration and login keep existing credential behavior', function () {
    $payload = ['name' => 'Person', 'email' => 'Person@example.com', 'password' => 'password123', 'password_confirmation' => 'password123'];
    $this->postJson('/api/register', $payload)->assertCreated()->assertJsonStructure(['user', 'token']);
    $this->postJson('/api/login', $payload)->assertOk()->assertJsonStructure(['user', 'token']);
    $this->postJson('/api/login', ['email' => 'person@example.com', 'password' => 'password123'])->assertStatus(422);
});

test('anonymous invitation registration shares the public registration IP allowance', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/register')->assertStatus(422);
    }
    $this->postJson('/api/invitations/unknown/accept')->assertStatus(429);
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
        ->postJson('/api/invitations/unknown/accept')->assertNotFound();
});

test('limiter stores contain opaque keys rather than submitted identity or network data', function () {
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.55'])
        ->postJson('/api/login', ['email' => 'private@example.com', 'password' => 'private-password'])->assertStatus(422);
    $hashes = DB::table('rate_limit_windows')->pluck('key_hash');
    expect($hashes)->toHaveCount(2);
    foreach ($hashes as $hash) {
        expect($hash)->toMatch('/^[a-f0-9]{64}$/');
        $key = config('rate_limits.key_prefix').':'.$hash.':'.(intdiv(now()->timestamp, 60) * 60);
        expect(Redis::connection()->hgetall($key))->toBe(['all' => '1']);
    }
});
