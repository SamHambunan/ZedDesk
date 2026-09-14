<?php

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Exceptions\ImmutableMessageException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

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

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Help with login',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket_messages table has expected schema and uuid primary key', function () {
    expect(Schema::hasTable('ticket_messages'))->toBeTrue();

    expect(Schema::hasColumns('ticket_messages', [
        'id',
        'organization_id',
        'ticket_id',
        'message_type',
        'author_type',
        'author_id',
        'body',
        'created_at',
        'updated_at',
    ]))->toBeTrue();
});

test('foreign key cascade deletes ticket messages when ticket is deleted', function () {
    $message = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Initial inquiry details',
    ]);

    $messageId = $message->id;
    $this->acmeTicket->forceDelete();

    $this->assertDatabaseMissing('ticket_messages', [
        'id' => $messageId,
    ]);
});

test('foreign key cascade deletes ticket messages when organization is deleted', function () {
    $message = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Org cascade test message',
    ]);

    $messageId = $message->id;
    $this->acmeOrg->delete();

    $this->assertDatabaseMissing('ticket_messages', [
        'id' => $messageId,
    ]);
});

test('ticket message supports polymorphic authors for customer, user, and organization member', function () {
    $user = User::create([
        'name' => 'Agent Smith',
        'email' => 'smith@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $member = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    // 1. Customer author
    $customerMsg = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Customer question',
    ]);

    expect($customerMsg->author)->toBeInstanceOf(Customer::class)
        ->and($customerMsg->author->id)->toBe($this->acmeCustomer->id);

    // 2. OrganizationMember author
    $memberMsg = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => OrganizationMember::class,
        'author_id' => $member->id,
        'body' => 'Agent response',
    ]);

    expect($memberMsg->author)->toBeInstanceOf(OrganizationMember::class)
        ->and($memberMsg->author->id)->toBe($member->id);

    // 3. User author
    $userMsg = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => User::class,
        'author_id' => $user->id,
        'body' => 'Internal note from user',
    ]);

    expect($userMsg->author)->toBeInstanceOf(User::class)
        ->and($userMsg->author->id)->toBe($user->id);
});

test('ticket relationships return conversation thread with chronological ordering', function () {
    $user = User::create([
        'name' => 'Agent Alice',
        'email' => 'alice@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $member = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    $msg1 = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'First message',
        'created_at' => now()->subMinutes(10),
    ]);

    $msg2 = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => OrganizationMember::class,
        'author_id' => $member->id,
        'body' => 'Staff note: check logs',
        'created_at' => now()->subMinutes(5),
    ]);

    $msg3 = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => OrganizationMember::class,
        'author_id' => $member->id,
        'body' => 'Public response to customer',
        'created_at' => now(),
    ]);

    $this->acmeTicket->refresh();

    // All messages relation
    expect($this->acmeTicket->messages)->toHaveCount(3)
        ->and($this->acmeTicket->messages->pluck('id')->all())->toBe([$msg1->id, $msg2->id, $msg3->id]);

    // Customer visible relation
    expect($this->acmeTicket->customerVisibleMessages)->toHaveCount(2)
        ->and($this->acmeTicket->customerVisibleMessages->pluck('id')->all())->toBe([$msg1->id, $msg3->id]);

    // Internal notes relation
    expect($this->acmeTicket->internalNotes)->toHaveCount(1)
        ->and($this->acmeTicket->internalNotes->first()->id)->toBe($msg2->id);
});

test('ticket message query scopes strictly enforce customer and staff visibility boundaries', function () {
    $user = User::create([
        'name' => 'Agent Bob',
        'email' => 'bob@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $member = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    $publicReply = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Public message',
    ]);

    $internalNote = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => OrganizationMember::class,
        'author_id' => $member->id,
        'body' => 'Internal sensitive note',
    ]);

    // Customer visible scope must exclude internal notes
    $customerVisible = TicketMessage::customerVisible()->get();
    expect($customerVisible)->toHaveCount(1)
        ->and($customerVisible->first()->id)->toBe($publicReply->id);

    $forCustomer = TicketMessage::forCustomer()->get();
    expect($forCustomer)->toHaveCount(1)
        ->and($forCustomer->first()->id)->toBe($publicReply->id);

    // Organization member visible scope includes both public replies and internal notes
    $memberVisible = TicketMessage::memberVisible()->get();
    expect($memberVisible)->toHaveCount(2)
        ->and($memberVisible->pluck('id')->all())->toContain($publicReply->id, $internalNote->id);

    // Staff visible scope alias includes both public replies and internal notes
    $staffVisible = TicketMessage::staffVisible()->get();
    expect($staffVisible)->toHaveCount(2)
        ->and($staffVisible->pluck('id')->all())->toContain($publicReply->id, $internalNote->id);

    $forStaff = TicketMessage::forStaff()->get();
    expect($forStaff)->toHaveCount(2)
        ->and($forStaff->pluck('id')->all())->toContain($publicReply->id, $internalNote->id);

    // Internal notes scope
    $internalNotesOnly = TicketMessage::internalNotes()->get();
    expect($internalNotesOnly)->toHaveCount(1)
        ->and($internalNotesOnly->first()->id)->toBe($internalNote->id);

    // Author checks
    expect($publicReply->isCustomerAuthor())->toBeTrue()
        ->and($publicReply->isMemberAuthor())->toBeFalse()
        ->and($internalNote->isCustomerAuthor())->toBeFalse()
        ->and($internalNote->isMemberAuthor())->toBeTrue();
});

test('ticket message enforces automatic tenant query scoping', function () {
    $betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);

    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $betaCustomer->id,
        'subject' => 'Beta ticket',
    ]);

    $acmeMessage = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Acme message',
    ]);

    $betaMessage = TicketMessage::create([
        'organization_id' => $this->betaOrg->id,
        'ticket_id' => $betaTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $betaCustomer->id,
        'body' => 'Beta message',
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);
    $acmeResults = TicketMessage::all();
    expect($acmeResults)->toHaveCount(1)
        ->and($acmeResults->first()->id)->toBe($acmeMessage->id);

    OrganizationContext::setCurrent($this->betaOrg);
    $betaResults = TicketMessage::all();
    expect($betaResults)->toHaveCount(1)
        ->and($betaResults->first()->id)->toBe($betaMessage->id);

    OrganizationContext::clear();
});

test('creating ticket message automatically inherits organization_id from ticket or context', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $message = TicketMessage::create([
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Auto tenant message',
    ]);

    expect($message->organization_id)->toBe($this->acmeOrg->id);
});

test('existing ticket message strictly rejects update operations on model instance', function () {
    $message = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Original immutable text',
    ]);

    expect(function () use ($message) {
        $message->update(['body' => 'Tampered text']);
    })->toThrow(ImmutableMessageException::class);

    expect(function () use ($message) {
        $message->body = 'Direct assignment';
        $message->save();
    })->toThrow(ImmutableMessageException::class);

    $fresh = TicketMessage::withoutGlobalScopes()->find($message->id);
    expect($fresh->body)->toBe('Original immutable text');
});

test('existing ticket message strictly rejects delete operations on model instance', function () {
    $message = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Undeletable text',
    ]);

    expect(function () use ($message) {
        $message->delete();
    })->toThrow(ImmutableMessageException::class);

    $this->assertDatabaseHas('ticket_messages', [
        'id' => $message->id,
    ]);
});

test('bulk update and delete queries on ticket messages are strictly rejected by builder', function () {
    $message = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Builder protected message',
    ]);

    expect(function () use ($message) {
        TicketMessage::where('id', $message->id)->update(['body' => 'Bulk update']);
    })->toThrow(ImmutableMessageException::class);

    expect(function () use ($message) {
        TicketMessage::where('id', $message->id)->delete();
    })->toThrow(ImmutableMessageException::class);

    $this->assertDatabaseHas('ticket_messages', [
        'id' => $message->id,
        'body' => 'Builder protected message',
    ]);
});

test('system rejects cross-tenant ticket message creation', function () {
    expect(function () {
        TicketMessage::create([
            'organization_id' => $this->betaOrg->id,
            'ticket_id' => $this->acmeTicket->id,
            'message_type' => TicketMessageType::PUBLIC_REPLY,
            'author_type' => Customer::class,
            'author_id' => $this->acmeCustomer->id,
            'body' => 'Cross tenant attempt',
        ]);
    })->toThrow(DomainException::class);
});

test('system rejects customer creating internal note', function () {
    expect(function () {
        TicketMessage::create([
            'organization_id' => $this->acmeOrg->id,
            'ticket_id' => $this->acmeTicket->id,
            'message_type' => TicketMessageType::INTERNAL_NOTE,
            'author_type' => Customer::class,
            'author_id' => $this->acmeCustomer->id,
            'body' => 'Customer trying to write internal note',
        ]);
    })->toThrow(DomainException::class);
});

test('ticket message factory generates valid instance with states', function () {
    $message = TicketMessage::factory()->create();

    expect($message->id)->toBeString()
        ->and(Str::isUuid($message->id))->toBeTrue()
        ->and($message->message_type)->toBe(TicketMessageType::PUBLIC_REPLY)
        ->and($message->organization_id)->toBe($message->ticket->organization_id);

    $internalNote = TicketMessage::factory()->internalNote()->create([
        'author_type' => User::class,
        'author_id' => User::factory()->create()->id,
    ]);

    expect($internalNote->message_type)->toBe(TicketMessageType::INTERNAL_NOTE);
});
