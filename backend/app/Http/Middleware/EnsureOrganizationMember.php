<?php

namespace App\Http\Middleware;

use App\Context\OrganizationContext;
use App\Models\OrganizationMember;
use App\Services\AuditLogWriter;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureOrganizationMember
{
    public function handle(Request $request, Closure $next): Response
    {
        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        if (! $organization) {
            return response()->json(['message' => 'Organization not found.'], 404);
        }

        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $organizationMember = OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->first();

        if (! $organizationMember) {
            try {
                app(AuditLogWriter::class)->recordAccessDenied(
                    actor: $user,
                    action: 'membership.denied',
                    targetType: 'organization',
                    targetId: (string) $organization->id,
                    reason: 'not_organization_member',
                    organizationId: null,
                    requestLocation: $request->path()
                );
            } catch (\Throwable $e) {
                report($e);
            }

            return response()->json(['message' => 'Forbidden. You are not an Organization Member of this Organization.'], 403);
        }

        $request->attributes->set('organization_member', $organizationMember);
        $request->attributes->set('role', $organizationMember->role);

        return $next($request);
    }
}
