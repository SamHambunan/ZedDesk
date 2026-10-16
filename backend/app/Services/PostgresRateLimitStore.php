<?php

namespace App\Services;

use App\Contracts\RateLimitStore;
use Illuminate\Support\Facades\DB;

class PostgresRateLimitStore implements RateLimitStore
{
    public function allow(string $key, int $window, bool $write, int $allLimit, int $writeLimit): bool
    {
        return DB::transaction(function () use ($key, $window, $write, $allLimit, $writeLimit) {
            DB::table('rate_limit_windows')->insertOrIgnore([
                'key_hash' => $key,
                'window_start' => $window,
                'requests' => 0,
                'writes' => 0,
            ]);

            $row = DB::table('rate_limit_windows')
                ->where('key_hash', $key)
                ->where('window_start', $window)
                ->lockForUpdate()
                ->first();

            if ($row->requests >= $allLimit || ($write && $row->writes >= $writeLimit)) {
                return false;
            }

            DB::table('rate_limit_windows')
                ->where('key_hash', $key)
                ->where('window_start', $window)
                ->update([
                    'requests' => $row->requests + 1,
                    'writes' => $row->writes + (int) $write,
                ]);

            return true;
        });
    }
}
