<?php

namespace App\Http\Middleware;

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Ticket;
use App\Scopes\OrganizationScope;
use App\Services\CustomerTokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateCustomerTicketToken
{
    public function __construct(
        protected CustomerTokenService $tokenService = new CustomerTokenService
    ) {}

    /**
     * Handle an incoming request and validate the customer HMAC signed access token.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Verify tenant organization context
        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        if (! $organization) {
            return response()->json(['message' => 'Organization not found.'], 404);
        }

        // 2. Extract token from header or URL query parameter
        $token = $request->header('X-Customer-Token');

        if (empty($token)) {
            $token = $request->query('token') ?? $request->query('customer_token');
        }

        if (empty($token) && str_starts_with($request->header('Authorization', ''), 'Bearer ')) {
            $token = substr($request->header('Authorization'), 7);
        }

        if (empty($token)) {
            return response()->json(['message' => 'Customer access token is required.'], 401);
        }

        // 3. Verify HMAC SHA-256 signature and expiration
        $payload = $this->tokenService->verifyToken((string) $token);

        if ($payload === null) {
            if ($this->tokenService->isExpired((string) $token)) {
                return response()->json(['message' => 'Customer access token has expired.'], 401);
            }

            return response()->json(['message' => 'Invalid or tampered customer token.'], 401);
        }

        // 4. Verify organization boundary
        if ((int) $payload['organization_id'] !== (int) $organization->id) {
            return response()->json(['message' => 'Forbidden. Token belongs to another organization.'], 403);
        }

        // 5. Look up customer record within the organization
        $customer = Customer::withoutGlobalScope(OrganizationScope::class)
            ->where('id', $payload['customer_id'])
            ->where('organization_id', $organization->id)
            ->first();

        if (! $customer) {
            return response()->json(['message' => 'Forbidden. Customer not found in this organization.'], 403);
        }

        // 6. Validate ticket context if the route references a ticket
        $ticketParam = $request->route('ticket')
            ?? $request->route('uuid')
            ?? $request->route('ticket_id')
            ?? $request->route('id');

        if ($ticketParam !== null) {
            $ticket = $ticketParam instanceof Ticket
                ? $ticketParam
                : Ticket::withoutGlobalScope(OrganizationScope::class)->where('id', $ticketParam)->first();

            if (! $ticket) {
                return response()->json(['message' => 'Ticket not found.'], 404);
            }

            if ((int) $ticket->organization_id !== (int) $organization->id) {
                return response()->json(['message' => 'Forbidden. Ticket belongs to another organization.'], 403);
            }

            if ($ticket->customer_id !== $customer->id) {
                return response()->json(['message' => 'Forbidden. You do not have permission to access this ticket.'], 403);
            }

            if (! empty($payload['ticket_id']) && $payload['ticket_id'] !== $ticket->id) {
                return response()->json(['message' => 'Forbidden. Token is not valid for this ticket.'], 403);
            }

            $request->attributes->set('ticket', $ticket);
            app()->instance(Ticket::class, $ticket);
        }

        // 7. Inject verified customer and payload into request attributes and container
        $request->attributes->set('customer', $customer);
        $request->attributes->set('customer_token_payload', $payload);
        app()->instance(Customer::class, $customer);
        app()->instance('currentCustomer', $customer);

        return $next($request);
    }
}
