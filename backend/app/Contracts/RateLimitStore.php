<?php

namespace App\Contracts;

interface RateLimitStore
{
    public function allow(string $key, int $window, bool $write, int $allLimit, int $writeLimit): bool;
}
