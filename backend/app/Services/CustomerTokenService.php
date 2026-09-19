<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Ticket;
use Illuminate\Http\Request;
use JsonException;

class CustomerTokenService
{
    /**
     * Default token expiration: 30 days (in seconds).
     */
    public const DEFAULT_EXPIRATION_SECONDS = 30 * 24 * 60 * 60;

    /**
     * Generate a cryptographically signed HMAC SHA-256 customer access token.
     *
     * @param  int|null  $expiresInSeconds  Null for default 30 days, 0 or negative for non-expiring
     */
    public function generateToken(Customer $customer, ?Ticket $ticket = null, ?int $expiresInSeconds = null): string
    {
        $now = time();
        if ($expiresInSeconds === null) {
            $expiresAt = $now + self::DEFAULT_EXPIRATION_SECONDS;
        } elseif ($expiresInSeconds === 0) {
            $expiresAt = null;
        } else {
            $expiresAt = $now + $expiresInSeconds;
        }

        $payload = [
            'customer_id' => (string) $customer->id,
            'organization_id' => (int) $customer->organization_id,
            'ticket_id' => $ticket ? (string) $ticket->id : null,
            'created_at' => $now,
            'expires_at' => $expiresAt,
        ];

        return $this->signPayload($payload);
    }

    /**
     * Sign an arbitrary payload array into an HMAC SHA-256 signed token string.
     *
     * @param  array<string, mixed>  $payload
     */
    public function signPayload(array $payload): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $encodedPayload = strtr(base64_encode($json), '+/=', '-_');
        $signature = hash_hmac('sha256', $encodedPayload, $this->getSigningKey());

        return $encodedPayload.'.'.$signature;
    }

    /**
     * Verify and decode an HMAC-signed customer token.
     * Returns the payload array if valid and not expired, null otherwise.
     *
     * @return array<string, mixed>|null
     */
    public function verifyToken(string $token): ?array
    {
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            return null;
        }

        [$encodedPayload, $signature] = $parts;

        $expectedSignature = hash_hmac('sha256', $encodedPayload, $this->getSigningKey());
        if (! hash_equals($expectedSignature, $signature)) {
            return null;
        }

        $decodedJson = base64_decode(strtr($encodedPayload, '-_', '+/'), true);
        if ($decodedJson === false) {
            return null;
        }

        try {
            $payload = json_decode($decodedJson, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        if (! is_array($payload) || ! isset($payload['customer_id'], $payload['organization_id'])) {
            return null;
        }

        if (isset($payload['expires_at']) && $payload['expires_at'] !== null) {
            if (time() > (int) $payload['expires_at']) {
                return null;
            }
        }

        return $payload;
    }

    /**
     * Check if a token string has specifically expired.
     */
    public function isExpired(string $token): bool
    {
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            return false;
        }

        [$encodedPayload, $signature] = $parts;
        $expectedSignature = hash_hmac('sha256', $encodedPayload, $this->getSigningKey());
        if (! hash_equals($expectedSignature, $signature)) {
            return false;
        }

        $decodedJson = base64_decode(strtr($encodedPayload, '-_', '+/'), true);
        if ($decodedJson === false) {
            return false;
        }

        try {
            $payload = json_decode($decodedJson, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return false;
        }

        if (is_array($payload) && isset($payload['expires_at']) && $payload['expires_at'] !== null) {
            return time() > (int) $payload['expires_at'];
        }

        return false;
    }

    /**
     * Generate the customer portal magic link URL for a customer.
     */
    public function generateMagicLink(Customer $customer, ?string $token = null, ?Request $request = null): string
    {
        $token = $token ?? $this->generateToken($customer);
        $baseUrl = $this->resolveBasePortalUrl($customer, $request);

        return "{$baseUrl}/portal?token={$token}";
    }

    /**
     * Generate the customer portal ticket URL for a ticket.
     */
    public function generateTicketUrl(Ticket $ticket, ?string $token = null, ?Request $request = null): string
    {
        $customer = $ticket->relationLoaded('customer')
            ? $ticket->customer
            : Customer::withoutGlobalScopes()->find($ticket->customer_id);

        $token = $token ?? $this->generateToken($customer, $ticket);
        $baseUrl = $this->resolveBasePortalUrl($customer, $request);

        return "{$baseUrl}/portal/tickets/{$ticket->id}?token={$token}";
    }

    /**
     * Resolve the base URL for the organization customer portal.
     */
    protected function resolveBasePortalUrl(Customer $customer, ?Request $request = null): string
    {
        if ($request) {
            $scheme = $request->getScheme();
            $host = $request->getHost();
            $port = $request->getPort();
            $portStr = ($port && ! in_array($port, [80, 443])) ? ":{$port}" : '';

            return "{$scheme}://{$host}{$portStr}";
        }

        $organization = $customer->organization;

        $slug = $organization ? $organization->slug : 'acme';

        return "http://{$slug}.localhost:8000";
    }

    /**
     * Get the HMAC secret key.
     */
    protected function getSigningKey(): string
    {
        $key = config('app.key') ?? 'base64:defaultSecretKeyForTesting1234567890=';
        if (str_starts_with($key, 'base64:')) {
            $key = base64_decode(substr($key, 7));
        }

        return $key;
    }
}
