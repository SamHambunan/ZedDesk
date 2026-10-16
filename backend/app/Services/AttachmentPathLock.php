<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class AttachmentPathLock
{
    private const KEY_SQL = 'hashtextextended(?, 0)';

    public static function hold(string $path): void
    {
        DB::select('SELECT pg_advisory_xact_lock('.self::KEY_SQL.')', [$path]);
    }

    public static function tryHold(string $path): bool
    {
        $lock = DB::selectOne('SELECT pg_try_advisory_xact_lock('.self::KEY_SQL.') AS locked', [$path]);

        return (bool) $lock->locked;
    }
}
