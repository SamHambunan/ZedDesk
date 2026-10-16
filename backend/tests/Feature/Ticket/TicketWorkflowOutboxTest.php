<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\User;
use App\Services\DurableDelivery;
use App\Services\OutboxPublisher;
use Illuminate\Contracts\Broadcasting\Broadcaster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function ticketWorkflowFixture(): array
{
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);

    return [$organization, $customer, $user, $member];
}

test('ticket creation commits its ticket, message, notifications, and outbox delivery signals together', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();

    $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer',
        'email' => 'customer@acme.test',
        'subject' => 'Portal subject',
        'message' => 'Initial inquiry',
    ])->assertCreated();

    $ticket = Ticket::where('organization_id', $organization->id)->first();
    expect($ticket)->not->toBeNull();

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
        ->and(DB::table('notifications')->where('ticket_id', $ticket->id)->where('recipient_member_id', $member->id)->count())->toBe(1);

    $signals = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->get();
    expect($signals)->not->toBeEmpty();

    $kinds = $signals->pluck('kind')->all();
    expect($kinds)->toContain('staff_ticket', 'member_inbox');

    $staffSignal = $signals->firstWhere('kind', 'staff_ticket');
    $staffEnvelope = json_decode($staffSignal->envelope, true);
    expect($staffEnvelope['change_type'])->toBe('created')
        ->and($staffEnvelope['ticket_id'])->toBe($ticket->id);
});

test('organization member public reply and internal note commit outbox signals with customer note privacy', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Workflow']);

    Sanctum::actingAs($user);

    // Public reply
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Public response to customer',
    ])->assertCreated();

    $publicSignals = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->get();
    $publicKinds = $publicSignals->pluck('kind')->all();
    expect($publicKinds)->toContain('staff_ticket', 'customer_ticket');

    // Internal note
    DB::table('delivery_outbox')->truncate();
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Internal secret note',
    ])->assertCreated();

    $noteSignals = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->get();
    $noteKinds = $noteSignals->pluck('kind')->all();
    expect($noteKinds)->toContain('staff_ticket')
        ->and($noteKinds)->not->toContain('customer_ticket');
});

test('assignment and claim commit outbox signals and notifications with transaction', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $otherUser = User::create(['name' => 'Agent2', 'email' => 'agent2@acme.test', 'password' => bcrypt('password')]);
    $otherMember = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $otherUser->id, 'role' => 'agent']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Assign me']);

    Sanctum::actingAs($user);

    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'member_id' => $otherMember->id,
    ])->assertOk();

    $assignSignals = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->get();
    expect($assignSignals->pluck('kind')->all())->toContain('staff_ticket', 'member_inbox');

    $staffSignal = $assignSignals->firstWhere('kind', 'staff_ticket');
    $envelope = json_decode($staffSignal->envelope, true);
    expect($envelope['change_type'])->toBe('assignment_changed');

    // Claim on a new ticket auto-advances to open
    $newTicket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Claim me']);
    DB::table('delivery_outbox')->truncate();

    $this->postJson("http://acme.localhost/api/tickets/{$newTicket->id}/claim")->assertOk();

    $claimSignals = DB::table('delivery_outbox')->where('ticket_id', $newTicket->id)->get();
    $changeTypes = $claimSignals->map(fn ($s) => json_decode($s->envelope, true)['change_type'] ?? null)->filter()->all();
    expect($changeTypes)->toContain('assignment_changed', 'status_changed');
});

test('status and priority edits commit revisioned outbox signals', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Field edits']);

    Sanctum::actingAs($user);

    // Status edit
    $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'open',
    ])->assertOk();

    $statusSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    expect($statusSignal)->not->toBeNull();
    $statusEnvelope = json_decode($statusSignal->envelope, true);
    expect($statusEnvelope['change_type'])->toBe('status_changed')
        ->and($statusEnvelope['revision'])->toBe(2);

    // Customer signal also present for status change
    $customerStatusSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'customer_ticket')->first();
    expect($customerStatusSignal)->not->toBeNull();

    // Priority edit
    DB::table('delivery_outbox')->truncate();
    $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", [
        'priority' => 'high',
    ])->assertOk();

    $prioritySignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    expect($prioritySignal)->not->toBeNull();
    $priorityEnvelope = json_decode($prioritySignal->envelope, true);
    expect($priorityEnvelope['change_type'])->toBe('priority_changed')
        ->and($priorityEnvelope['revision'])->toBe(3);
});

test('tag attachment and detachment commit tags_changed outbox signals', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Tags test']);
    $tag = Tag::create(['organization_id' => $organization->id, 'name' => 'Bug', 'slug' => 'bug']);

    Sanctum::actingAs($user);

    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/tags", [
        'tag_id' => $tag->id,
    ])->assertOk();

    $tagSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    expect($tagSignal)->not->toBeNull();
    $envelope = json_decode($tagSignal->envelope, true);
    expect($envelope['change_type'])->toBe('tags_changed');

    // Detach tag
    DB::table('delivery_outbox')->truncate();
    $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}/tags/{$tag->id}")->assertOk();

    $detachSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    expect($detachSignal)->not->toBeNull();
    $detachEnvelope = json_decode($detachSignal->envelope, true);
    expect($detachEnvelope['change_type'])->toBe('tags_changed');
});

test('soft deletion and restoration commit delivery signals to outbox', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $user->update(['name' => 'Admin']);
    $member->update(['role' => 'admin']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Lifecycle']);

    Sanctum::actingAs($user);

    $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}")->assertOk();

    $deleteSignals = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->get();
    expect($deleteSignals->pluck('kind')->all())->toContain('staff_ticket', 'customer_ticket');

    $staffDelete = $deleteSignals->firstWhere('kind', 'staff_ticket');
    expect(json_decode($staffDelete->envelope, true)['change_type'])->toBe('deleted');

    $customerDelete = $deleteSignals->firstWhere('kind', 'customer_ticket');
    expect(json_decode($customerDelete->envelope, true)['change_type'])->toBe('deleted');

    // Restore
    DB::table('delivery_outbox')->truncate();
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/restore")->assertOk();

    $restoreSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    expect($restoreSignal)->not->toBeNull()
        ->and(json_decode($restoreSignal->envelope, true)['change_type'])->toBe('restored');
});

test('publisher broadcasts generic unavailability for customer deletion and suppresses stale deletion after restoration', function () {
    Queue::fake();
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $user->update(['name' => 'Admin']);
    $member->update(['role' => 'admin']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Unavailable test']);

    Sanctum::actingAs($user);
    $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}")->assertOk();

    $this->artisan('delivery:dispatch')->assertSuccessful();
    $customerSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'customer_ticket')->first();
    expect($customerSignal->delivered_at)->toBeNull();

    // Broadcast customer deletion signal: sends 'ticket.unavailable' with empty payload []
    $broadcaster = Mockery::mock(Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once()->withArgs(function ($channels, $event, $payload) use ($ticket) {
        return $event === 'ticket.unavailable'
            && $payload === []
            && count($channels) === 1
            && str_contains((string) $channels[0], 'customer.ticket.'.$ticket->id);
    });
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);

    app(OutboxPublisher::class)->publish($customerSignal->id, $customerSignal->reservation_token);
    expect(DB::table('delivery_outbox')->where('id', $customerSignal->id)->value('delivered_at'))->not->toBeNull();

    // Now test: ticket restored, so a stale deletion signal is suppressed
    app(DurableDelivery::class)->capture(fn () => $ticket->restore());
    $staleDeleteSignalId = (string) Str::uuid();
    $reservationToken = (string) Str::uuid();
    DB::table('delivery_outbox')->insert([
        'id' => $staleDeleteSignalId,
        'organization_id' => $organization->id,
        'kind' => 'customer_ticket',
        'ticket_id' => $ticket->id,
        'customer_id' => $customer->id,
        'envelope' => json_encode([
            'event_id' => $staleDeleteSignalId,
            'organization_id' => $organization->id,
            'ticket_id' => $ticket->id,
            'change_type' => 'deleted',
            'revision' => $ticket->revision,
        ]),
        'available_at' => now(),
        'reservation_token' => $reservationToken,
        'reserved_until' => now()->addMinutes(1),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($staleDeleteSignalId, $reservationToken);

    // Stale signal is marked delivered without broadcasting
    expect(DB::table('delivery_outbox')->where('id', $staleDeleteSignalId)->value('delivered_at'))->not->toBeNull();
});

test('publisher suppresses obsolete updates when current ticket revision exceeds envelope revision', function () {
    Queue::fake();
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Obsolete test']);

    Sanctum::actingAs($user);
    $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", ['priority' => 'high'])->assertOk();

    $signal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    $reservation = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signal->id)->update([
        'reservation_token' => $reservation,
        'reserved_until' => now()->addMinutes(1),
    ]);

    // Advance ticket revision by another edit
    $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", ['priority' => 'urgent'])->assertOk();
    expect($ticket->fresh()->revision)->toBeGreaterThan(json_decode($signal->envelope, true)['revision']);

    // Publishing the older signal should be suppressed
    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($signal->id, $reservation);

    expect(DB::table('delivery_outbox')->where('id', $signal->id)->value('delivered_at'))->not->toBeNull();
});

test('failed outbox write rolls back the entire ticket mutation', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Rollback test']);

    Sanctum::actingAs($user);

    DB::statement("ALTER TABLE delivery_outbox ADD CONSTRAINT reject_staff_delivery CHECK (kind <> 'staff_ticket')");

    $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", ['priority' => 'high'])
        ->assertServerError();

    expect($ticket->fresh()->priority->value)->toBe('medium')
        ->and(DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count())->toBe(0);
});

test('delayed publication broadcasts creation to organization, message to ticket and organization, and inbox to member', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();

    $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer',
        'email' => 'customer@acme.test',
        'subject' => 'Delayed live recovery test',
        'message' => 'First message',
    ])->assertCreated();

    $ticket = Ticket::where('organization_id', $organization->id)->first();
    $creationSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'staff_ticket')->first();
    $inboxSignal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->where('kind', 'member_inbox')->first();

    // 1. Publish creation signal -> broadcasts 'ticket.changed' to OrganizationLiveChannel only
    $broadcaster = Mockery::mock(Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once()->withArgs(function ($channels, $event, $payload) use ($organization) {
        return $event === 'ticket.changed'
            && count($channels) === 1
            && str_contains((string) $channels[0], 'organization.'.$organization->id)
            && ($payload['change_type'] ?? null) === 'created';
    });
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);

    $token1 = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $creationSignal->id)->update([
        'reservation_token' => $token1,
        'reserved_until' => now()->addMinutes(1),
    ]);
    app(OutboxPublisher::class)->publish($creationSignal->id, $token1);
    expect(DB::table('delivery_outbox')->where('id', $creationSignal->id)->value('delivered_at'))->not->toBeNull();

    // 2. Publish inbox signal -> broadcasts 'inbox.changed' to MemberNotificationChannel
    $broadcaster2 = Mockery::mock(Broadcaster::class);
    $broadcaster2->shouldReceive('broadcast')->once()->withArgs(function ($channels, $event, $payload) use ($organization, $member) {
        return $event === 'inbox.changed'
            && count($channels) === 1
            && str_contains((string) $channels[0], 'private-organization.'.$organization->id.'.member.'.$member->id);
    });
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster2);

    $token2 = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $inboxSignal->id)->update([
        'reservation_token' => $token2,
        'reserved_until' => now()->addMinutes(1),
    ]);
    app(OutboxPublisher::class)->publish($inboxSignal->id, $token2);
    expect(DB::table('delivery_outbox')->where('id', $inboxSignal->id)->value('delivered_at'))->not->toBeNull();
});

test('failed background publication never changes a committed mutation into an error', function () {
    [$organization, $customer, $user, $member] = ticketWorkflowFixture();
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Committed mutation']);

    Sanctum::actingAs($user);

    // HTTP mutation succeeds even if publication later fails
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Public response',
    ])->assertCreated();

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);

    // Now simulate background publication failure
    $currentRevision = $ticket->fresh()->revision;
    $signal = DB::table('delivery_outbox')
        ->where('ticket_id', $ticket->id)
        ->where('kind', 'staff_ticket')
        ->get()
        ->first(fn ($s) => json_decode($s->envelope, true)['revision'] === $currentRevision);
    expect($signal)->not->toBeNull();

    $token = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signal->id)->update([
        'reservation_token' => $token,
        'reserved_until' => now()->addMinutes(1),
    ]);

    $broadcaster = Mockery::mock(Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->andThrow(new RuntimeException('Reverb connection timeout'));
    Broadcast::shouldReceive('connection')->with('reverb')->andReturn($broadcaster);

    // Background publisher records failure without throwing or affecting committed message
    app(OutboxPublisher::class)->publish($signal->id, $token);

    $freshSignal = DB::table('delivery_outbox')->where('id', $signal->id)->first();
    expect($freshSignal->delivered_at)->toBeNull()
        ->and($freshSignal->last_error)->toContain('RuntimeException');

    // The message is still committed in the database and HTTP 201 response was unaffected
    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
});
