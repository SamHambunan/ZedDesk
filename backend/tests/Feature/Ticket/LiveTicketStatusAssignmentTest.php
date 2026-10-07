<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
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
    $this->member = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->user->id,
        'role' => 'agent',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Status and Assignment',
    ]);
    Event::fake([TicketChanged::class]);
    Sanctum::actingAs($this->user);
});

afterEach(fn () => OrganizationContext::clear());

test('direct Ticket Status change signals Organization and Ticket channels with current revision', function () {
    $url = "http://acme.localhost/api/tickets/{$this->ticket->id}";

    $this->patchJson($url.'/status', ['status' => 'open'])->assertOk();

    Event::assertDispatchedTimes(TicketChanged::class, 1);
    $event = Event::dispatched(TicketChanged::class)[0][0];
    expect($event->broadcastWith())->toMatchArray([
        'organization_id' => $this->organization->id,
        'ticket_id' => $this->ticket->id,
        'change_type' => 'status_changed',
        'revision' => 2,
    ]);
    expect(array_keys($event->broadcastWith()))->toEqualCanonicalizing([
        'event_id', 'organization_id', 'ticket_id', 'change_type', 'revision',
    ]);
    expect($event->broadcastOn())->toHaveCount(2);
    $this->getJson($url)->assertOk()
        ->assertJsonPath('ticket.status', 'open')
        ->assertJsonPath('ticket.revision', 2);
});

test('claim advances Ticket Status and Assignment together and REST exposes both', function () {
    $url = "http://acme.localhost/api/tickets/{$this->ticket->id}";

    $this->postJson($url.'/claim')->assertOk();

    Event::assertDispatchedTimes(TicketChanged::class, 2);
    $signals = Event::dispatched(TicketChanged::class)->map(fn ($dispatch) => $dispatch[0]->broadcastWith());
    expect($signals->pluck('change_type')->all())->toBe(['status_changed', 'assignment_changed']);
    expect($signals->pluck('revision')->all())->toBe([2, 2]);

    $this->getJson($url)->assertOk()
        ->assertJsonPath('ticket.status', 'open')
        ->assertJsonPath('ticket.assigned_member_id', $this->member->id)
        ->assertJsonPath('ticket.revision', 2);
});

test('assignment change and unassignment each advance revision and emit a signal', function () {
    $team = Team::create(['organization_id' => $this->organization->id, 'name' => 'Support']);
    $team->members()->attach($this->member->id);
    $url = "http://acme.localhost/api/tickets/{$this->ticket->id}";

    $this->postJson($url.'/assign', [
        'team_id' => $team->id,
        'member_id' => $this->member->id,
    ])->assertOk();

    $this->postJson($url.'/assign', [
        'team_id' => null,
        'member_id' => null,
    ])->assertOk();

    Event::assertDispatchedTimes(TicketChanged::class, 2);
    $signals = Event::dispatched(TicketChanged::class)->map(fn ($dispatch) => $dispatch[0]->broadcastWith());
    expect($signals->pluck('change_type')->all())->toBe(['assignment_changed', 'assignment_changed'])
        ->and($signals->pluck('revision')->all())->toBe([2, 3]);
    $this->getJson($url)->assertOk()
        ->assertJsonPath('ticket.assigned_team_id', null)
        ->assertJsonPath('ticket.assigned_member_id', null)
        ->assertJsonPath('ticket.revision', 3);
});
