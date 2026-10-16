<?php

use App\Services\OrphanAttachmentCleaner;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('attachments:clean-orphans {--organization=}', function (OrphanAttachmentCleaner $cleaner) {
    $organization = $this->option('organization');
    $deleted = $cleaner->clean($organization === null ? null : (int) $organization);
    $this->info("Removed {$deleted} orphan attachment files.");
})->purpose('Remove abandoned private attachment files after a one-hour grace period');

Schedule::command('attachments:clean-orphans')->hourly()->withoutOverlapping();
