<?php

use App\Context\OrganizationContext;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;

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

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'alice@example.com',
        'name' => 'Alice Smith',
    ]);

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'bob@example.com',
        'name' => 'Bob Beta',
    ]);

    $this->ticket1 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket One',
        'status' => TicketStatus::NEW,
    ]);

    $this->ticket2 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket Two',
        'status' => TicketStatus::OPEN,
    ]);

    $this->tokenService = new CustomerTokenService;
});

afterEach(function () {
    OrganizationContext::clear();
});

test('magic link generates valid access link for existing customer email', function () {
    $response = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'alice@example.com',
    ]);

    $response->assertStatus(200)
        ->assertJsonStructure([
            'message',
            'token',
            'magic_link',
            'url',
        ]);

    $token = $response->json('token');
    $magicLink = $response->json('magic_link');

    expect($token)->toBeString()
        ->and(strlen($token))->toBeGreaterThan(20)
        ->and($magicLink)->toContain('acme.localhost')
        ->and($magicLink)->toContain("token={$token}");

    $payload = $this->tokenService->verifyToken($token);
    expect($payload)->not->toBeNull()
        ->and($payload['customer_id'])->toBe($this->acmeCustomer->id)
        ->and($payload['organization_id'])->toBe($this->acmeOrg->id)
        ->and($payload['ticket_id'])->toBeNull(); // Portal-wide access
});

test('magic link token allows customer to authenticate and view any of their tickets', function () {
    $linkResponse = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'alice@example.com',
    ]);

    $linkResponse->assertStatus(200);
    $token = $linkResponse->json('token');

    // Verify auth status endpoint
    $verifyResponse = $this->withHeader('X-Customer-Token', $token)
        ->getJson('http://acme.localhost/api/portal/auth/verify');

    $verifyResponse->assertStatus(200)
        ->assertJson([
            'valid' => true,
            'customer' => [
                'id' => $this->acmeCustomer->id,
                'name' => 'Alice Smith',
                'email' => 'alice@example.com',
            ],
        ]);

    // Can access Ticket 1
    $t1Response = $this->withHeader('X-Customer-Token', $token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket1->id}");

    $t1Response->assertStatus(200)
        ->assertJsonPath('ticket.id', $this->ticket1->id);

    // Can access Ticket 2 with the same portal token
    $t2Response = $this->withHeader('X-Customer-Token', $token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket2->id}");

    $t2Response->assertStatus(200)
        ->assertJsonPath('ticket.id', $this->ticket2->id);
});

test('magic link returns 404 for unknown customer email', function () {
    $response = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'unknown@example.com',
    ]);

    $response->assertStatus(404)
        ->assertJson(['message' => 'Customer not found.']);
});

test('magic link returns 404 for customer belonging to another organization', function () {
    // Request magic link on Acme subdomain with Beta customer's email
    $response = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'bob@example.com',
    ]);

    $response->assertStatus(404)
        ->assertJson(['message' => 'Customer not found.']);
});

test('magic link validates email presence and format', function () {
    $emptyResponse = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => '',
    ]);

    $emptyResponse->assertStatus(422)
        ->assertJsonValidationErrors(['email']);

    $invalidResponse = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'not-an-email',
    ]);

    $invalidResponse->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('magic link returns 404 when organization subdomain is unknown', function () {
    $response = $this->postJson('http://nonexistent.localhost/api/portal/magic-link', [
        'email' => 'alice@example.com',
    ]);

    $response->assertStatus(404);
});
