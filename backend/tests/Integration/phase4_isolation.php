<?php

// Docker only: run phase4_isolation.ps1 from the repository root.
// Queue A, malformed A, then B for one real delivery worker process.

use App\Jobs\PublishOutboxSignal;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$ids = [];
$exitCode = 0;
try {
    $mode = $argv[1] ?? '';
    if ($mode === 'verify') {
        $ids = array_filter(explode(',', $argv[2] ?? ''));
        if (count($ids) !== 3) {
            throw new RuntimeException('Provide all three queued signal IDs.');
        }
        $results = array_map(fn (string $id) => DB::table('delivery_outbox')->where('id', $id)->first(), $ids);
        if (! $results[0] || ! $results[1] || ! $results[2]
            || $results[0]->delivered_at === null || $results[1]->failures !== 1
            || $results[1]->delivered_at !== null || $results[2]->delivered_at === null) {
            throw new RuntimeException('Worker did not isolate A, malformed A, then B.');
        }
        echo json_encode(['sequence' => ['A delivered', 'A malformed failed', 'B delivered'],
            'same_worker_jobs' => 3], JSON_THROW_ON_ERROR)."\n";
    } elseif ($mode !== 'enqueue') {
        throw new RuntimeException('Usage: php tests/Integration/phase4_isolation.php enqueue|verify [signal-ids]');
    } else {
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
            PublishOutboxSignal::dispatch($id, $reservation);
        }
        echo json_encode(['signal_ids' => $ids], JSON_THROW_ON_ERROR)."\n";
    }
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage()."\n");
    $exitCode = 1;
} finally {
    if ($mode === 'verify' || $exitCode !== 0) {
        DB::table('delivery_outbox')->whereIn('id', $ids)->delete();
    }
}
exit($exitCode);
