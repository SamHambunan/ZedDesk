<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Concurrent editing',
    ]);
    $this->members = collect(['Ada', 'Ben'])->map(function ($name) use ($organization) {
        $user = User::create([
            'name' => $name,
            'email' => strtolower($name).'@acme.test',
            'password' => bcrypt('password'),
        ]);
        OrganizationMember::create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'agent',
        ]);

        return $user;
    });
    $this->url = "http://acme.localhost/api/tickets/{$this->ticket->id}";
    Event::fake([TicketChanged::class]);
});

afterEach(fn () => OrganizationContext::clear());

test('a second Status edit from the same read conflicts without changing the winner or signaling', function () {
    Sanctum::actingAs($this->members[0]);
    $read = $this->getJson($this->url)->assertOk()->json('ticket');
    expect($read['status'])->toBe('new');

    $this->patchJson($this->url.'/status', [
        'status' => 'open', 'expected_status' => $read['status'],
    ])->assertOk();

    Sanctum::actingAs($this->members[1]);
    $this->patchJson($this->url.'/status', [
        'status' => 'open', 'expected_status' => $read['status'],
    ])->assertStatus(409)
        ->assertJsonPath('current.status', 'open')
        ->assertJsonPath('current.revision', 2);

    $this->getJson($this->url)->assertJsonPath('ticket.status', 'open');
    Event::assertDispatchedTimes(TicketChanged::class, 1);
});

test('a second Priority edit from the same read conflicts without changing the winner or signaling', function () {
    Sanctum::actingAs($this->members[0]);
    $read = $this->getJson($this->url)->assertOk()->json('ticket');
    expect($read['priority'])->toBe('medium');

    $this->patchJson($this->url.'/priority', [
        'priority' => 'high', 'expected_priority' => $read['priority'],
    ])->assertOk();

    Sanctum::actingAs($this->members[1]);
    $this->patchJson($this->url.'/priority', [
        'priority' => 'urgent', 'expected_priority' => $read['priority'],
    ])->assertStatus(409)
        ->assertJsonPath('current.priority', 'high')
        ->assertJsonPath('current.revision', 2);

    $this->getJson($this->url)->assertJsonPath('ticket.priority', 'high');
    Event::assertDispatchedTimes(TicketChanged::class, 1);
});

test('Status and Priority edits based on one read succeed independently in either order', function () {
    Sanctum::actingAs($this->members[0]);
    $read = $this->getJson($this->url)->assertOk()->json('ticket');

    $this->patchJson($this->url.'/status', [
        'status' => 'open', 'expected_status' => $read['status'],
    ])->assertOk();

    Sanctum::actingAs($this->members[1]);
    $this->patchJson($this->url.'/priority', [
        'priority' => 'high', 'expected_priority' => $read['priority'],
    ])->assertOk();

    $read = $this->getJson($this->url)->assertOk()->json('ticket');
    $this->patchJson($this->url.'/priority', [
        'priority' => 'urgent', 'expected_priority' => $read['priority'],
    ])->assertOk();

    Sanctum::actingAs($this->members[0]);
    $this->patchJson($this->url.'/status', [
        'status' => 'pending', 'expected_status' => $read['status'],
    ])->assertOk();

    $this->getJson($this->url)->assertOk()
        ->assertJsonPath('ticket.status', 'pending')
        ->assertJsonPath('ticket.priority', 'urgent');
});

test('Public Replies and Internal Notes append after Priority edits and closed Tickets still reject them', function () {
    Sanctum::actingAs($this->members[0]);
    $this->patchJson($this->url.'/priority', ['priority' => 'high'])->assertOk();

    Sanctum::actingAs($this->members[1]);
    $this->postJson($this->url.'/messages', [
        'message_type' => 'internal_note', 'body' => 'Checking this',
    ])->assertCreated();
    $this->postJson($this->url.'/messages', [
        'message_type' => 'public_reply', 'body' => 'We are working on it',
    ])->assertCreated();

    $this->getJson($this->url)->assertOk()->assertJsonCount(2, 'messages');
    $this->ticket->update(['status' => 'closed']);
    $this->postJson($this->url.'/messages', [
        'message_type' => 'internal_note', 'body' => 'Too late',
    ])->assertUnprocessable();
    $this->getJson($this->url)->assertJsonCount(2, 'messages');
});
