<?php

use App\Context\OrganizationContext;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\TicketNumberGenerator;
use App\Services\TicketStateMachine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

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
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);

    $this->stateMachine = new TicketStateMachine;
    $this->numberGenerator = new TicketNumberGenerator;
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('ticket number generator generates sequential numbers starting at 1 per organization', function () {
    $num1 = $this->numberGenerator->generate($this->acmeOrg);
    $num2 = $this->numberGenerator->generate($this->acmeOrg);
    $num3 = $this->numberGenerator->generate($this->acmeOrg);

    expect($num1)->toBe(1)
        ->and($num2)->toBe(2)
        ->and($num3)->toBe(3);

    $this->acmeOrg->refresh();
    expect($this->acmeOrg->ticket_counter)->toBe(3);
});

test('ticket numbers increment independently across different organizations', function () {
    $acme1 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme First Ticket',
    ]);

    $beta1 = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta First Ticket',
    ]);

    $acme2 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Second Ticket',
    ]);

    expect($acme1->ticket_number)->toBe(1)
        ->and($beta1->ticket_number)->toBe(1)
        ->and($acme2->ticket_number)->toBe(2);

    $this->acmeOrg->refresh();
    $this->betaOrg->refresh();

    expect($this->acmeOrg->ticket_counter)->toBe(2)
        ->and($this->betaOrg->ticket_counter)->toBe(1);
});

test('state machine allows valid new to open transition and sets first_replied_at', function () {
    $now = Carbon::parse('2026-09-14 12:00:00');
    Carbon::setTestNow($now);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'New Ticket',
        'status' => TicketStatus::NEW,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::OPEN))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);

    expect($ticket->status)->toBe(TicketStatus::OPEN)
        ->and($ticket->first_replied_at->toDateTimeString())->toBe('2026-09-14 12:00:00')
        ->and($ticket->resolved_at)->toBeNull()
        ->and($ticket->closed_at)->toBeNull();

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'status' => 'open',
        'first_replied_at' => '2026-09-14 12:00:00',
    ]);
});

test('subsequent transitions to open preserve initial first_replied_at timestamp', function () {
    $initialTime = Carbon::parse('2026-09-14 10:00:00');
    Carbon::setTestNow($initialTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Reopen Ticket',
        'status' => TicketStatus::NEW,
    ]);

    $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);
    expect($ticket->first_replied_at->toDateTimeString())->toBe('2026-09-14 10:00:00');

    // Transition to pending
    $this->stateMachine->transitionTo($ticket, TicketStatus::PENDING);

    // Reopen later
    $laterTime = Carbon::parse('2026-09-14 14:00:00');
    Carbon::setTestNow($laterTime);

    $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);
    expect($ticket->first_replied_at->toDateTimeString())->toBe('2026-09-14 10:00:00');
});

test('state machine allows open to pending transition', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open Ticket',
        'status' => TicketStatus::OPEN,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::PENDING))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::PENDING);
    expect($ticket->status)->toBe(TicketStatus::PENDING);
});

test('state machine allows pending to open transition', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Pending Ticket',
        'status' => TicketStatus::PENDING,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::OPEN))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);
    expect($ticket->status)->toBe(TicketStatus::OPEN);
});

test('state machine allows transition to resolved and sets resolved_at', function () {
    $resolvedTime = Carbon::parse('2026-09-14 15:30:00');
    Carbon::setTestNow($resolvedTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Resolving Ticket',
        'status' => TicketStatus::OPEN,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::RESOLVED))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::RESOLVED);

    expect($ticket->status)->toBe(TicketStatus::RESOLVED)
        ->and($ticket->resolved_at->toDateTimeString())->toBe('2026-09-14 15:30:00');

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'status' => 'resolved',
        'resolved_at' => '2026-09-14 15:30:00',
    ]);
});

test('state machine allows pending to resolved transition and sets resolved_at', function () {
    $resolvedTime = Carbon::parse('2026-09-14 16:00:00');
    Carbon::setTestNow($resolvedTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Pending resolving Ticket',
        'status' => TicketStatus::PENDING,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::RESOLVED))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::RESOLVED);

    expect($ticket->status)->toBe(TicketStatus::RESOLVED)
        ->and($ticket->resolved_at->toDateTimeString())->toBe('2026-09-14 16:00:00');
});

test('reopening resolved ticket clears resolved_at timestamp', function () {
    $resolvedTime = Carbon::parse('2026-09-14 12:00:00');
    Carbon::setTestNow($resolvedTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Reopen Resolved Ticket',
        'status' => TicketStatus::RESOLVED,
        'resolved_at' => $resolvedTime,
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::OPEN))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);

    expect($ticket->status)->toBe(TicketStatus::OPEN)
        ->and($ticket->resolved_at)->toBeNull();

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'status' => 'open',
        'resolved_at' => null,
    ]);
});

test('state machine allows resolved to closed transition and sets closed_at', function () {
    $closedTime = Carbon::parse('2026-09-14 18:00:00');
    Carbon::setTestNow($closedTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closing Ticket',
        'status' => TicketStatus::RESOLVED,
        'resolved_at' => Carbon::parse('2026-09-14 17:00:00'),
    ]);

    expect($this->stateMachine->canTransitionTo($ticket, TicketStatus::CLOSED))->toBeTrue();

    $this->stateMachine->transitionTo($ticket, TicketStatus::CLOSED);

    expect($ticket->status)->toBe(TicketStatus::CLOSED)
        ->and($ticket->closed_at->toDateTimeString())->toBe('2026-09-14 18:00:00');

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'status' => 'closed',
        'closed_at' => '2026-09-14 18:00:00',
    ]);
});

test('state machine rejects invalid status transitions with InvalidTicketTransitionException', function () {
    $newTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'New Ticket Invalid',
        'status' => TicketStatus::NEW,
    ]);

    // new -> resolved is invalid
    expect($this->stateMachine->canTransitionTo($newTicket, TicketStatus::RESOLVED))->toBeFalse();
    expect(fn () => $this->stateMachine->transitionTo($newTicket, TicketStatus::RESOLVED))
        ->toThrow(InvalidTicketTransitionException::class);

    // new -> closed is invalid
    expect($this->stateMachine->canTransitionTo($newTicket, TicketStatus::CLOSED))->toBeFalse();
    expect(fn () => $this->stateMachine->transitionTo($newTicket, TicketStatus::CLOSED))
        ->toThrow(InvalidTicketTransitionException::class);

    // open -> new is invalid
    $openTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open Ticket Invalid',
        'status' => TicketStatus::OPEN,
    ]);
    expect($this->stateMachine->canTransitionTo($openTicket, TicketStatus::NEW))->toBeFalse();
    expect(fn () => $this->stateMachine->transitionTo($openTicket, TicketStatus::NEW))
        ->toThrow(InvalidTicketTransitionException::class);
});

test('closed tickets are completely immutable and reject any transitions', function () {
    $closedTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Immutable Closed Ticket',
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);

    foreach (TicketStatus::cases() as $status) {
        expect($this->stateMachine->canTransitionTo($closedTicket, $status))->toBeFalse();
        expect(fn () => $this->stateMachine->transitionTo($closedTicket, $status))
            ->toThrow(InvalidTicketTransitionException::class);
    }
});

test('closed tickets reject status and attribute mutations directly on model', function () {
    $closedTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Strict Immutable Ticket',
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);

    expect(function () use ($closedTicket) {
        $closedTicket->update(['subject' => 'Tampered Subject']);
    })->toThrow(InvalidTicketTransitionException::class);

    expect(function () use ($closedTicket) {
        $closedTicket->update(['status' => TicketStatus::OPEN]);
    })->toThrow(InvalidTicketTransitionException::class);
});

test('closed tickets reject conversation replies', function () {
    $openTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open Reply Allowed',
        'status' => TicketStatus::OPEN,
    ]);

    $closedTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed Reply Denied',
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);

    expect($this->stateMachine->canReply($openTicket))->toBeTrue();
    expect($this->stateMachine->canReply($closedTicket))->toBeFalse();

    // assertCanReply does not throw for open ticket
    $this->stateMachine->assertCanReply($openTicket);

    // assertCanReply throws for closed ticket
    expect(fn () => $this->stateMachine->assertCanReply($closedTicket))
        ->toThrow(InvalidTicketTransitionException::class);
});

test('tickets cannot jump directly to closed from open or pending without resolution', function () {
    $openTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open Ticket Direct Close',
        'status' => TicketStatus::OPEN,
    ]);

    expect($this->stateMachine->canTransitionTo($openTicket, TicketStatus::CLOSED))->toBeFalse();
    expect(fn () => $this->stateMachine->transitionTo($openTicket, TicketStatus::CLOSED))
        ->toThrow(InvalidTicketTransitionException::class);

    $pendingTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Pending Ticket Direct Close',
        'status' => TicketStatus::PENDING,
    ]);

    expect($this->stateMachine->canTransitionTo($pendingTicket, TicketStatus::CLOSED))->toBeFalse();
    expect(fn () => $this->stateMachine->transitionTo($pendingTicket, TicketStatus::CLOSED))
        ->toThrow(InvalidTicketTransitionException::class);
});

test('rapid sequential creation produces gapless sequence under transactional locking', function () {
    $ticketNumbers = [];

    for ($i = 0; $i < 10; $i++) {
        $ticket = Ticket::create([
            'organization_id' => $this->acmeOrg->id,
            'customer_id' => $this->acmeCustomer->id,
            'subject' => "Sequential ticket {$i}",
        ]);
        $ticketNumbers[] = $ticket->ticket_number;
    }

    expect($ticketNumbers)->toBe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    $this->acmeOrg->refresh();
    expect($this->acmeOrg->ticket_counter)->toBe(10);
});

test('ticket model sets default status new and default priority medium when omitted', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Default Attributes Ticket',
    ]);

    expect($ticket->status)->toBe(TicketStatus::NEW)
        ->and($ticket->priority)->toBe(TicketPriority::MEDIUM);
});

test('atomic sequence generator maintains counter integrity under transactions', function () {
    $orgId = $this->acmeOrg->id;

    // Transactional isolation
    DB::transaction(function () use ($orgId) {
        $num1 = (new TicketNumberGenerator)->generate($orgId);
        expect($num1)->toBe(1);

        DB::transaction(function () use ($orgId) {
            $num2 = (new TicketNumberGenerator)->generate($orgId);
            expect($num2)->toBe(2);
        });
    });

    $this->acmeOrg->refresh();
    expect($this->acmeOrg->ticket_counter)->toBe(2);
});
