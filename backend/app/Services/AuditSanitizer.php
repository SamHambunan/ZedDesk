<?php

namespace App\Services;

class AuditSanitizer
{
    private const SENSITIVE_KEYS = [
        'password',
        'password_confirmation',
        'secret',
        'token',
        'key',
        'auth_token',
        'access_token',
        'customer_token',
        'signature',
        'bearer',
        'cookie',
        'email',
        'name',
        'message',
        'body',
    ];

    /**
     * Recursively sanitize metadata/changes to remove sensitive fields and redact sensitive strings.
     */
    public static function sanitizeMetadata(array $data): array
    {
        $sanitized = [];

        foreach ($data as $key => $value) {
            $lowerKey = strtolower((string) $key);

            if (in_array($lowerKey, self::SENSITIVE_KEYS, true)) {
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = self::sanitizeMetadata($value);
            } elseif (is_string($value)) {
                $sanitized[$key] = self::sanitizeString($value);
            } else {
                $sanitized[$key] = $value;
            }
        }

        return $sanitized;
    }

    /**
     * Clean and redact request location to avoid leaking credential-bearing query strings or credentials.
     */
    public static function sanitizeRequestLocation(?string $location): ?string
    {
        if ($location === null || $location === '') {
            return null;
        }

        // Extract path portion only, stripping any query string (?token=...)
        $path = parse_url($location, PHP_URL_PATH);

        if ($path === null || $path === false || $path === '') {
            $path = explode('?', $location)[0];
        }

        // Redact any userinfo in URLs (e.g. user:pass@host)
        return self::sanitizeString($path);
    }

    /**
     * Sanitize string values to redact email addresses and credential patterns.
     */
    public static function sanitizeString(string $value): string
    {
        // Redact email addresses
        $cleaned = preg_replace('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', '[REDACTED_EMAIL]', $value) ?? $value;

        // Redact Bearer tokens
        $cleaned = preg_replace('/(Bearer\s+)[A-Za-z0-9_\.\-]+/i', '$1[REDACTED]', $cleaned) ?? $cleaned;

        // Redact query parameter tokens or secrets if present
        $cleaned = preg_replace('/([?&](token|secret|key|password|signature)=)[^&]+/i', '$1[REDACTED]', $cleaned) ?? $cleaned;

        return $cleaned;
    }
}
