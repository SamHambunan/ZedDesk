<?php

namespace App\Http\Middleware;

use App\Contracts\RateLimitStore;
use App\Enums\Role;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\TicketController;
use App\Services\RateLimitAttempt;
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
        $user = $scope === 'optional' ? $request->user('sanctum') : $request->user();
        $organization = $scope === 'member' ? $request->attributes->get('organization') : null;
        if (! $user || ($scope === 'member' && ! $request->attributes->get('organization_member'))) {
            return $next($request);
        }
        if ($scope === 'member' && $this->isAdminOnlyDenial($request)) {
            return $next($request);
        }

        $identity = 'user:'.$user->getAuthIdentifier().':organization:'.($organization?->id ?? 'global');
        $key = hash_hmac('sha256', $identity, config('app.key'));
        $now = now()->timestamp;
        $window = intdiv($now, 60) * 60;
        $attempt = new RateLimitAttempt(
            $key,
            $window,
            ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true),
            max(1, (int) config('rate_limits.authenticated_per_minute')),
            max(1, (int) config('rate_limits.authenticated_writes_per_minute')),
        );

        try {
            $allowed = $this->redis->allow($attempt);
            if ($allowed) {
                try {
                    // Keep the fallback window current so an outage cannot grant a fresh allowance.
                    $allowed = $this->postgres->allow($attempt);
                } catch (Throwable) {
                    // Redis is enforcing the policy; a mirror failure cannot block the request.
                }
            }
        } catch (Throwable) {
            try {
                $allowed = $this->postgres->allow($attempt);
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

    private function isAdminOnlyDenial(Request $request): bool
    {
        $role = $request->attributes->get('role');
        if (($role instanceof Role ? $role->value : $role) === Role::ADMIN->value) {
            return false;
        }

        return in_array($request->route()?->getActionName(), [
            AuditLogController::class.'@index',
            InvitationController::class.'@index',
            InvitationController::class.'@store',
            InvitationController::class.'@destroy',
            TeamController::class.'@store',
            TeamController::class.'@update',
            TeamController::class.'@destroy',
            TeamController::class.'@addMember',
            TeamController::class.'@removeMember',
            TicketController::class.'@destroy',
            TicketController::class.'@restore',
        ], true);
    }
}
