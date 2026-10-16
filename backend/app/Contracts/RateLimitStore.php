<?php

namespace App\Contracts;

use App\Services\RateLimitAttempt;

interface RateLimitStore
{
    public function allow(RateLimitAttempt $attempt): bool;
}
