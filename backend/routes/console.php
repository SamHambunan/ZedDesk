<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use App\Services\OutboxDispatcher;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('delivery:dispatch {--limit=100}', function (OutboxDispatcher $dispatcher) {
    $count = $dispatcher->dispatch((int) $this->option('limit'));
    $this->info("Dispatched {$count} delivery signals.");
})->purpose('Enqueue pending durable delivery signals');

Artisan::command('delivery:status', function () {
    $pending = DB::table('delivery_outbox')->whereNull('delivered_at')->whereNull('quarantined_at');
    $oldest = (clone $pending)->min('created_at');
    $this->table(['Pending', 'Oldest pending age (seconds)', 'Quarantined'], [[
        $pending->count(),
        $oldest ? now()->diffInSeconds($oldest) : 0,
        DB::table('delivery_outbox')->whereNotNull('quarantined_at')->count(),
    ]]);
})->purpose('Inspect durable delivery backlog');

Artisan::command('delivery:failures {--limit=20}', function () {
    $rows = DB::table('delivery_outbox')->whereNotNull('quarantined_at')
        ->orderByDesc('quarantined_at')->limit(max(1, min(100, (int) $this->option('limit'))))
        ->get(['id', 'organization_id', 'kind', 'ticket_id', 'failures', 'last_error', 'quarantined_at']);
    $this->table(['ID', 'Organization', 'Kind', 'Ticket', 'Attempts', 'Error', 'Quarantined'],
        $rows->map(fn ($row) => [
            $row->id, $row->organization_id, $row->kind, $row->ticket_id ?? '-',
            $row->failures, $row->last_error ?? '-', $row->quarantined_at,
        ])->all());
})->purpose('List quarantined delivery signals for inspection and retry');

Artisan::command('delivery:retry {id}', function (string $id) {
    $count = DB::table('delivery_outbox')->where('id', $id)->whereNotNull('quarantined_at')->update([
        'failures' => 0, 'quarantined_at' => null, 'available_at' => now(),
        'reservation_token' => null, 'reserved_until' => null, 'updated_at' => now(),
    ]);
    $count ? $this->info('Delivery signal scheduled for retry.') : $this->error('Quarantined delivery signal not found.');
    return $count ? 0 : 1;
})->purpose('Retry one quarantined delivery signal');

Schedule::command('delivery:dispatch')->everyTenSeconds();
Schedule::call(fn () => DB::table('delivery_outbox')->where('delivered_at', '<', now()->subDays(7))->delete())->daily();
