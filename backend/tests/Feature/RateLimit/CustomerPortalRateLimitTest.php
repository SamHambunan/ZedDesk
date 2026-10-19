<?php

use App\Contracts\RateLimitStore;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\CustomerTokenService;
use App\Services\RateLimitAttempt;
use App\Services\RedisRateLimitStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    config([
        'rate_limits.customer_per_minute' => 3,
        'rate_limits.customer_writes_per_minute' => 1,
        'rate_limits.key_prefix' => 'test:'.Str::random(20),
    ]);
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->customer = Customer::factory()->create(['organization_id' => $this->organization->id]);
    $this->ticket = Ticket::factory()->create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
    ]);
    $this->token = app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket);
    $this->travelTo(now()->startOfMinute()->addSeconds(10));
    $this->withHeader('X-Customer-Token', $this->token);
});

test('verified Customer reads and writes share an allowance that survives token replacement', function () {
    $path = 'http://acme.localhost/api/portal/tickets/'.$this->ticket->id;
    $this->getJson($path)->assertOk();
    $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($path.'/reply', ['message' => 'Hello'])->assertCreated();
    $this->postJson($path.'/reply', ['message' => 'Again'])
        ->assertStatus(429)->assertHeader('Retry-After', '50');
    $replacement = app(CustomerTokenService::class)->generateToken($this->customer);
    expect($replacement)->not->toBe($this->token);
    $this->withHeader('X-Customer-Token', $replacement)->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $this->getJson($path)->assertStatus(429);
    $this->travel(51)->seconds();
    $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($path.'/reply', ['message' => 'Next minute'])->assertCreated();
});

test('Customers and Organizations have independent allowances on a shared IP', function () {
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    }
    $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertStatus(429);
    $other = Customer::factory()->create(['organization_id' => $this->organization->id]);
    $this->withHeader('X-Customer-Token', app(CustomerTokenService::class)->generateToken($other))
        ->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();

    $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other']);
    $otherCustomer = Customer::factory()->create(['organization_id' => $otherOrg->id, 'email' => $this->customer->email]);
    $this->withHeader('X-Customer-Token', app(CustomerTokenService::class)->generateToken($otherCustomer))
        ->getJson('http://other.localhost/api/portal/auth/verify')->assertOk();
});

test('Customer IP safeguard aggregates verified Customers and Organizations', function () {
    config(['rate_limits.customer_per_ip_per_minute' => 2]);
    $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $other = Customer::factory()->create(['organization_id' => $this->organization->id]);
    $this->withHeader('X-Customer-Token', app(CustomerTokenService::class)->generateToken($other))
        ->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $otherOrg = Organization::create(['name' => 'Other', 'slug' => 'other']);
    $otherCustomer = Customer::factory()->create(['organization_id' => $otherOrg->id]);
    $this->withHeader('X-Customer-Token', app(CustomerTokenService::class)->generateToken($otherCustomer))
        ->getJson('http://other.localhost/api/portal/auth/verify')->assertStatus(429)->assertHeader('Retry-After', '50');
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
        ->getJson('http://other.localhost/api/portal/auth/verify')->assertOk();
});

test('invalid credentials and inaccessible Tickets retain their access denials after quota exhaustion', function () {
    for ($i = 0; $i < 3; $i++) {
        $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    }
    $this->withHeader('X-Customer-Token', 'tampered')->getJson('http://acme.localhost/api/portal/auth/verify')->assertUnauthorized();
    $this->withHeader('X-Customer-Token', $this->token)->getJson('http://acme.localhost/api/portal/tickets/'.Str::uuid())->assertNotFound();
    $other = Customer::factory()->create(['organization_id' => $this->organization->id]);
    $otherTicket = Ticket::factory()->create(['organization_id' => $this->organization->id, 'customer_id' => $other->id]);
    $this->getJson('http://acme.localhost/api/portal/tickets/'.$otherTicket->id)->assertForbidden();
    Organization::create(['name' => 'Other', 'slug' => 'other']);
    $this->getJson('http://other.localhost/api/portal/auth/verify')->assertForbidden();
});

test('public intake and access links never consume a submitted Customers authenticated allowance', function () {
    $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Person', 'email' => $this->customer->email, 'subject' => 'Help', 'message' => 'Hello',
    ])->assertCreated();
    $this->postJson('http://acme.localhost/api/portal/magic-link', ['email' => $this->customer->email])->assertOk();
    $this->withHeader('X-Customer-Token', $response->json('token'))
        ->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk();
    $this->getJson('http://acme.localhost/api/portal/auth/verify')->assertStatus(429);
    $this->postJson('http://acme.localhost/api/portal/magic-link', ['email' => $this->customer->email])->assertOk();
});

test('Customer allowances survive Redis failure and return unavailable when neither store can enforce', function () {
    $path = 'http://acme.localhost/api/portal/auth/verify';
    $this->getJson($path)->assertOk();
    $this->getJson($path)->assertOk();
    $this->app->bind(RedisRateLimitStore::class, fn () => new class extends RedisRateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('Redis unavailable');
        }
    });
    $this->getJson($path)->assertOk();
    $this->getJson($path)->assertStatus(429);
    $this->travel(51)->seconds();
    $this->getJson($path)->assertOk();
    $this->app->bind(RateLimitStore::class, fn () => new class implements RateLimitStore
    {
        public function allow(RateLimitAttempt $attempt): bool
        {
            throw new RuntimeException('PostgreSQL unavailable');
        }
    });
    $this->getJson($path)->assertStatus(503);
    $this->withHeader('X-Customer-Token', 'invalid')->getJson($path)->assertUnauthorized();
});

test('rate-key normalization leaves case-sensitive Customer matching unchanged', function () {
    $customer = Customer::factory()->create(['organization_id' => $this->organization->id, 'email' => 'Person@example.com']);
    $this->postJson('http://acme.localhost/api/portal/magic-link', ['email' => 'Person@example.com'])->assertOk();
    $this->postJson('http://acme.localhost/api/portal/magic-link', ['email' => 'person@example.com'])->assertNotFound();
    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Another Person', 'email' => 'person@example.com', 'subject' => 'Help', 'message' => 'Hello',
    ])->assertCreated();
    $this->withHeader('X-Customer-Token', $response->json('token'))
        ->getJson('http://acme.localhost/api/portal/auth/verify')->assertOk()
        ->assertJsonPath('customer.email', 'person@example.com');
    expect($response->json('token'))->not->toBe(app(CustomerTokenService::class)->generateToken($customer));
});
