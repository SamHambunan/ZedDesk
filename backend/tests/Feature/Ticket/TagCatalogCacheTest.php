<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\User;
use App\Services\TagCatalogCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);

    $this->acmeUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password'),
    ]);

    $this->betaUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.test',
        'password' => Hash::make('password'),
    ]);

    $this->acmeMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->betaUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Ticket For Tags',
    ]);

    $this->acmeTag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Bug',
    ]);

    $this->betaTag = Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Feature',
    ]);

    try {
        Redis::connection()->flushdb();
    } catch (Throwable) {
        // Safe if Redis is not reachable
    }
});

afterEach(function () {
    $this->travelBack();
    OrganizationContext::clear();
    try {
        Redis::connection()->flushdb();
    } catch (Throwable) {
        // Safe if Redis is not reachable
    }
});

test('tag catalog cache preserves existing response shape and name ordering with organization keys and 60-second expiry', function () {
    Sanctum::actingAs($this->acmeUser);

    Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Alpha Tag',
    ]);

    $response = $this->getJson('http://acme.localhost/api/tags');

    $response->assertStatus(200)
        ->assertJsonCount(2, 'data')
        ->assertJsonStructure([
            'data' => [
                '*' => [
                    'id',
                    'organization_id',
                    'name',
                    'slug',
                    'created_at',
                    'updated_at',
                ],
            ],
        ]);

    $data = $response->json('data');
    expect($data[0]['name'])->toBe('Alpha Tag')
        ->and($data[1]['name'])->toBe('Bug');

    /** @var TagCatalogCache $cache */
    $cache = app(TagCatalogCache::class);
    $redis = Redis::connection();
    $cacheKey = $cache->cacheKey($this->acmeOrg->id);

    $ttl = $redis->ttl($cacheKey);
    expect($ttl)->toBeGreaterThan(0)
        ->and($ttl)->toBeLessThanOrEqual(60);
});

test('tag catalog cache avoids repeated database queries', function () {
    Sanctum::actingAs($this->acmeUser);

    // Initial request warms cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Track DB queries for second request
    $tagQueriesCount = 0;
    DB::listen(function ($query) use (&$tagQueriesCount) {
        if (str_contains(strtolower($query->sql), 'tags')) {
            $tagQueriesCount++;
        }
    });

    $response = $this->getJson('http://acme.localhost/api/tags');
    $response->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Bug');

    expect($tagQueriesCount)->toBe(0);
});

test('tag catalog cache ensures organization isolation', function () {
    Sanctum::actingAs($this->acmeUser);
    $acmeResponse = $this->getJson('http://acme.localhost/api/tags');
    $acmeResponse->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Bug');

    Sanctum::actingAs($this->betaUser);
    $betaResponse = $this->getJson('http://beta.localhost/api/tags');
    $betaResponse->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Feature');

    // Beta creates a tag -> invalidates only Beta cache
    $this->postJson('http://beta.localhost/api/tags', [
        'name' => 'Beta Improvement',
    ])->assertStatus(201);

    // Acme cache must still be warm and served with 0 DB queries
    Sanctum::actingAs($this->acmeUser);
    $tagQueriesCount = 0;
    DB::listen(function ($query) use (&$tagQueriesCount) {
        if (str_contains(strtolower($query->sql), 'tags')) {
            $tagQueriesCount++;
        }
    });

    $acmeResponse2 = $this->getJson('http://acme.localhost/api/tags');
    $acmeResponse2->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Bug');

    expect($tagQueriesCount)->toBe(0);

    // Beta cache was invalidated, so it sees both tags
    Sanctum::actingAs($this->betaUser);
    $betaResponse2 = $this->getJson('http://beta.localhost/api/tags');
    $betaResponse2->assertStatus(200)
        ->assertJsonCount(2, 'data');
});

test('creating a tag invalidates the organization tag catalog cache', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Create tag via API
    $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'New Urgent Issue',
    ])->assertStatus(201);

    // Next getJson must fetch from DB and include the new tag
    $response = $this->getJson('http://acme.localhost/api/tags');
    $response->assertStatus(200)
        ->assertJsonCount(2, 'data');

    $names = collect($response->json('data'))->pluck('name')->all();
    expect($names)->toContain('Bug', 'New Urgent Issue');
});

test('attaching or detaching a tag on a ticket does not invalidate the tag catalog cache', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm catalog cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Attach tag to ticket
    $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags", [
        'tag_id' => $this->acmeTag->id,
    ])->assertStatus(200);

    // Catalog cache should still be warm (0 queries on tags table)
    $tagQueriesCount = 0;
    DB::listen(function ($query) use (&$tagQueriesCount) {
        if (str_contains(strtolower($query->sql), 'tags') && ! str_contains(strtolower($query->sql), 'ticket_tags')) {
            $tagQueriesCount++;
        }
    });

    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);
    expect($tagQueriesCount)->toBe(0);

    // Detach tag from ticket
    $this->deleteJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags/{$this->acmeTag->id}")
        ->assertStatus(200);

    // Catalog cache should still be warm
    $tagQueriesCount = 0;
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);
    expect($tagQueriesCount)->toBe(0);
});

test('tag catalog cache expires after 60 seconds', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Advance 61 seconds
    $this->travel(61)->seconds();

    // Track DB queries: must re-query database
    $tagQueriesCount = 0;
    DB::listen(function ($query) use (&$tagQueriesCount) {
        if (str_contains(strtolower($query->sql), 'tags')) {
            $tagQueriesCount++;
        }
    });

    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);
    expect($tagQueriesCount)->toBeGreaterThan(0);
});

test('stale results are bounded to one minute even if invalidation fails', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm cache at t = 0
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Advance to t = 20
    $this->travel(20)->seconds();

    // Simulate Redis failure specifically during invalidation
    $originalCache = app(TagCatalogCache::class);
    $this->app->bind(TagCatalogCache::class, fn () => new class extends TagCatalogCache
    {
        public function invalidate(string $organizationId): void
        {
            throw new RuntimeException('Redis invalidation error');
        }
    });

    // Tag creation must succeed despite invalidation error
    $createResponse = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Created During Invalidation Failure',
    ]);
    $createResponse->assertStatus(201);

    // Restore normal cache implementation
    $this->app->instance(TagCatalogCache::class, $originalCache);

    // At t = 20: still within 60s window of the original cached entry
    $staleResponse = $this->getJson('http://acme.localhost/api/tags');
    $staleResponse->assertStatus(200)
        ->assertJsonCount(1, 'data'); // stale data bounded to remaining 40s

    // Advance 41 seconds (t = 61 from original write)
    $this->travel(41)->seconds();

    // Expired! Fresh data fetched from DB including the new tag
    $freshResponse = $this->getJson('http://acme.localhost/api/tags');
    $freshResponse->assertStatus(200)
        ->assertJsonCount(2, 'data');

    $names = collect($freshResponse->json('data'))->pluck('name')->all();
    expect($names)->toContain('Bug', 'Created During Invalidation Failure');
});

test('in-flight cache fill racing with catalog change does not overwrite invalidation or restart stale ttl', function () {
    /** @var TagCatalogCache $cache */
    $cache = app(TagCatalogCache::class);

    // 1. Initial state: cache is empty
    $orgId = $this->acmeOrg->id;
    $cacheKey = $cache->cacheKey($orgId);
    $versionKey = $cache->versionKey($orgId);

    // 2. Reader A starts: reads current version (0) and queries DB at t = 0
    $readStartTime = now()->timestamp;
    $version = (string) (Redis::connection()->get($versionKey) ?? '0');
    $staleTags = Tag::withoutGlobalScopes()
        ->where('organization_id', $orgId)
        ->orderBy('name')
        ->get()
        ->toArray();
    expect($staleTags)->toHaveCount(1);

    // 3. Before Reader A writes to cache, a new Tag is created and invalidates cache
    Tag::create([
        'organization_id' => $orgId,
        'name' => 'Concurrent Tag',
    ]);
    $cache->invalidate($orgId);

    // Version in Redis has incremented
    $newVersion = (string) Redis::connection()->get($versionKey);
    expect($newVersion)->not->toBe($version);

    // 4. Reader A attempts to store its stale query result with old expected version
    $stored = $cache->storeCache($orgId, $staleTags, $version, $readStartTime);
    expect($stored)->toBeFalse();

    // Redis cache key was NOT set with the stale data
    expect(Redis::connection()->get($cacheKey))->toBeNull();

    // 5. Subsequent read via get() fetches the updated catalog from DB and caches it
    $freshCatalog = $cache->get($orgId);
    expect($freshCatalog)->toHaveCount(2);
    $names = collect($freshCatalog)->pluck('name')->all();
    expect($names)->toContain('Bug', 'Concurrent Tag');
});

test('catalog reads and tag creation fall back to PostgreSQL during Redis outage', function () {
    Sanctum::actingAs($this->acmeUser);

    // Simulate complete Redis outage
    $this->app->bind(TagCatalogCache::class, fn () => new class extends TagCatalogCache
    {
        protected function redis()
        {
            throw new RuntimeException('Redis completely unavailable');
        }
    });

    // GET /api/tags falls back to PostgreSQL
    $response = $this->getJson('http://acme.localhost/api/tags');
    $response->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Bug');

    // POST /api/tags succeeds and commits to PostgreSQL
    $createResponse = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Tag Created In Outage',
    ]);
    $createResponse->assertStatus(201)
        ->assertJsonPath('data.name', 'Tag Created In Outage');

    $this->assertDatabaseHas('tags', [
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tag Created In Outage',
    ]);

    // Subsequent GET still returns all tags from PostgreSQL
    $response2 = $this->getJson('http://acme.localhost/api/tags');
    $response2->assertStatus(200)
        ->assertJsonCount(2, 'data');
});

test('unauthenticated and unauthorized requests are not served by cache', function () {
    // Warm cache with authorized user
    Sanctum::actingAs($this->acmeUser);
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Unauthenticated request
    $this->app['auth']->forgetGuards();
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(401);

    // Member of another organization requesting Acme tags
    Sanctum::actingAs($this->betaUser);
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(403);
});

test('updating an existing tag invalidates the organization tag catalog cache', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Update tag
    $this->acmeTag->update(['name' => 'Renamed Bug']);

    // Next getJson must fetch from DB and include the updated tag name
    $response = $this->getJson('http://acme.localhost/api/tags');
    $response->assertStatus(200);

    $names = collect($response->json('data'))->pluck('name')->all();
    expect($names)->toContain('Renamed Bug')
        ->and($names)->not->toContain('Bug');
});

test('deleting a tag invalidates the organization tag catalog cache', function () {
    Sanctum::actingAs($this->acmeUser);

    // Warm cache
    $this->getJson('http://acme.localhost/api/tags')->assertStatus(200);

    // Delete tag
    $this->acmeTag->delete();

    // Next getJson must fetch from DB and be empty
    $response = $this->getJson('http://acme.localhost/api/tags');
    $response->assertStatus(200)
        ->assertJsonCount(0, 'data');
});
