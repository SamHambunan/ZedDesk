<?php

// Docker only: php tests/Integration/phase4_isolation.php
// Publish A, a malformed A signal, then B in one PHP process with real Reverb.

use App\Context\OrganizationContext;
use App\Services\OutboxPublisher;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$ids = [];
$exitCode = 0;
try {
    $tickets = [];
    foreach (['phase4-01', 'phase4-02'] as $slug) {
        $organization = DB::table('organizations')->where('slug', $slug)->first();
        if (! $organization) {
            throw new RuntimeException("Seed {$slug} first.");
        }
        $ticket = DB::table('tickets')->where('organization_id', $organization->id)
            ->where('ticket_number', 2)->first();
        if (! $ticket) {
            throw new RuntimeException("Missing Ticket for {$slug}.");
        }
        $tickets[] = [$organization, $ticket];
    }

    $signals = [];
    foreach ([0, 0, 1] as $index => $organizationIndex) {
        [$organization, $ticket] = $tickets[$organizationIndex];
        $id = (string) Str::uuid();
        $reservation = (string) Str::uuid();
        $envelope = [
            'event_id' => $id,
            'organization_id' => $index === 1 ? $tickets[1][0]->id : $organization->id,
            'ticket_id' => $ticket->id,
            'change_type' => 'priority_changed',
            'revision' => $ticket->revision,
        ];
        DB::table('delivery_outbox')->insert([
            'id' => $id, 'organization_id' => $organization->id,
            'kind' => 'staff_ticket', 'ticket_id' => $ticket->id,
            'envelope' => json_encode($envelope, JSON_THROW_ON_ERROR),
            'available_at' => now(), 'reservation_token' => $reservation,
            'reserved_until' => now()->addMinute(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $ids[] = $id;
        $signals[] = [$id, $reservation];
    }

    $results = [];
    foreach ($signals as [$id, $reservation]) {
        app(OutboxPublisher::class)->publish($id, $reservation);
        if (OrganizationContext::hasCurrent()) {
            throw new RuntimeException('Worker retained Organization context after publication.');
        }
        $results[] = DB::table('delivery_outbox')->where('id', $id)->first();
    }
    if ($results[0]->delivered_at === null || $results[1]->failures !== 1
        || $results[1]->delivered_at !== null || $results[2]->delivered_at === null) {
        throw new RuntimeException('A, malformed A, B publication sequence did not isolate Organizations.');
    }
    echo json_encode(['sequence' => ['A delivered', 'A malformed failed', 'B delivered'],
        'organization_context_cleared' => true], JSON_THROW_ON_ERROR)."\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage()."\n");
    $exitCode = 1;
} finally {
    OrganizationContext::clear();
    if ($ids !== []) {
        DB::table('delivery_outbox')->whereIn('id', $ids)->delete();
    }
}
exit($exitCode);
