<?php

use App\Context\OrganizationContext;
use App\Events\CustomerTicketChanged;
use App\Events\TicketChanged;
use App\Events\TicketCreated;
use App\Events\TicketMessageCreated;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Event::fake([
        CustomerTicketChanged::class,
        TicketChanged::class,
        TicketCreated::class,
        TicketMessageCreated::class,
    ]);
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    Carbon::setTestNow('2026-10-07 12:01:00 UTC');
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->customer = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Customer live access',
    ]);
    $this->token = app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket);
    $this->path = "http://acme.localhost/api/portal/tickets/{$this->ticket->id}";
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

function customerChannelAuth(string $path, string $token, string $channel)
{
    return test()->withHeader('X-Customer-Token', $token)->postJson($path.'/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => $channel,
    ]);
}

test('Customer channel requires signed Organization Customer Ticket and current generation', function () {
    $channel = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson($this->path.'/live-channel')->assertOk()->json('channel');
    expect($channel)->toBe('private-customer.ticket.'.$this->ticket->id.'.'.intdiv(now()->timestamp, 300));
    customerChannelAuth($this->path, $this->token, $channel)->assertOk()->assertJsonStructure(['auth']);

    $other = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Other',
        'email' => 'other@acme.test',
    ]);
    $otherToken = app(CustomerTokenService::class)->generateToken($other);
    customerChannelAuth($this->path, $otherToken, $channel)->assertForbidden();
    $unscopedToken = app(CustomerTokenService::class)->generateToken($this->customer);
    customerChannelAuth($this->path, $unscopedToken, $channel)->assertForbidden();
    $otherTicket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Another Ticket',
    ]);
    $otherTicketToken = app(CustomerTokenService::class)->generateToken($this->customer, $otherTicket);
    customerChannelAuth($this->path, $otherTicketToken, $channel)->assertForbidden();
    customerChannelAuth($this->path, $this->token.'tampered', $channel)->assertUnauthorized();
    $expiredToken = app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket, -10);
    customerChannelAuth($this->path, $expiredToken, $channel)->assertUnauthorized();

    $otherOrganization = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $otherCustomer = Customer::create([
        'organization_id' => $otherOrganization->id,
        'name' => 'Beta Customer',
        'email' => 'customer@beta.test',
    ]);
    $crossOrganizationToken = app(CustomerTokenService::class)->generateToken($otherCustomer);
    customerChannelAuth($this->path, $crossOrganizationToken, $channel)->assertForbidden();
    customerChannelAuth("http://beta.localhost/api/portal/tickets/{$this->ticket->id}", $this->token, $channel)->assertForbidden();

    Carbon::setTestNow('2026-10-07 12:06:00 UTC');
    customerChannelAuth($this->path, $this->token, $channel)->assertForbidden();
    $renewed = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson($this->path.'/live-channel')->assertOk()->json('channel');
    expect($renewed)->not->toBe($channel);
    customerChannelAuth($this->path, $this->token, $renewed)->assertOk();

    $agent = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $this->organization->id, 'user_id' => $agent->id, 'role' => 'agent']);
    Sanctum::actingAs($agent);
    $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456', 'channel_name' => $renewed,
    ])->assertForbidden();
});

test('only Public Reply and Ticket Status signal the Customer with no content', function () {
    $agent = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $this->organization->id, 'user_id' => $agent->id, 'role' => 'agent']);
    Sanctum::actingAs($agent);
    $staffPath = "http://acme.localhost/api/tickets/{$this->ticket->id}";

    $this->postJson($staffPath.'/messages', ['message_type' => 'public_reply', 'body' => 'Visible response'])->assertCreated();
    $this->postJson($staffPath.'/messages', ['message_type' => 'internal_note', 'body' => 'Secret draft'])->assertCreated();
    $this->patchJson($staffPath.'/status', ['status' => 'resolved'])->assertOk();

    $signals = Event::dispatched(CustomerTicketChanged::class)->map(fn ($dispatch) => $dispatch[0])->all();
    expect(array_map(fn ($signal) => $signal->changeType, $signals))
        ->toContain(CustomerTicketChanged::MESSAGE_CREATED, CustomerTicketChanged::STATUS_CHANGED)
        ->not->toContain('internal_note');
    foreach ($signals as $signal) {
        expect(array_keys($signal->broadcastWith()))->toEqualCanonicalizing([
            'event_id', 'organization_id', 'ticket_id', 'change_type', 'revision',
        ]);
    }
    expect(count(array_filter($signals, fn ($signal) => $signal->changeType === CustomerTicketChanged::MESSAGE_CREATED)))->toBe(1);
    $this->withHeader('X-Customer-Token', $this->token)->getJson($this->path)
        ->assertOk()->assertJsonFragment(['body' => 'Visible response'])
        ->assertDontSee('Secret draft');
});

test('soft deletion sends generic unavailability and stops later Customer delivery and REST access', function () {
    $channel = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson($this->path.'/live-channel')->assertOk()->json('channel');
    $pending = new CustomerTicketChanged($this->ticket, CustomerTicketChanged::MESSAGE_CREATED);
    $this->ticket->delete();

    $signals = Event::dispatched(CustomerTicketChanged::class)->map(fn ($dispatch) => $dispatch[0])->all();
    $unavailable = $signals[0];
    expect($unavailable->broadcastAs())->toBe('ticket.unavailable');
    expect($unavailable->broadcastWith())->toBe([]);
    expect((string) $unavailable->broadcastOn()[0])->toBe($channel);
    expect($pending->broadcastOn())->toBe([]);
    $this->withHeader('X-Customer-Token', $this->token)->getJson($this->path)->assertNotFound();
    $this->withHeader('X-Customer-Token', $this->token)->getJson($this->path.'/live-channel')->assertNotFound();
    customerChannelAuth($this->path, $this->token, $channel)->assertNotFound();
});

test('queued Customer signals target the current generation after a delay', function () {
    $pending = new CustomerTicketChanged($this->ticket, CustomerTicketChanged::MESSAGE_CREATED);
    $oldChannel = (string) $pending->broadcastOn()[0];

    Carbon::setTestNow('2026-10-07 12:06:00 UTC');
    $newChannel = (string) $pending->broadcastOn()[0];

    expect($newChannel)->not->toBe($oldChannel);
    expect($newChannel)->toBe('private-customer.ticket.'.$this->ticket->id.'.'.intdiv(now()->timestamp, 300));
});

test('delayed deletion reaches the Customer channel that was active when access ended', function () {
    $activeChannel = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson($this->path.'/live-channel')->assertOk()->json('channel');
    $this->ticket->delete();
    $unavailable = Event::dispatched(CustomerTicketChanged::class)[0][0];

    Carbon::setTestNow('2026-10-07 12:06:00 UTC');

    expect((string) $unavailable->broadcastOn()[0])->toBe($activeChannel);
    expect($unavailable->broadcastAs())->toBe('ticket.unavailable');
    expect($unavailable->broadcastWith())->toBe([]);
});
