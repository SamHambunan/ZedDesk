<?php

namespace App\Services;

use App\Contracts\RateLimitStore;
use Illuminate\Support\Facades\Redis;

class RedisRateLimitStore implements RateLimitStore
{
    private const SCRIPT = <<<'LUA'
local all = tonumber(redis.call('HGET', KEYS[1], 'all') or '0')
local writes = tonumber(redis.call('HGET', KEYS[1], 'writes') or '0')
if all >= tonumber(ARGV[1]) or (ARGV[3] == '1' and writes >= tonumber(ARGV[2])) then
    return 0
end
redis.call('HINCRBY', KEYS[1], 'all', 1)
if ARGV[3] == '1' then
    redis.call('HINCRBY', KEYS[1], 'writes', 1)
end
redis.call('EXPIRE', KEYS[1], 120)
return 1
LUA;

    public function allow(RateLimitAttempt $attempt): bool
    {
        return (int) Redis::connection()->eval(
            self::SCRIPT,
            1,
            config('rate_limits.key_prefix').':'.$attempt->key.':'.$attempt->window,
            $attempt->allLimit,
            $attempt->writeLimit,
            $attempt->write ? 1 : 0,
        ) === 1;
    }
}
