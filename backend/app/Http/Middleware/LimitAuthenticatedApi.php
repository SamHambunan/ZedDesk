<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\TicketController;
use App\Services\ApiRateLimiter;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LimitAuthenticatedApi
{
    public function __construct(
        private readonly ApiRateLimiter $limiter,
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
        $this->limiter->enforce(
            $identity,
            (int) config('rate_limits.authenticated_per_minute'),
            ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true),
            (int) config('rate_limits.authenticated_writes_per_minute'),
        );

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
