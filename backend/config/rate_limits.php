<?php

use Illuminate\Support\Str;

return [
    'authenticated_per_minute' => (int) env('AUTHENTICATED_API_LIMIT', 120),
    'authenticated_writes_per_minute' => (int) env('AUTHENTICATED_API_WRITE_LIMIT', 30),
    'key_prefix' => env('RATE_LIMIT_KEY_PREFIX', env('APP_ENV') === 'testing' ? 'test:'.Str::random(20) : 'api-limit'),
];
