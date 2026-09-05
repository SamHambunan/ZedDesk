<?php

namespace App\Http\Middleware;

use App\Context\OrganizationContext;
use App\Http\Controllers\Api\OrganizationController;
use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $slug = $this->extractSubdomainSlug($request->getHost());

        if ($slug !== null) {
            if (in_array($slug, OrganizationController::RESERVED_SLUGS, true)) {
                return response()->json(['message' => 'Organization not found.'], 404);
            }

            $organization = Organization::where('slug', $slug)->first();

            if (! $organization) {
                return response()->json(['message' => 'Organization not found.'], 404);
            }

            app()->instance(Organization::class, $organization);
            app()->instance('currentOrganization', $organization);
            OrganizationContext::setCurrent($organization);
            $request->attributes->set('organization', $organization);
        }

        $response = $next($request);

        return $response;
    }

    public function terminate(Request $request, Response $response): void
    {
        OrganizationContext::clear();
    }

    public static function extractSubdomainSlug(string $host): ?string
    {
        // Strip any port number
        $host = preg_replace('/:\d+$/', '', strtolower($host));

        if ($host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
            return null;
        }

        if (str_ends_with($host, '.localhost')) {
            $subdomain = substr($host, 0, -strlen('.localhost'));
            $parts = explode('.', $subdomain);
            return $parts[0] ?: null;
        }

        $parts = explode('.', $host);
        if (count($parts) >= 3) {
            return $parts[0] ?: null;
        }

        return null;
    }
}
