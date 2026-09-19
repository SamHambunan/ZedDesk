<?php

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
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
        'email' => 'acme_customer@example.com',
        'name' => 'Acme Customer',
    ]);

    $this->acmeCustomer2 = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'other_acme@example.com',
        'name' => 'Other Acme Customer',
    ]);

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'beta_customer@example.com',
        'name' => 'Beta Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Test Ticket 1',
        'status' => TicketStatus::NEW,
    ]);

    $this->acmeTicket2 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer2->id,
        'subject' => 'Acme Test Ticket 2',
        'status' => TicketStatus::NEW,
    ]);

    $this->betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Test Ticket',
        'status' => TicketStatus::NEW,
    ]);

    $this->tokenService = new CustomerTokenService;
});

afterEach(function () {
    OrganizationContext::clear();
});

test('valid signed token in X-Customer-Token header allows access to customer ticket', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    $response = $this->withHeader('X-Customer-Token', $token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(200)
        ->assertJsonPath('ticket.id', $this->acmeTicket->id)
        ->assertJsonPath('customer.id', $this->acmeCustomer->id);
});

test('valid signed token in URL query parameter allows access to customer ticket', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    $response = $this->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}?token={$token}");

    $response->assertStatus(200)
        ->assertJsonPath('ticket.id', $this->acmeTicket->id);

    // Also support customer_token query param
    $response2 = $this->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}?customer_token={$token}");
    $response2->assertStatus(200);
});

test('missing customer token is rejected with 401 Unauthorized', function () {
    $response = $this->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401)
        ->assertJson(['message' => 'Customer access token is required.']);
});

test('tampered token payload is rejected with 401 Unauthorized', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);
    [$encodedPayload, $signature] = explode('.', $token);

    // Decode and modify payload
    $payload = json_decode(base64_decode(strtr($encodedPayload, '-_', '+/')), true);
    $payload['customer_id'] = $this->acmeCustomer2->id; // Tamper customer_id
    $tamperedPayloadEncoded = strtr(base64_encode(json_encode($payload)), '+/=', '-_');

    $tamperedToken = $tamperedPayloadEncoded.'.'.$signature;

    $response = $this->withHeader('X-Customer-Token', $tamperedToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('tampered signature is rejected with 401 Unauthorized', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);
    [$encodedPayload, $signature] = explode('.', $token);

    // Alter signature hash
    $badSignature = substr($signature, 0, -4).'ffff';
    $tamperedToken = $encodedPayload.'.'.$badSignature;

    $response = $this->withHeader('X-Customer-Token', $tamperedToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('expired customer token is rejected with 401 Unauthorized', function () {
    // Generate token with negative TTL (already expired)
    $expiredToken = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket, -60);

    $response = $this->withHeader('X-Customer-Token', $expiredToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('malformed token string is rejected with 401 Unauthorized', function () {
    $response = $this->withHeader('X-Customer-Token', 'not-a-valid-token-at-all')
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('customer token from another organization is rejected with 403 Forbidden', function () {
    // Token generated in Beta Org
    $betaToken = $this->tokenService->generateToken($this->betaCustomer, $this->betaTicket);

    // Attempt to use Beta token against Acme Org
    $response = $this->withHeader('X-Customer-Token', $betaToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(403);
});

test('customer cannot access ticket belonging to another customer', function () {
    // Token for Customer 1
    $customer1Token = $this->tokenService->generateToken($this->acmeCustomer);

    // Attempt to access Customer 2's ticket
    $response = $this->withHeader('X-Customer-Token', $customer1Token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket2->id}");

    $response->assertStatus(403);
});

test('ticket-scoped token cannot access a different ticket of the same customer', function () {
    // Create a second ticket for the same customer
    $anotherTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Another Ticket for Customer 1',
    ]);

    // Token explicitly scoped to acmeTicket
    $tokenForTicket1 = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    // Attempt to use ticket 1's token to access another ticket
    $response = $this->withHeader('X-Customer-Token', $tokenForTicket1)
        ->getJson("http://acme.localhost/api/portal/tickets/{$anotherTicket->id}");

    $response->assertStatus(403);
});

test('customer cannot access ticket of another organization even if ticket ID is known', function () {
    $acmeToken = $this->tokenService->generateToken($this->acmeCustomer);

    // Request on Acme subdomain attempting to access Beta ticket ID
    $response = $this->withHeader('X-Customer-Token', $acmeToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->betaTicket->id}");

    // Strict 404 Not Found to prevent leaking foreign ticket existence
    $response->assertStatus(404);
});

test('bearer token in Authorization header is rejected for customer access', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    // Customer tokens are strictly decoupled from Sanctum bearer tokens
    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('customer auth verify endpoint confirms authenticated customer identity', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer);

    $response = $this->withHeader('X-Customer-Token', $token)
        ->getJson('http://acme.localhost/api/portal/auth/verify');

    $response->assertStatus(200)
        ->assertJson([
            'valid' => true,
            'customer' => [
                'id' => $this->acmeCustomer->id,
                'name' => 'Acme Customer',
                'email' => 'acme_customer@example.com',
            ],
        ]);
});

test('customer cannot view internal notes on ticket', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    $agent = User::create([
        'name' => 'Support Agent',
        'email' => 'agent@example.com',
        'password' => bcrypt('password'),
    ]);

    // Create a public reply
    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Public question from customer',
    ]);

    // Create an internal agent note
    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => User::class,
        'author_id' => (string) $agent->id,
        'body' => 'CONFIDENTIAL: Agent internal notes here',
    ]);

    $response = $this->withHeader('X-Customer-Token', $token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(200);

    $messages = $response->json('messages');
    expect(count($messages))->toBe(1)
        ->and($messages[0]['body'])->toBe('Public question from customer');
});

test('customer cannot access soft-deleted ticket', function () {
    $token = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    $this->acmeTicket->delete();

    $response = $this->withHeader('X-Customer-Token', $token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(404);
});
