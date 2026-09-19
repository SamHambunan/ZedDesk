<?php

use App\Http\Middleware\EnsureOrganizationMember;
use App\Http\Middleware\ResolveOrganization;
use App\Http\Middleware\ValidateCustomerTicketToken;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'resolve.organization' => ResolveOrganization::class,
            'ensure.organization_member' => EnsureOrganizationMember::class,
            'customer.token' => ValidateCustomerTicketToken::class,
            'validate.customer_token' => ValidateCustomerTicketToken::class,
        ]);

        $middleware->api(prepend: [
            ResolveOrganization::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
