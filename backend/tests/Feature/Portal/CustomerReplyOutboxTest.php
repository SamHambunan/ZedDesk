<?php

use App\Context\OrganizationContext;
use App\Jobs\PublishOutboxSignal;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Services\CustomerTokenService;
use App\Services\OutboxPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function customerReplyFixture(bool $withMember = false): array
{
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Help']);
    $member = null;
    if ($withMember) {
        $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
        $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
        $ticket->update(['assigned_member_id' => $member->id]);
    }

    return [$organization, $ticket, app(CustomerTokenService::class)->generateToken($customer, $ticket), $member];
}

test('customer reply commits its message, grouped notification, and minimal delivery intent together', function () {
    [$organization, $ticket, $token, $member] = customerReplyFixture(true);
    $ticket->update(['status' => 'pending']);

    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Private reply body'])
        ->assertCreated()->assertJsonPath('ticket.status', 'open');

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
        ->and(DB::table('notifications')->where('ticket_id', $ticket->id)->where('recipient_member_id', $member->id)->count())->toBe(1);
    $signals = DB::table('delivery_outbox')->where('organization_id', $organization->id)->get();
    expect($signals)->not->toBeEmpty()
        ->and($signals->pluck('kind')->all())->toContain('staff_ticket', 'customer_ticket', 'member_inbox')
        ->and($signals->every(fn ($signal) => $signal->organization_id === $organization->id && $signal->delivered_at === null))->toBeTrue()
        ->and(json_encode($signals))->not->toContain('Private reply body', $token);
});

test('dispatcher reserves committed signals and retries an abandoned accepted job', function () {
    Queue::fake();
    [, $ticket, $token] = customerReplyFixture();
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Recover me'])
        ->assertCreated();

    $this->artisan('delivery:dispatch')->assertSuccessful();
    Queue::assertPushed(PublishOutboxSignal::class);
    $signal = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->first();
    expect($signal->reservation_token)->not->toBeNull()
        ->and($signal->delivered_at)->toBeNull();

    DB::table('delivery_outbox')->where('id', $signal->id)->update(['reserved_until' => now()->subSecond()]);
    $this->artisan('delivery:dispatch')->assertSuccessful();
    Queue::assertPushed(PublishOutboxSignal::class, 3);
});

test('publication acknowledges only after broadcast and duplicate execution is harmless', function () {
    Queue::fake();
    [, $ticket, $token] = customerReplyFixture();
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'One reply'])
        ->assertCreated();
    $this->artisan('delivery:dispatch')->assertSuccessful();
    $signal = DB::table('delivery_outbox')->where('kind', 'customer_ticket')->first();
    $reservation = $signal->reservation_token;
    expect($signal->delivered_at)->toBeNull();

    $broadcaster = Mockery::mock(\Illuminate\Contracts\Broadcasting\Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once()->withArgs(function ($channels, $event, $payload) use ($signal) {
        return $event === 'ticket.changed' && $payload['event_id'] === $signal->id
            && count($channels) === 1 && str_contains((string) $channels[0], 'customer.ticket.');
    });
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);
    app(OutboxPublisher::class)->publish($signal->id, $reservation);
    app(OutboxPublisher::class)->publish($signal->id, $reservation);

    expect(DB::table('delivery_outbox')->where('id', $signal->id)->value('delivered_at'))->not->toBeNull()
        ->and(OrganizationContext::hasCurrent())->toBeFalse()
        ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
});

test('broadcast outage stays pending without exhausting the five permanent failure attempts', function () {
    Queue::fake();
    [, $ticket, $token] = customerReplyFixture();
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'During outage'])
        ->assertCreated();
    $this->artisan('delivery:dispatch')->assertSuccessful();
    $signal = DB::table('delivery_outbox')->where('kind', 'customer_ticket')->first();

    $broadcaster = Mockery::mock(\Illuminate\Contracts\Broadcasting\Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once()->andThrow(new RuntimeException('Reverb unavailable'));
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);
    app(OutboxPublisher::class)->publish($signal->id, $signal->reservation_token);

    $pending = DB::table('delivery_outbox')->where('id', $signal->id)->first();
    expect($pending->delivered_at)->toBeNull()
        ->and($pending->quarantined_at)->toBeNull()
        ->and($pending->failures)->toBe(0)
        ->and($pending->infrastructure_failures)->toBe(1)
        ->and($pending->reservation_token)->toBeNull()
        ->and(OrganizationContext::hasCurrent())->toBeFalse();
});

test('delayed customer signal is suppressed after Ticket ownership changes', function () {
    Queue::fake();
    [$organization, $ticket, $token] = customerReplyFixture();
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Before transfer'])
        ->assertCreated();
    $this->artisan('delivery:dispatch')->assertSuccessful();
    $signal = DB::table('delivery_outbox')->where('kind', 'customer_ticket')->first();
    $newCustomer = Customer::create(['organization_id' => $organization->id, 'name' => 'Other', 'email' => 'other@acme.test']);
    $ticket->update(['customer_id' => $newCustomer->id]);

    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($signal->id, $signal->reservation_token);
    expect(DB::table('delivery_outbox')->where('id', $signal->id)->value('delivered_at'))->not->toBeNull();
});

test('delayed inbox signal is suppressed when the Ticket is unavailable', function () {
    Queue::fake();
    [, $ticket, $token] = customerReplyFixture(true);
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Before deletion'])
        ->assertCreated();
    $this->artisan('delivery:dispatch')->assertSuccessful();
    $signal = DB::table('delivery_outbox')->where('kind', 'member_inbox')->first();
    $ticket->delete();

    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($signal->id, $signal->reservation_token);
    expect(DB::table('delivery_outbox')->where('id', $signal->id)->value('delivered_at'))->not->toBeNull();
});

test('required outbox write failure rolls back the reply and Notification', function () {
    [, $ticket, $token] = customerReplyFixture(true);
    DB::statement("ALTER TABLE delivery_outbox ADD CONSTRAINT reject_reply_delivery CHECK (kind <> 'staff_ticket')");

    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Must roll back'])
        ->assertServerError();

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(0)
        ->and(DB::table('notifications')->where('ticket_id', $ticket->id)->where('activity_type', 'customer_public_reply')->count())->toBe(0)
        ->and(DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count())->toBe(0);
});

test('invalid delivery data is quarantined after five attempts and can be inspected and retried', function () {
    Queue::fake();
    [, $ticket, $token] = customerReplyFixture();
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", ['message' => 'Quarantine check'])
        ->assertCreated();
    $signal = DB::table('delivery_outbox')->where('kind', 'customer_ticket')->first();
    DB::table('delivery_outbox')->where('id', $signal->id)->update(['envelope' => json_encode(['event_id' => 'wrong'])]);

    for ($attempt = 1; $attempt <= 5; $attempt++) {
        $this->artisan('delivery:dispatch')->assertSuccessful();
        $pending = DB::table('delivery_outbox')->where('id', $signal->id)->first();
        app(OutboxPublisher::class)->publish($signal->id, $pending->reservation_token);
        DB::table('delivery_outbox')->where('id', $signal->id)->update(['available_at' => now()]);
    }

    $quarantined = DB::table('delivery_outbox')->where('id', $signal->id)->first();
    expect($quarantined->failures)->toBe(5)
        ->and($quarantined->quarantined_at)->not->toBeNull()
        ->and($quarantined->delivered_at)->toBeNull();
    Artisan::call('delivery:failures');
    expect(Artisan::output())->toContain($signal->id, 'InvalidArgumentException');
    $this->artisan('delivery:retry', ['id' => $signal->id])->assertSuccessful();
    expect(DB::table('delivery_outbox')->where('id', $signal->id)->value('quarantined_at'))->toBeNull();
});
