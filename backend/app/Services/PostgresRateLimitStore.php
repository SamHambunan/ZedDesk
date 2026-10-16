<?php

namespace App\Services;

use App\Contracts\RateLimitStore;
use Illuminate\Support\Facades\DB;

class PostgresRateLimitStore implements RateLimitStore
{
    public function allow(RateLimitAttempt $attempt): bool
    {
        return DB::transaction(function () use ($attempt) {
            DB::table('rate_limit_windows')->insertOrIgnore([
                'key_hash' => $attempt->key,
                'window_start' => $attempt->window,
                'requests' => 0,
                'writes' => 0,
            ]);

            $row = DB::table('rate_limit_windows')
                ->where('key_hash', $attempt->key)
                ->where('window_start', $attempt->window)
                ->lockForUpdate()
                ->first();

            if ($row->requests >= $attempt->allLimit || ($attempt->write && $row->writes >= $attempt->writeLimit)) {
                return false;
            }

            DB::table('rate_limit_windows')
                ->where('key_hash', $attempt->key)
                ->where('window_start', $attempt->window)
                ->update([
                    'requests' => $row->requests + 1,
                    'writes' => $row->writes + (int) $attempt->write,
                ]);

            return true;
        });
    }
}
