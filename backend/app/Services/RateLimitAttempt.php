<?php

namespace App\Services;

class RateLimitAttempt
{
    public function __construct(
        public readonly string $key,
        public readonly int $window,
        public readonly bool $write,
        public readonly int $allLimit,
        public readonly int $writeLimit,
    ) {}
}
