<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->org = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->customer = Customer::create([
        'organization_id' => $this->org->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->user = User::create([
        'name' => 'Agent Smith',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password'),
    ]);

    $this->member = OrganizationMember::create([
        'organization_id' => $this->org->id,
        'user_id' => $this->user->id,
        'role' => Role::AGENT->value,
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket priority enum defines low, medium, high, and urgent urgency classifications', function () {
    expect(TicketPriority::values())->toBe(['low', 'medium', 'high', 'urgent'])
        ->and(TicketPriority::LOW->value)->toBe('low')
        ->and(TicketPriority::MEDIUM->value)->toBe('medium')
        ->and(TicketPriority::HIGH->value)->toBe('high')
        ->and(TicketPriority::URGENT->value)->toBe('urgent');
});

test('ticket model defaults to medium priority when priority is not specified', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Default Priority Ticket',
    ]);

    expect($ticket->priority)->toBe(TicketPriority::MEDIUM);
    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'priority' => 'medium',
    ]);
});

test('ticket can be created with each priority', function (TicketPriority $priority) {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => "Priority {$priority->value} Ticket",
        'priority' => $priority,
    ]);

    expect($ticket->priority)->toBe($priority);
    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'priority' => $priority->value,
    ]);
})->with([
    'low' => TicketPriority::LOW,
    'medium' => TicketPriority::MEDIUM,
    'high' => TicketPriority::HIGH,
    'urgent' => TicketPriority::URGENT,
]);

test('ticket priority can be updated to another valid priority', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Upgradable Priority Ticket',
        'priority' => TicketPriority::LOW,
    ]);

    expect($ticket->priority)->toBe(TicketPriority::LOW);

    $ticket->updatePriority(TicketPriority::URGENT);

    expect($ticket->fresh()->priority)->toBe(TicketPriority::URGENT);
    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'priority' => 'urgent',
    ]);
});

test('ticket priority update accepts string representation of priority', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'String Priority Ticket',
        'priority' => TicketPriority::LOW,
    ]);

    $ticket->updatePriority('high');

    expect($ticket->fresh()->priority)->toBe(TicketPriority::HIGH);
});

test('ticket priority update rejects invalid priority string', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Invalid Priority Test',
    ]);

    expect(fn () => $ticket->updatePriority('critical'))
        ->toThrow(ValueError::class);
});

test('closed ticket rejects priority update preserving audit immutability', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Closed Ticket Priority Test',
        'status' => TicketStatus::CLOSED,
        'priority' => TicketPriority::MEDIUM,
    ]);

    expect(fn () => $ticket->updatePriority(TicketPriority::HIGH))
        ->toThrow(InvalidTicketTransitionException::class);

    expect($ticket->fresh()->priority)->toBe(TicketPriority::MEDIUM);
});

test('organization member can update ticket priority via api', function () {
    Sanctum::actingAs($this->user);

    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'API Priority Test',
        'priority' => TicketPriority::LOW,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", [
        'priority' => 'urgent',
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.priority', 'urgent');

    expect($ticket->fresh()->priority)->toBe(TicketPriority::URGENT);
});

test('updating ticket priority via api validates priority enum', function () {
    Sanctum::actingAs($this->user);

    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'API Invalid Priority Test',
        'priority' => TicketPriority::LOW,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", [
        'priority' => 'super_critical',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['priority']);
});

test('updating priority on closed ticket via api returns 422', function () {
    Sanctum::actingAs($this->user);

    $ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Closed Ticket API Priority Test',
        'status' => TicketStatus::CLOSED,
        'priority' => TicketPriority::MEDIUM,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", [
        'priority' => 'high',
    ]);

    $response->assertStatus(422);
    expect($ticket->fresh()->priority)->toBe(TicketPriority::MEDIUM);
});
