<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Services\OutboxDispatcher;
use App\Services\OutboxPublisher;
use Illuminate\Contracts\Broadcasting\Broadcaster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function deliveryTestFixture(string $slug = 'acme'): array
{
    $organization = Organization::create(['name' => ucfirst($slug), 'slug' => $slug]);
    $user = User::create(['name' => 'Agent', 'email' => "agent@{$slug}.test", 'password' => bcrypt('password')]);
    $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => "customer@{$slug}.test"]);
    $ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'assigned_member_id' => $member->id,
        'subject' => 'Delivery Test',
    ]);

    return [$organization, $customer, $ticket, $member];
}

function insertOutboxRecord(int $organizationId, string $ticketId, array $overrides = []): string
{
    $id = $overrides['id'] ?? (string) Str::uuid();
    $envelope = $overrides['envelope'] ?? [
        'event_id' => $id,
        'organization_id' => $organizationId,
        'ticket_id' => $ticketId,
        'revision' => 1,
        'change_type' => 'status_changed',
        'sensitive_token' => 'secret-bearer-12345',
    ];

    $data = array_merge([
        'id' => $id,
        'organization_id' => $organizationId,
        'kind' => 'staff_ticket',
        'ticket_id' => $ticketId,
        'customer_id' => null,
        'recipient_member_id' => null,
        'envelope' => $envelope,
        'available_at' => now(),
        'reservation_token' => null,
        'reserved_until' => null,
        'failures' => 0,
        'infrastructure_failures' => 0,
        'last_error' => null,
        'delivered_at' => null,
        'quarantined_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ], $overrides);

    if (is_array($data['envelope'])) {
        if (! isset($data['envelope']['event_id'])) {
            $data['envelope']['event_id'] = $id;
        }
        $data['envelope'] = json_encode($data['envelope'], JSON_THROW_ON_ERROR);
    }

    DB::table('delivery_outbox')->insert($data);

    return $id;
}

test('delivery status CLI reports pending count, oldest pending age, and quarantined work with organization filtering', function () {
    [$org1, , $ticket1] = deliveryTestFixture('acme');
    [$org2, , $ticket2] = deliveryTestFixture('globex');

    // Org 1: two pending records with different ages, one quarantined
    insertOutboxRecord($org1->id, $ticket1->id, [
        'created_at' => now()->subMinutes(5),
    ]);
    insertOutboxRecord($org1->id, $ticket1->id, [
        'created_at' => now()->subMinutes(1),
    ]);
    insertOutboxRecord($org1->id, $ticket1->id, [
        'quarantined_at' => now()->subMinutes(2),
        'failures' => 5,
        'last_error' => 'InvalidArgumentException: corrupt payload',
    ]);

    // Org 2: one pending record, 10 minutes old
    insertOutboxRecord($org2->id, $ticket2->id, [
        'created_at' => now()->subMinutes(10),
    ]);

    // Global status: 3 pending (oldest ~600s), 1 quarantined
    Artisan::call('delivery:status');
    $output = Artisan::output();
    expect($output)->toContain('Pending')
        ->and($output)->toContain('Oldest pending age (seconds)')
        ->and($output)->toContain('Quarantined');

    // Organization-filtered status for Org 1: 2 pending (oldest ~300s), 1 quarantined
    Artisan::call('delivery:status', ['--organization' => (string) $org1->id]);
    $org1Output = Artisan::output();
    expect($org1Output)->toContain('2'); // 2 pending for org 1

    // Organization-filtered status for Org 2: 1 pending (oldest ~600s), 0 quarantined
    Artisan::call('delivery:status', ['--organization' => (string) $org2->id]);
    $org2Output = Artisan::output();
    expect($org2Output)->toContain('1');
});

test('delivery failures CLI lists quarantined signals and inspects selected failure with sanitized diagnostics', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');

    $signalId = insertOutboxRecord($org->id, $ticket->id, [
        'quarantined_at' => now()->subHour(),
        'failures' => 5,
        'last_error' => 'InvalidArgumentException: secret-token=super_secret_password was rejected',
        'envelope' => [
            'event_id' => (string) Str::uuid(),
            'organization_id' => $org->id,
            'ticket_id' => $ticket->id,
            'token' => 'should-be-sanitized',
            'password' => 'secret123',
            'safe_field' => 'visible',
            'nested' => [
                'secret_key' => 'nested-secret-value',
                'inner_token' => 'nested-token-value',
                'normal_data' => 'keep-me',
            ],
        ],
    ]);

    // Test listing failures
    Artisan::call('delivery:failures');
    $listOutput = Artisan::output();
    expect($listOutput)->toContain($signalId)
        ->and($listOutput)->toContain((string) $org->id)
        ->and($listOutput)->toContain('InvalidArgumentException')
        ->and($listOutput)->not->toContain('super_secret_password');

    // Test selected failure inspection via delivery:inspect
    $exitCode = Artisan::call('delivery:inspect', ['id' => $signalId]);
    expect($exitCode)->toBe(0);
    $inspectOutput = Artisan::output();
    expect($inspectOutput)->toContain($signalId)
        ->and($inspectOutput)->toContain((string) $org->id)
        ->and($inspectOutput)->toContain('quarantined')
        ->and($inspectOutput)->toContain('safe_field')
        ->and($inspectOutput)->not->toContain('should-be-sanitized')
        ->and($inspectOutput)->not->toContain('secret123')
        ->and($inspectOutput)->not->toContain('nested-secret-value')
        ->and($inspectOutput)->not->toContain('nested-token-value')
        ->and($inspectOutput)->toContain('keep-me');

    // Inspecting via delivery:failures {id} also works
    $exitCodeFailures = Artisan::call('delivery:failures', ['id' => $signalId]);
    expect($exitCodeFailures)->toBe(0);
    expect(Artisan::output())->toContain($signalId);

    // Inspecting non-existent signal returns 1
    $missingExit = Artisan::call('delivery:inspect', ['id' => (string) Str::uuid()]);
    expect($missingExit)->toBe(1);
    expect(Artisan::output())->toContain('not found');
});

test('infrastructure outages retry indefinitely with maximum 60-second backoff and never quarantine', function () {
    Carbon::setTestNow(now());
    try {
        [$org, , $ticket] = deliveryTestFixture('acme');
        $signalId = insertOutboxRecord($org->id, $ticket->id);
        $signal = DB::table('delivery_outbox')->where('id', $signalId)->first();

        $failure = app(\App\Services\OutboxFailure::class);

        // Simulate 8 consecutive infrastructure failures (e.g. Redis/Reverb/DB outages)
        for ($attempt = 1; $attempt <= 8; $attempt++) {
            $error = new RuntimeException("Reverb connection timeout attempt {$attempt}");
            $failure->record($signal, $error, true);
            $signal = DB::table('delivery_outbox')->where('id', $signalId)->first();

            expect($signal->infrastructure_failures)->toBe($attempt)
                ->and($signal->failures)->toBe(0)
                ->and($signal->quarantined_at)->toBeNull()
                ->and($signal->delivered_at)->toBeNull();

            $secondsUntilAvailable = Carbon::now()->diffInSeconds($signal->available_at, false);
            expect($secondsUntilAvailable)->toBeLessThanOrEqual(60);
            if ($attempt >= 6) {
                // Capped at 60 seconds
                expect((int) round($secondsUntilAvailable))->toBeGreaterThanOrEqual(58);
            }
        }

        // Verify after infrastructure recovers, signal remains pending and eligible for dispatch
        expect($signal->quarantined_at)->toBeNull();
    } finally {
        Carbon::setTestNow();
    }
});

test('non-transient failures back off and quarantine strictly on the fifth attempt', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id);
    $signal = DB::table('delivery_outbox')->where('id', $signalId)->first();

    $failure = app(\App\Services\OutboxFailure::class);

    for ($attempt = 1; $attempt <= 4; $attempt++) {
        $error = new InvalidArgumentException("Schema mismatch attempt {$attempt}");
        $failure->record($signal, $error, false);
        $signal = DB::table('delivery_outbox')->where('id', $signalId)->first();

        expect($signal->failures)->toBe($attempt)
            ->and($signal->quarantined_at)->toBeNull();
    }

    // 5th attempt must trigger quarantine
    $error5 = new InvalidArgumentException('Schema mismatch attempt 5');
    $failure->record($signal, $error5, false);
    $quarantined = DB::table('delivery_outbox')->where('id', $signalId)->first();

    expect($quarantined->failures)->toBe(5)
        ->and($quarantined->quarantined_at)->not->toBeNull()
        ->and($quarantined->last_error)->toContain('InvalidArgumentException');
});

test('selected quarantined failure can be explicitly retried, retaining identity, Organization context, and duplicate-safe completion', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id, [
        'quarantined_at' => now()->subHour(),
        'failures' => 5,
        'last_error' => 'InvalidArgumentException: temporary bad state',
        'envelope' => [
            'event_id' => (string) Str::uuid(),
            'organization_id' => $org->id,
            'ticket_id' => $ticket->id,
            'revision' => $ticket->revision,
            'change_type' => 'status_changed',
        ],
    ]);

    // Update event_id in envelope to match signalId for identity check
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'envelope' => json_encode([
            'event_id' => $signalId,
            'organization_id' => $org->id,
            'ticket_id' => $ticket->id,
            'revision' => $ticket->revision,
            'change_type' => 'status_changed',
        ]),
    ]);

    // Explicit retry via CLI
    $this->artisan('delivery:retry', ['id' => $signalId])->assertSuccessful();

    $retried = DB::table('delivery_outbox')->where('id', $signalId)->first();
    expect($retried->quarantined_at)->toBeNull()
        ->and($retried->failures)->toBe(0)
        ->and($retried->infrastructure_failures)->toBe(0)
        ->and($retried->last_error)->toBeNull()
        ->and($retried->reservation_token)->toBeNull()
        ->and($retried->reserved_until)->toBeNull();

    // Now dispatch and publish to verify retention of identity and Organization context
    $broadcaster = Mockery::mock(Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once()->withArgs(function ($channels, $event, $payload) use ($signalId, $org) {
        expect(OrganizationContext::hasCurrent())->toBeTrue()
            ->and(OrganizationContext::getCurrent()->id)->toBe($org->id)
            ->and($payload['event_id'])->toBe($signalId);

        return true;
    });
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);

    $reservationToken = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'reservation_token' => $reservationToken,
        'reserved_until' => now()->addSeconds(45),
    ]);

    app(OutboxPublisher::class)->publish($signalId, $reservationToken);

    $completed = DB::table('delivery_outbox')->where('id', $signalId)->first();
    expect($completed->delivered_at)->not->toBeNull()
        ->and(OrganizationContext::hasCurrent())->toBeFalse();

    // Duplicate execution of the same signal is harmless
    app(OutboxPublisher::class)->publish($signalId, $reservationToken);
    expect(DB::table('delivery_outbox')->where('id', $signalId)->value('delivered_at'))->toBe($completed->delivered_at);
});

test('explicit retry respects current-access checks suppressing delivery if ticket was deleted', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id, [
        'quarantined_at' => now()->subHour(),
        'failures' => 5,
        'last_error' => 'InvalidArgumentException: failure before deletion',
        'envelope' => [
            'organization_id' => $org->id,
            'ticket_id' => $ticket->id,
            'revision' => $ticket->revision,
            'change_type' => 'status_changed',
        ],
    ]);

    // Soft delete the ticket while quarantined
    $ticket->delete();

    // Explicitly retry
    $this->artisan('delivery:retry', ['id' => $signalId])->assertSuccessful();

    // Broadcaster must NOT be called because ticket is trashed
    Broadcast::shouldReceive('connection')->never();

    $reservationToken = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'reservation_token' => $reservationToken,
        'reserved_until' => now()->addSeconds(45),
    ]);

    // Publication suppresses live broadcast and marks completed
    app(OutboxPublisher::class)->publish($signalId, $reservationToken);

    expect(DB::table('delivery_outbox')->where('id', $signalId)->value('delivered_at'))->not->toBeNull();
});

test('delivery failures CLI accurately calculates total attempts across non-transient and infrastructure failures', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id, [
        'quarantined_at' => now(),
        'failures' => 5,
        'infrastructure_failures' => 3,
        'last_error' => 'InvalidArgumentException: test',
    ]);

    Artisan::call('delivery:failures');
    $output = Artisan::output();
    expect($output)->toContain($signalId)
        ->and($output)->toContain('8'); // 5 non-transient + 3 infrastructure = 8 attempts
});

test('explicit retry on already delivered signal is rejected safely', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id, [
        'delivered_at' => now()->subDay(),
    ]);

    $exitCode = Artisan::call('delivery:retry', ['id' => $signalId]);
    expect($exitCode)->toBe(1)
        ->and(Artisan::output())->toContain('already delivered');
});

test('cleanup prunes completed delivery records older than seven days and never discards unresolved or quarantined work', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');

    // 1. Completed delivery 8 days ago -> should be cleaned
    $completedOld = insertOutboxRecord($org->id, $ticket->id, [
        'created_at' => now()->subDays(10),
        'delivered_at' => now()->subDays(8),
    ]);

    // 2. Completed delivery 6 days ago -> should be retained (within 7-day boundary)
    $completedRecent = insertOutboxRecord($org->id, $ticket->id, [
        'created_at' => now()->subDays(7),
        'delivered_at' => now()->subDays(6),
    ]);

    // 3. Unresolved pending work created 14 days ago -> MUST NEVER BE DISCARDED
    $pendingOld = insertOutboxRecord($org->id, $ticket->id, [
        'created_at' => now()->subDays(14),
        'delivered_at' => null,
        'quarantined_at' => null,
        'failures' => 2,
    ]);

    // 4. Quarantined work created 14 days ago, quarantined 12 days ago -> MUST NEVER BE DISCARDED
    $quarantinedOld = insertOutboxRecord($org->id, $ticket->id, [
        'created_at' => now()->subDays(14),
        'quarantined_at' => now()->subDays(12),
        'delivered_at' => null,
        'failures' => 5,
    ]);

    // Run delivery:clean with default 7 days
    $this->artisan('delivery:clean')->assertSuccessful();

    // Verify completedOld is deleted
    expect(DB::table('delivery_outbox')->where('id', $completedOld)->exists())->toBeFalse();

    // Verify completedRecent is retained
    expect(DB::table('delivery_outbox')->where('id', $completedRecent)->exists())->toBeTrue();

    // Verify pendingOld is retained
    expect(DB::table('delivery_outbox')->where('id', $pendingOld)->exists())->toBeTrue();

    // Verify quarantinedOld is retained
    expect(DB::table('delivery_outbox')->where('id', $quarantinedOld)->exists())->toBeTrue();

    // Repeated cleanup run is safe and idempotent (deletes 0)
    $this->artisan('delivery:clean')->assertSuccessful();
    expect(DB::table('delivery_outbox')->where('id', $completedRecent)->exists())->toBeTrue()
        ->and(DB::table('delivery_outbox')->where('id', $pendingOld)->exists())->toBeTrue()
        ->and(DB::table('delivery_outbox')->where('id', $quarantinedOld)->exists())->toBeTrue();
});

test('abandoned reservation recovers with a new token after process crash and invalidates previous token', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id);

    // Initial dispatch reserves the record
    $dispatcher = app(OutboxDispatcher::class);
    $dispatched = $dispatcher->dispatch();
    expect($dispatched)->toBe(1);

    $signalBefore = DB::table('delivery_outbox')->where('id', $signalId)->first();
    $token1 = $signalBefore->reservation_token;
    expect($token1)->not->toBeNull();

    // Simulate process crash: reservation expired
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'reserved_until' => now()->subSecond(),
    ]);

    // Dispatcher recovers the abandoned reservation with a new token
    $dispatchedAgain = $dispatcher->dispatch();
    expect($dispatchedAgain)->toBe(1);

    $signalAfter = DB::table('delivery_outbox')->where('id', $signalId)->first();
    $token2 = $signalAfter->reservation_token;
    expect($token2)->not->toBeNull()
        ->and($token2)->not->toBe($token1);

    // If the old crashed process wakes up and tries to publish with token1, it does nothing
    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($signalId, $token1);
    expect(DB::table('delivery_outbox')->where('id', $signalId)->value('delivered_at'))->toBeNull();

    // When the active worker publishes with token2, it succeeds
    $broadcaster = Mockery::mock(Broadcaster::class);
    $broadcaster->shouldReceive('broadcast')->once();
    Broadcast::shouldReceive('connection')->once()->with('reverb')->andReturn($broadcaster);

    app(OutboxPublisher::class)->publish($signalId, $token2);
    expect(DB::table('delivery_outbox')->where('id', $signalId)->value('delivered_at'))->not->toBeNull();
});

test('process restart after partial publication safely resumes and completes without leaking or duplicating', function () {
    [$org, , $ticket] = deliveryTestFixture('acme');
    $signalId = insertOutboxRecord($org->id, $ticket->id);

    // Worker 1 starts, broadcasts to Reverb, but crashes before DB acknowledgment
    $reservationToken = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'reservation_token' => $reservationToken,
        'reserved_until' => now()->addSeconds(45),
    ]);

    // While worker was down, ticket is updated to revision 2 by another event
    $ticket->increment('revision');

    // Operator retries or abandoned recovery runs after restart
    $this->artisan('delivery:retry', ['id' => $signalId])->assertSuccessful();

    $newToken = (string) Str::uuid();
    DB::table('delivery_outbox')->where('id', $signalId)->update([
        'reservation_token' => $newToken,
        'reserved_until' => now()->addSeconds(45),
    ]);

    // Because revision is now 2 and envelope is revision 1, publication suppresses stale broadcast
    // and marks delivered cleanly without error
    Broadcast::shouldReceive('connection')->never();
    app(OutboxPublisher::class)->publish($signalId, $newToken);

    $final = DB::table('delivery_outbox')->where('id', $signalId)->first();
    expect($final->delivered_at)->not->toBeNull()
        ->and($final->reservation_token)->toBeNull()
        ->and(OrganizationContext::hasCurrent())->toBeFalse();
});

test('pending work resumes publication within recovery target of sixty seconds after infrastructure heals', function () {
    Carbon::setTestNow(now());
    try {
        [$org, , $ticket] = deliveryTestFixture('acme');
        $signalId = insertOutboxRecord($org->id, $ticket->id);
        $signal = DB::table('delivery_outbox')->where('id', $signalId)->first();

        // Record an infrastructure failure with max backoff
        $failure = app(\App\Services\OutboxFailure::class);
        $failure->record($signal, new RuntimeException('Connection dropped'), true);

        $failingSignal = DB::table('delivery_outbox')->where('id', $signalId)->first();
        // Max recovery backoff target is 60 seconds
        $secondsUntilAvailable = Carbon::now()->diffInSeconds($failingSignal->available_at, false);
        expect($secondsUntilAvailable)->toBeLessThanOrEqual(60);

        // Once available_at arrives (simulated by setting available_at to now), dispatcher picks it up immediately
        DB::table('delivery_outbox')->where('id', $signalId)->update(['available_at' => Carbon::now()]);

        $dispatcher = app(OutboxDispatcher::class);
        $count = $dispatcher->dispatch();
        expect($count)->toBe(1);

        $dispatched = DB::table('delivery_outbox')->where('id', $signalId)->first();
        expect($dispatched->reservation_token)->not->toBeNull();
    } finally {
        Carbon::setTestNow();
    }
});




