<?php

namespace App\Http\Middleware;

use App\Services\ApiRateLimiter;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LimitCustomerPortal
{
    public function __construct(private readonly ApiRateLimiter $limiter) {}

    public function handle(Request $request, Closure $next): Response
    {
        $customer = $request->attributes->get('customer');
        $this->limiter->enforce(
            'customer-ip:'.$request->ip(),
            (int) config('rate_limits.customer_per_ip_per_minute'),
        );
        $this->limiter->enforce(
            'customer:'.$customer->id.':organization:'.$customer->organization_id,
            (int) config('rate_limits.customer_per_minute'),
            ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true),
            (int) config('rate_limits.customer_writes_per_minute'),
        );

        return $next($request);
    }
}
