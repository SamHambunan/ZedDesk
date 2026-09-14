<?php

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use App\Services\TicketStateMachine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->agentUser = User::create([
        'name' => 'Support Agent',
        'email' => 'agent@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $this->agentMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->agentUser->id,
        'role' => 'agent',
    ]);

    $this->stateMachine = app(TicketStateMachine::class);
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('agent public reply automatically transitions new ticket to pending and sets first_replied_at', function () {
    $now = Carbon::parse('2026-09-14 14:00:00');
    Carbon::setTestNow($now);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Issue with account',
        'status' => TicketStatus::NEW,
    ]);

    expect($ticket->first_replied_at)->toBeNull();

    $reply = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => OrganizationMember::class,
        'author_id' => $this->agentMember->id,
        'body' => 'Hello, I am looking into this.',
    ]);

    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::PENDING)
        ->and($ticket->first_replied_at->toDateTimeString())->toBe('2026-09-14 14:00:00')
        ->and($reply->ticket_id)->toBe($ticket->id);
});

test('agent public reply automatically transitions open ticket to pending', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open issue',
        'status' => TicketStatus::OPEN,
    ]);

    $ticket->addPublicReply($this->agentMember, 'Please provide more details.');
    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::PENDING);
});

test('subsequent agent public replies on pending ticket preserve pending status', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Pending issue',
        'status' => TicketStatus::PENDING,
        'first_replied_at' => now()->subHour(),
    ]);

    $firstRepliedAt = $ticket->first_replied_at->toDateTimeString();

    $ticket->addPublicReply($this->agentMember, 'Follow-up message.');
    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::PENDING)
        ->and($ticket->first_replied_at->toDateTimeString())->toBe($firstRepliedAt);
});

test('agent public reply supports target_status payload override to resolved', function () {
    $resolvedTime = Carbon::parse('2026-09-14 16:30:00');
    Carbon::setTestNow($resolvedTime);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Question about hours',
        'status' => TicketStatus::OPEN,
    ]);

    // Pass target_status in creation payload
    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => OrganizationMember::class,
        'author_id' => $this->agentMember->id,
        'body' => 'We are open 9am-5pm. Closing ticket.',
        'target_status' => TicketStatus::RESOLVED,
    ]);

    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::RESOLVED)
        ->and($ticket->resolved_at->toDateTimeString())->toBe('2026-09-14 16:30:00');
});

test('agent public reply supports status string payload override to open', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Investigating bug',
        'status' => TicketStatus::NEW,
    ]);

    // Pass status in payload override
    $ticket->addPublicReply($this->agentMember, 'We are working on it internally.', 'open');
    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::OPEN);
});

test('customer reply to pending ticket automatically transitions status to open', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Pending inquiry',
        'status' => TicketStatus::PENDING,
    ]);

    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Here are the requested screenshots.',
    ]);

    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::OPEN);
});

test('customer reply to resolved ticket automatically reopens status to open and clears resolved_at', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Resolved issue returning',
        'status' => TicketStatus::RESOLVED,
        'resolved_at' => now()->subDay(),
    ]);

    expect($ticket->resolved_at)->not->toBeNull();

    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'The bug happened again today!',
    ]);

    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::OPEN)
        ->and($ticket->resolved_at)->toBeNull();
});

test('customer reply to open ticket preserves open status', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Active open issue',
        'status' => TicketStatus::OPEN,
    ]);

    TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Adding one more note.',
    ]);

    $ticket->refresh();

    expect($ticket->status)->toBe(TicketStatus::OPEN);
});

test('internal notes never alter ticket status or lifecycle timestamps', function () {
    $statuses = [
        TicketStatus::NEW,
        TicketStatus::OPEN,
        TicketStatus::PENDING,
        TicketStatus::RESOLVED,
    ];

    foreach ($statuses as $initialStatus) {
        $ticket = Ticket::create([
            'organization_id' => $this->acmeOrg->id,
            'customer_id' => $this->acmeCustomer->id,
            'subject' => "Status test for {$initialStatus->value}",
            'status' => $initialStatus,
            'resolved_at' => $initialStatus === TicketStatus::RESOLVED ? now() : null,
        ]);

        $originalResolvedAt = $ticket->resolved_at?->toDateTimeString();

        $note = $ticket->addInternalNote($this->agentMember, "Internal note for {$initialStatus->value}");

        $ticket->refresh();

        expect($ticket->status)->toBe($initialStatus)
            ->and($ticket->resolved_at?->toDateTimeString())->toBe($originalResolvedAt)
            ->and($note->isInternalNote())->toBeTrue();
    }
});

test('system rejects message creation on closed tickets', function () {
    $closedTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed ticket',
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);

    // Agent public reply on closed ticket rejected
    expect(function () use ($closedTicket) {
        TicketMessage::create([
            'organization_id' => $this->acmeOrg->id,
            'ticket_id' => $closedTicket->id,
            'message_type' => TicketMessageType::PUBLIC_REPLY,
            'author_type' => OrganizationMember::class,
            'author_id' => $this->agentMember->id,
            'body' => 'Trying to reply to closed ticket',
        ]);
    })->toThrow(InvalidTicketTransitionException::class);

    // Customer reply on closed ticket rejected
    expect(function () use ($closedTicket) {
        TicketMessage::create([
            'organization_id' => $this->acmeOrg->id,
            'ticket_id' => $closedTicket->id,
            'message_type' => TicketMessageType::PUBLIC_REPLY,
            'author_type' => Customer::class,
            'author_id' => $this->acmeCustomer->id,
            'body' => 'Trying to reply to closed ticket',
        ]);
    })->toThrow(InvalidTicketTransitionException::class);

    // Internal note on closed ticket rejected
    expect(function () use ($closedTicket) {
        TicketMessage::create([
            'organization_id' => $this->acmeOrg->id,
            'ticket_id' => $closedTicket->id,
            'message_type' => TicketMessageType::INTERNAL_NOTE,
            'author_type' => OrganizationMember::class,
            'author_id' => $this->agentMember->id,
            'body' => 'Trying to write internal note to closed ticket',
        ]);
    })->toThrow(InvalidTicketTransitionException::class);
});
