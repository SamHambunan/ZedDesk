<?php

namespace App\Services;

use App\Models\Tag;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

class TagCatalogCache
{
    public const TTL_SECONDS = 60;

    private const INVALIDATE_SCRIPT = <<<'LUA'
redis.call('DEL', KEYS[1])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 3600)
return 1
LUA;

    private const SET_SCRIPT = <<<'LUA'
local current_version = redis.call('GET', KEYS[2]) or '0'
if current_version == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 1
else
    return 0
end
LUA;

    public function cacheKey(string $organizationId): string
    {
        return "tag_catalog:{{$organizationId}}";
    }

    public function versionKey(string $organizationId): string
    {
        return "tag_catalog:{{$organizationId}}:version";
    }

    /**
     * Get the tag catalog for an organization, using cache or falling back to PostgreSQL.
     *
     * @return array<int, array<string, mixed>>
     */
    public function get(string $organizationId): array
    {
        $cacheKey = $this->cacheKey($organizationId);
        $versionKey = $this->versionKey($organizationId);

        try {
            $cached = $this->redis()->get($cacheKey);
            if ($cached !== null && $cached !== false) {
                $decoded = json_decode((string) $cached, true);
                if (is_array($decoded) && isset($decoded['cached_at'], $decoded['tags']) && is_array($decoded['tags'])) {
                    $age = now()->timestamp - (int) $decoded['cached_at'];
                    if ($age >= 0 && $age < self::TTL_SECONDS) {
                        return $decoded['tags'];
                    }
                }
            }
        } catch (Throwable $e) {
            Log::warning("Tag catalog cache read failed: {$e->getMessage()}");

            return $this->fetchFromDatabase($organizationId);
        }

        $startTime = now()->timestamp;
        $version = '0';
        try {
            $v = $this->redis()->get($versionKey);
            if ($v !== null && $v !== false) {
                $version = (string) $v;
            }
        } catch (Throwable $e) {
            Log::warning("Tag catalog cache version read failed: {$e->getMessage()}");

            return $this->fetchFromDatabase($organizationId);
        }

        $tags = $this->fetchFromDatabase($organizationId);

        $this->storeCache($organizationId, $tags, $version, $startTime);

        return $tags;
    }

    /**
     * Store the tag catalog in cache if the expected version matches.
     *
     * @param  array<int, array<string, mixed>>  $tags
     */
    public function storeCache(string $organizationId, array $tags, string $expectedVersion, int $startTime): bool
    {
        $cacheKey = $this->cacheKey($organizationId);
        $versionKey = $this->versionKey($organizationId);

        try {
            $elapsed = max(0, now()->timestamp - $startTime);
            $ttl = min(self::TTL_SECONDS, max(1, self::TTL_SECONDS - $elapsed));
            $payload = json_encode([
                'cached_at' => $startTime,
                'tags' => $tags,
            ], JSON_THROW_ON_ERROR);

            $result = $this->redis()->eval(
                self::SET_SCRIPT,
                2,
                $cacheKey,
                $versionKey,
                $expectedVersion,
                $payload,
                $ttl
            );

            return (int) $result === 1;
        } catch (Throwable $e) {
            Log::warning("Tag catalog cache write failed: {$e->getMessage()}");

            return false;
        }
    }

    /**
     * Invalidate the tag catalog cache for an organization.
     */
    public function invalidate(string $organizationId): void
    {
        $cacheKey = $this->cacheKey($organizationId);
        $versionKey = $this->versionKey($organizationId);

        try {
            $this->redis()->eval(
                self::INVALIDATE_SCRIPT,
                2,
                $cacheKey,
                $versionKey
            );
        } catch (Throwable $e) {
            Log::warning("Tag catalog cache invalidation failed: {$e->getMessage()}");
        }
    }

    /**
     * Fetch the tag catalog from the database.
     *
     * @return array<int, array<string, mixed>>
     */
    public function fetchFromDatabase(string $organizationId): array
    {
        return Tag::withoutGlobalScopes()
            ->where('organization_id', $organizationId)
            ->orderBy('name')
            ->get()
            ->toArray();
    }

    /**
     * Get the Redis connection instance.
     */
    protected function redis()
    {
        return Redis::connection();
    }
}
