<?php

use App\Context\OrganizationContext;
use App\Events\TicketMessageCreated;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->customer = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $this->user = User::create([
        'name' => 'Agent',
        'email' => 'agent@acme.test',
        'password' => bcrypt('password'),
    ]);
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->user->id,
        'role' => 'agent',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Conversation',
    ]);
    Event::fake([TicketMessageCreated::class]);
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('staff Ticket channel requires current membership and generation', function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    Carbon::setTestNow('2026-10-07 12:01:00 UTC');
    $url = "http://acme.localhost/api/tickets/{$this->ticket->id}/live-channel";

    $this->getJson($url)->assertUnauthorized();
    $this->withHeader('X-Customer-Token', app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket))
        ->postJson('http://acme.localhost/api/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => 'private-ticket.'.$this->ticket->id.'.'.intdiv(Carbon::now()->timestamp, 300),
        ])->assertUnauthorized();

    Sanctum::actingAs($this->user);
    $channel = $this->getJson($url)->assertOk()->json('channel');
    expect($channel)->toBe('private-ticket.'.$this->ticket->id.'.'.intdiv(Carbon::now()->timestamp, 300));

    $authorize = fn (string $host, string $name) => $this->postJson("http://{$host}.localhost/api/broadcasting/auth", [
        'socket_id' => '123.456',
        'channel_name' => $name,
    ]);
    $authorize('acme', $channel)->assertOk();
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $betaUser = User::create(['name' => 'Beta Agent', 'email' => 'agent@beta.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $beta->id, 'user_id' => $betaUser->id, 'role' => 'agent']);
    Sanctum::actingAs($betaUser);
    $authorize('beta', $channel)->assertForbidden();
    $this->getJson("http://beta.localhost/api/tickets/{$this->ticket->id}/live-channel")->assertNotFound();
    Sanctum::actingAs($this->user);

    Carbon::setTestNow('2026-10-07 12:06:00 UTC');
    $authorize('acme', $channel)->assertForbidden();
    $current = $this->getJson($url)->assertOk()->json('channel');
    OrganizationMember::where('organization_id', $this->organization->id)->delete();
    $authorize('acme', $current)->assertForbidden();
});

test('staff Public Reply emits a small revisioned signal and REST exposes the conversation', function () {
    Sanctum::actingAs($this->user);

    $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Public answer',
    ])->assertCreated();

    Event::assertDispatched(TicketMessageCreated::class);
    $event = Event::dispatched(TicketMessageCreated::class)[0][0];
    expect($event->broadcastWith())->toMatchArray([
        'ticket_id' => $this->ticket->id,
        'change_type' => 'message_created',
    ]);
    expect($event->broadcastWith()['revision'])->toBeGreaterThan(1);
    expect(array_keys($event->broadcastWith()))->toEqualCanonicalizing([
        'event_id', 'organization_id', 'ticket_id', 'change_type', 'revision',
    ]);

    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}")
        ->assertOk()
        ->assertJsonPath('ticket.revision', $event->broadcastWith()['revision'])
        ->assertJsonFragment(['body' => 'Public answer']);
});

test('Internal Note with an attachment emits only IDs and exposes the note to staff REST', function () {
    Storage::fake('private');
    Sanctum::actingAs($this->user);
    $before = $this->ticket->fresh()->revision;

    $this->post("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Private draft',
        'attachments' => [UploadedFile::fake()->create('internal.pdf', 10, 'application/pdf')],
    ], ['Accept' => 'application/json'])->assertCreated();

    Event::assertDispatchedTimes(TicketMessageCreated::class, 1);
    $signal = Event::dispatched(TicketMessageCreated::class)[0][0]->broadcastWith();
    expect($signal['revision'])->toBeGreaterThan($before)
        ->and(array_keys($signal))->toEqualCanonicalizing([
            'event_id', 'organization_id', 'ticket_id', 'change_type', 'revision',
        ]);
    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}")
        ->assertOk()
        ->assertJsonPath('ticket.revision', $signal['revision'])
        ->assertJsonFragment(['body' => 'Private draft']);
});

test('Customer Public Reply with an attachment signals staff and REST recovers the new revision', function () {
    Storage::fake('private');
    $token = app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket);
    $before = $this->ticket->fresh()->revision;

    $this->post("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
        'message' => 'Customer update',
        'attachments' => [UploadedFile::fake()->create('screenshot.png', 10, 'image/png')],
    ], ['X-Customer-Token' => $token, 'Accept' => 'application/json'])->assertCreated();

    Event::assertDispatchedTimes(TicketMessageCreated::class, 1);
    $event = Event::dispatched(TicketMessageCreated::class)[0][0];
    expect($event->broadcastWith()['revision'])->toBeGreaterThan($before)
        ->and($event->broadcastWith()['ticket_id'])->toBe($this->ticket->id);

    Sanctum::actingAs($this->user);
    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}")
        ->assertOk()
        ->assertJsonPath('ticket.revision', $event->broadcastWith()['revision'])
        ->assertJsonFragment(['body' => 'Customer update']);
});

test('closed Ticket rejects new messages without a signal', function () {
    $this->ticket->update(['status' => 'closed']);
    Sanctum::actingAs($this->user);
    $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Too late',
    ])->assertUnprocessable();
    Event::assertNotDispatched(TicketMessageCreated::class);
});
