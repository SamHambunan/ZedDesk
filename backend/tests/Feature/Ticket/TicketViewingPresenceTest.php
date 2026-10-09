<?php

use App\Context\OrganizationContext;
use App\Events\MemberInboxChanged;
use App\Events\TicketCreated;
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

afterEach(function () {
    Carbon::setTestNow();
    OrganizationContext::clear();
});

test('only a current Organization Member can join current Ticket viewing Presence with authenticated identity', function () {
    Event::fake([MemberInboxChanged::class, TicketCreated::class]);
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    Carbon::setTestNow('2026-10-09 12:01:00 UTC');

    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $agent = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    $member = OrganizationMember::create(['organization_id' => $acme->id, 'user_id' => $agent->id, 'role' => 'agent']);
    $betaAgent = User::create(['name' => 'Beta Agent', 'email' => 'agent@beta.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $beta->id, 'user_id' => $betaAgent->id, 'role' => 'agent']);
    $customer = Customer::create(['organization_id' => $acme->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $ticket = Ticket::create(['organization_id' => $acme->id, 'customer_id' => $customer->id, 'subject' => 'Viewing']);
    $discovery = "http://acme.localhost/api/tickets/{$ticket->id}/viewing-channel";

    $this->getJson($discovery)->assertUnauthorized();
    $customerToken = app(CustomerTokenService::class)->generateToken($customer, $ticket);
    $this->withHeader('X-Customer-Token', $customerToken)->postJson('http://acme.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456', 'channel_name' => 'presence-ticket.'.$ticket->id.'.viewers.'.intdiv(now()->timestamp, 300),
    ])->assertUnauthorized();

    Sanctum::actingAs($agent);
    $channel = $this->getJson($discovery)->assertOk()->json('channel');
    expect($channel)->toBe('presence-ticket.'.$ticket->id.'.viewers.'.intdiv(now()->timestamp, 300));
    $authorize = fn (string $host, string $name) => $this->postJson("http://{$host}.localhost/api/broadcasting/auth", [
        'socket_id' => '123.456', 'channel_name' => $name, 'member_id' => 9999, 'name' => 'Forged',
    ]);
    $identity = json_decode($authorize('acme', $channel)->assertOk()->json('channel_data'), true, flags: JSON_THROW_ON_ERROR);
    expect($identity)->toBe(['user_id' => (string) $member->id, 'user_info' => ['member_id' => $member->id, 'name' => 'Agent']]);
    $authorize('beta', $channel)->assertForbidden();

    Sanctum::actingAs($betaAgent);
    $authorize('beta', $channel)->assertForbidden();
    $this->getJson("http://beta.localhost/api/tickets/{$ticket->id}/viewing-channel")->assertNotFound();
    Sanctum::actingAs($agent);

    Carbon::setTestNow('2026-10-09 12:06:00 UTC');
    $next = $this->getJson($discovery)->assertOk()->json('channel');
    expect($next)->not->toBe($channel);
    $authorize('acme', $channel)->assertForbidden();
    $authorize('acme', $next)->assertOk();

    $member->delete();
    $authorize('acme', $next)->assertForbidden();
    $this->getJson($discovery)->assertForbidden();
});
