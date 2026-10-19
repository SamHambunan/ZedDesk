<?php

use Illuminate\Support\Str;

return [
    'authenticated_per_minute' => (int) env('AUTHENTICATED_API_LIMIT', 120),
    'authenticated_writes_per_minute' => (int) env('AUTHENTICATED_API_WRITE_LIMIT', 30),
    'login_per_ip_per_minute' => (int) env('LOGIN_IP_LIMIT', 100),
    'login_per_identity_ip_per_minute' => (int) env('LOGIN_IDENTITY_IP_LIMIT', 5),
    'registration_per_ip_per_minute' => (int) env('REGISTRATION_IP_LIMIT', 5),
    'registration_per_identity_ip_per_minute' => (int) env('REGISTRATION_IDENTITY_IP_LIMIT', 5),
    'ticket_creation_per_ip_per_minute' => (int) env('PUBLIC_TICKET_IP_LIMIT', 5),
    'ticket_creation_per_identity_ip_per_minute' => (int) env('PUBLIC_TICKET_IDENTITY_IP_LIMIT', 5),
    'access_link_per_ip_per_minute' => (int) env('ACCESS_LINK_IP_LIMIT', 5),
    'access_link_per_identity_ip_per_minute' => (int) env('ACCESS_LINK_IDENTITY_IP_LIMIT', 5),
    'customer_per_minute' => (int) env('CUSTOMER_PORTAL_LIMIT', 60),
    'customer_writes_per_minute' => (int) env('CUSTOMER_PORTAL_WRITE_LIMIT', 10),
    'customer_per_ip_per_minute' => (int) env('CUSTOMER_PORTAL_IP_LIMIT', 300),
    'key_prefix' => env('RATE_LIMIT_KEY_PREFIX', env('APP_ENV') === 'testing' ? 'test:'.Str::random(20) : 'api-limit'),
];
