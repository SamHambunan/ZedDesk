<?php

namespace App\Http\Middleware;

use App\Contracts\RateLimitStore;
use App\Services\RedisRateLimitStore;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class LimitAuthenticatedApi
{
    public function __construct(
        private readonly RedisRateLimitStore $redis,
        private readonly RateLimitStore $postgres,
    ) {}

    public function handle(Request $request, Closure $next, string $scope = 'member'): Response
    {
        $user = $request->user();
        $organization = $scope === 'member' ? $request->attributes->get('organization') : null;
        if (! $user || ($scope === 'member' && ! $request->attributes->get('organization_member'))) {
            return $next($request);
        }

        $identity = 'user:'.$user->getAuthIdentifier().':organization:'.($organization?->id ?? 'global');
        $key = hash_hmac('sha256', $identity, config('app.key'));
        $now = now()->timestamp;
        $window = intdiv($now, 60) * 60;
        $write = ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true);
        $allLimit = max(1, (int) config('rate_limits.authenticated_per_minute'));
        $writeLimit = max(1, (int) config('rate_limits.authenticated_writes_per_minute'));

        try {
            $allowed = $this->redis->allow($key, $window, $write, $allLimit, $writeLimit);
            if ($allowed) {
                try {
                    // Keep the fallback window current so an outage cannot grant a fresh allowance.
                    $allowed = $this->postgres->allow($key, $window, $write, $allLimit, $writeLimit);
                } catch (Throwable) {
                    // Redis is enforcing the policy; a mirror failure cannot block the request.
                }
            }
        } catch (Throwable) {
            try {
                $allowed = $this->postgres->allow($key, $window, $write, $allLimit, $writeLimit);
            } catch (Throwable) {
                return response()->json(['message' => 'Rate limiting is temporarily unavailable.'], 503);
            }
        }

        if (! $allowed) {
            $retryAfter = 60 - ($now % 60);

            return response()->json(['message' => 'Too many requests. Retry later.'], 429)
                ->header('Retry-After', (string) $retryAfter);
        }

        return $next($request);
    }
}
