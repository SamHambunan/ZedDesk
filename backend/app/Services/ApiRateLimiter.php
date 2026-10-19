<?php

namespace App\Services;

use App\Contracts\RateLimitStore;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

class ApiRateLimiter
{
    public function __construct(
        private readonly RedisRateLimitStore $redis,
        private readonly RateLimitStore $postgres,
    ) {}

    public function enforce(string $identity, int $limit, bool $write = false, ?int $writeLimit = null): void
    {
        $now = now()->timestamp;
        $attempt = new RateLimitAttempt(
            hash_hmac('sha256', $identity, config('app.key')),
            intdiv($now, 60) * 60,
            $write,
            max(1, $limit),
            max(1, $writeLimit ?? $limit),
        );

        try {
            $allowed = $this->redis->allow($attempt);
            if ($allowed) {
                try {
                    // Mirror accepted attempts so a Redis outage cannot grant a fresh allowance.
                    $allowed = $this->postgres->allow($attempt);
                } catch (Throwable) {
                    // Redis still enforces the policy when the mirror is unavailable.
                }
            }
        } catch (Throwable) {
            try {
                $allowed = $this->postgres->allow($attempt);
            } catch (Throwable) {
                throw new HttpResponseException(response()->json(['message' => 'Rate limiting is temporarily unavailable.'], 503));
            }
        }

        if (! $allowed) {
            throw new HttpResponseException(
                response()->json(['message' => 'Too many requests. Retry later.'], 429)
                    ->header('Retry-After', (string) (60 - ($now % 60)))
            );
        }
    }
}
