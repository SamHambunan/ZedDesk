<?php

namespace App\Http\Middleware;

use App\Services\ApiRateLimiter;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LimitPublicApi
{
    public function __construct(private readonly ApiRateLimiter $limiter) {}

    public function handle(Request $request, Closure $next, string $policy, string $scope = 'public'): Response
    {
        if ($scope === 'guest' && $request->user('sanctum')) {
            return $next($request);
        }

        $ip = $request->ip();
        $this->limiter->enforce(
            'public:'.$policy.':ip:'.$ip,
            (int) config('rate_limits.'.$policy.'_per_ip_per_minute'),
        );

        // Submitted email is an unverified abuse signal, never an authenticated identity.
        $email = $request->input('email');
        $email = is_string($email) ? mb_strtolower(trim($email)) : '';
        $this->limiter->enforce(
            'public:'.$policy.':identity:'.$email.':ip:'.$ip,
            (int) config('rate_limits.'.$policy.'_per_identity_ip_per_minute'),
        );

        return $next($request);
    }
}
