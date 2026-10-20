<?php

use App\Services\AuditSanitizer;
use App\Services\OrphanAttachmentCleaner;
use App\Services\OutboxDispatcher;
use App\Services\OutboxFailure;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('delivery:dispatch {--limit=100}', function (OutboxDispatcher $dispatcher) {
    $count = $dispatcher->dispatch((int) $this->option('limit'));
    $this->info("Dispatched {$count} delivery signals.");
})->purpose('Enqueue pending durable delivery signals');

Artisan::command('delivery:status {--organization=}', function () {
    $organizationId = $this->option('organization');
    $query = DB::table('delivery_outbox');
    if ($organizationId !== null) {
        $query->where('organization_id', (int) $organizationId);
    }
    $pending = (clone $query)->whereNull('delivered_at')->whereNull('quarantined_at');
    $oldest = (clone $pending)->min('created_at');
    $this->table(['Pending', 'Oldest pending age (seconds)', 'Quarantined'], [[
        $pending->count(),
        $oldest ? now()->diffInSeconds($oldest) : 0,
        (clone $query)->whereNotNull('quarantined_at')->count(),
    ]]);
})->purpose('Inspect durable delivery backlog');

Artisan::command('delivery:failures {id? : Specific delivery signal ID to inspect} {--organization= : Filter by Organization ID} {--all : Include active non-quarantined failures} {--limit=20 : Maximum records to display}', function () {
    if ($id = $this->argument('id')) {
        return $this->call('delivery:inspect', ['id' => $id]);
    }

    $query = DB::table('delivery_outbox');
    if ($this->option('all')) {
        $query->where(fn ($q) => $q->whereNotNull('quarantined_at')->orWhere('failures', '>', 0)->orWhere('infrastructure_failures', '>', 0));
    } else {
        $query->whereNotNull('quarantined_at');
    }

    if ($organization = $this->option('organization')) {
        $query->where('organization_id', (int) $organization);
    }

    $rows = $query->orderByDesc('quarantined_at')
        ->limit(max(1, min(100, (int) $this->option('limit'))))
        ->get(['id', 'organization_id', 'kind', 'ticket_id', 'failures', 'infrastructure_failures', 'last_error', 'quarantined_at']);

    $failureService = app(OutboxFailure::class);
    $this->table(['ID', 'Organization', 'Kind', 'Ticket', 'Attempts', 'Error', 'Quarantined'],
        $rows->map(fn ($row) => [
            $row->id, $row->organization_id, $row->kind, $row->ticket_id ?? '-',
            $row->failures + $row->infrastructure_failures,
            $row->last_error ? $failureService->sanitizeError($row->last_error) : '-',
            $row->quarantined_at,
        ])->all());

    return 0;
})->purpose('List quarantined delivery signals for inspection and retry');

Artisan::command('delivery:inspect {id}', function (string $id) {
    $row = DB::table('delivery_outbox')->where('id', $id)->first();
    if (! $row) {
        $this->error("Delivery signal {$id} not found.");

        return 1;
    }

    $envelope = json_decode($row->envelope, true) ?: [];
    $sanitizeEnvelope = function (&$data) use (&$sanitizeEnvelope) {
        if (! is_array($data)) {
            return;
        }
        foreach ($data as $key => &$value) {
            if (is_string($key) && preg_match('/(token|secret|password|bearer|auth|key)/i', $key)) {
                unset($data[$key]);

                continue;
            }
            if (is_array($value)) {
                $sanitizeEnvelope($value);
            }
        }
    };
    $sanitizeEnvelope($envelope);

    $status = $row->delivered_at ? 'delivered' : ($row->quarantined_at ? 'quarantined' : 'pending');
    $failureService = app(OutboxFailure::class);

    $this->info("Delivery Signal Inspection: {$row->id}");
    $this->table(['Field', 'Value'], [
        ['ID', $row->id],
        ['Organization ID', $row->organization_id],
        ['Kind', $row->kind],
        ['Status', $status],
        ['Ticket ID', $row->ticket_id ?? '-'],
        ['Customer ID', $row->customer_id ?? '-'],
        ['Recipient Member ID', $row->recipient_member_id ?? '-'],
        ['Non-transient Failures', $row->failures],
        ['Infrastructure Failures', $row->infrastructure_failures],
        ['Last Error', $row->last_error ? $failureService->sanitizeError($row->last_error) : '-'],
        ['Available At', $row->available_at],
        ['Quarantined At', $row->quarantined_at ?? '-'],
        ['Delivered At', $row->delivered_at ?? '-'],
        ['Created At', $row->created_at],
        ['Updated At', $row->updated_at],
        ['Envelope (Diagnostics)', json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)],
    ]);

    return 0;
})->purpose('Inspect a specific durable delivery signal with sanitized diagnostics');

Artisan::command('delivery:retry {id : The delivery signal ID to retry}', function (string $id) {
    $signal = DB::table('delivery_outbox')->where('id', $id)->first();
    if (! $signal) {
        $this->error('Delivery signal not found.');

        return 1;
    }

    if ($signal->delivered_at !== null) {
        $this->error('Delivery signal is already delivered.');

        return 1;
    }

    DB::table('delivery_outbox')->where('id', $id)->update([
        'failures' => 0,
        'infrastructure_failures' => 0,
        'quarantined_at' => null,
        'available_at' => now(),
        'reservation_token' => null,
        'reserved_until' => null,
        'last_error' => null,
        'updated_at' => now(),
    ]);

    $this->info('Delivery signal scheduled for retry.');

    return 0;
})->purpose('Retry one quarantined or failed delivery signal');

Artisan::command('delivery:clean {--days=7 : Retention threshold in days}', function () {
    $days = max(1, (int) $this->option('days'));
    $count = DB::table('delivery_outbox')
        ->whereNotNull('delivered_at')
        ->where('delivered_at', '<', now()->subDays($days))
        ->delete();
    $this->info("Cleaned {$count} completed delivery records older than {$days} days.");

    return 0;
})->purpose('Clean up completed delivery records older than retention threshold');

Schedule::command('delivery:dispatch')->everyTenSeconds();
Schedule::command('delivery:clean')->daily();
Artisan::command('audit:clean {--batch-size=1000 : Maximum records per database batch} {--max-batches=0 : Stop after this many batches per cleanup phase (0 means finish)}', function () {
    $batchSize = max(1, min(5000, (int) $this->option('batch-size')));
    $maxBatches = max(0, (int) $this->option('max-batches'));
    $counts = [];

    foreach ([
        'business' => now()->subYear(),
        'security' => now()->subDays(90),
        'ip_address' => now()->subDays(30),
    ] as $phase => $cutoff) {
        $count = 0;
        $batches = 0;

        do {
            $query = DB::table('audit_logs')->where('occurred_at', '<', $cutoff);
            if ($phase === 'ip_address') {
                $query->whereNotNull('ip_address');
            } else {
                $query->where('classification', $phase);
            }

            $ids = $query->orderBy('occurred_at')->orderBy('id')->limit($batchSize)->pluck('id');
            if ($ids->isEmpty()) {
                break;
            }

            $affected = DB::table('audit_logs')->whereIn('id', $ids);
            $count += $phase === 'ip_address'
                ? $affected->update(['ip_address' => null])
                : $affected->delete();
            $batches++;
        } while ($ids->count() === $batchSize && ($maxBatches === 0 || $batches < $maxBatches));

        $counts[$phase] = $count;
    }

    $this->info("Removed {$counts['business']} expired business and {$counts['security']} expired security Audit Logs; cleared {$counts['ip_address']} IP addresses.");
})->purpose('Apply Audit Log and independent IP retention in bounded batches');
Schedule::command('audit:clean')->daily()->withoutOverlapping();
Artisan::command('idempotency:clean', function () {
    $count = DB::table('request_idempotency')->where('expires_at', '<=', now())->delete();
    $this->info("Cleaned {$count} expired request results.");
})->purpose('Remove expired request idempotency results');
Schedule::command('idempotency:clean')->hourly()->withoutOverlapping();
Artisan::command('attachments:clean-orphans {--organization=}', function (OrphanAttachmentCleaner $cleaner) {
    $organization = $this->option('organization');
    $deleted = $cleaner->clean($organization === null ? null : (int) $organization);
    $this->info("Removed {$deleted} orphan attachment files.");
})->purpose('Remove abandoned private attachment files after a one-hour grace period');

Schedule::command('attachments:clean-orphans')->hourly()->withoutOverlapping();
Schedule::call(fn () => DB::table('rate_limit_windows')->where('window_start', '<', now()->subHours(2)->timestamp)->delete())->daily();

Artisan::command('security:audit {id? : Specific security audit record ID to inspect} {--action= : Filter by action} {--actor= : Filter by actor ID} {--actor-id= : Filter by actor ID} {--target= : Filter by target ID} {--target-id= : Filter by target ID} {--target-type= : Filter by target type} {--outcome= : Filter by outcome} {--from= : Filter by start date} {--to= : Filter by end date} {--organization= : Filter by Organization ID} {--all : Include all security records instead of global-only} {--limit=25 : Maximum records to display} {--page=1 : Page number}', function (?string $id = null) {
    if ($id) {
        $record = DB::table('audit_logs')->where('id', $id)->first();
        if (! $record) {
            $this->error("Security audit record {$id} not found.");

            return 1;
        }

        $changes = json_decode($record->changes ?? '{}', true) ?: [];
        $sanitizedChanges = AuditSanitizer::sanitizeMetadata($changes);

        $this->info("Security Audit Record Inspection: {$record->id}");
        $this->table(['Field', 'Value'], [
            ['ID', $record->id],
            ['Occurred At', $record->occurred_at],
            ['Classification', $record->classification],
            ['Action', $record->action],
            ['Outcome', $record->outcome],
            ['Organization ID', $record->organization_id ? (string) $record->organization_id : 'global'],
            ['Actor Type', $record->actor_type ?? 'unresolved'],
            ['Actor ID', $record->actor_id ?? '-'],
            ['Target Type', $record->target_type ?? '-'],
            ['Target ID', $record->target_id ?? '-'],
            ['IP Address', $record->ip_address ?? '-'],
            ['Request Location', AuditSanitizer::sanitizeRequestLocation($record->request_location) ?? '-'],
            ['Changes (Sanitized)', json_encode($sanitizedChanges, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)],
        ]);

        return 0;
    }

    $query = DB::table('audit_logs')
        ->where('classification', 'security');

    $organizationOption = $this->option('organization');
    if ($organizationOption !== null) {
        $query->where('organization_id', (int) $organizationOption);
    } elseif (! $this->option('all')) {
        $query->whereNull('organization_id');
    }

    if ($action = $this->option('action')) {
        $query->where('action', $action);
    }

    $actorId = $this->option('actor-id') ?? $this->option('actor');
    if ($actorId !== null) {
        $query->where('actor_id', $actorId);
    }

    $targetId = $this->option('target-id') ?? $this->option('target');
    if ($targetId !== null) {
        $query->where('target_id', $targetId);
    }

    if ($targetType = $this->option('target-type')) {
        $query->where('target_type', $targetType);
    }

    if ($outcome = $this->option('outcome')) {
        $query->where('outcome', $outcome);
    }

    if ($from = $this->option('from')) {
        $query->whereDate('occurred_at', '>=', $from);
    }

    if ($to = $this->option('to')) {
        $query->whereDate('occurred_at', '<=', $to);
    }

    $limit = max(1, min(100, (int) $this->option('limit')));
    $page = max(1, (int) $this->option('page'));
    $offset = ($page - 1) * $limit;

    $total = (clone $query)->count();
    $rows = $query->orderByDesc('occurred_at')
        ->orderByDesc('id')
        ->offset($offset)
        ->limit($limit)
        ->get();

    $this->info("Security Audit Records (Page {$page}, Total {$total}):");

    $headers = ['ID', 'Occurred At', 'Action', 'Outcome', 'Actor Type', 'Actor ID', 'Target Type', 'Target ID', 'IP Address'];
    $tableData = $rows->map(function ($row) {
        return [
            $row->id,
            $row->occurred_at,
            $row->action,
            $row->outcome,
            $row->actor_type ?? 'unresolved',
            $row->actor_id ?? '-',
            $row->target_type ?? '-',
            $row->target_id ?? '-',
            $row->ip_address ?? '-',
        ];
    })->all();

    $this->table($headers, $tableData);

    return 0;
})->purpose('Inspect global security audit records with safe identifiers');
