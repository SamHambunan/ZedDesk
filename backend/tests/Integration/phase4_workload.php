<?php

// Docker only: php tests/Integration/phase4_workload.php seed|run [--tickets=10000] [--seconds=600] [--prefix=phase4]
// Uses dedicated Organizations and leaves them in place for inspection. Never use against production data.

use App\Models\User;
use App\Services\TagCatalogCache;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$mode = $argv[1] ?? '';
$options = [];
foreach (array_slice($argv, 2) as $argument) {
    if (! preg_match('/^--(tickets|seconds|prefix)=([a-zA-Z0-9-]+)$/', $argument, $matches)) {
        throw new InvalidArgumentException("Unexpected option: {$argument}");
    }
    $options[$matches[1]] = $matches[2];
}
$ticketsPerOrganization = (int) ($options['tickets'] ?? 10000);
$seconds = (int) ($options['seconds'] ?? 600);
$prefix = $options['prefix'] ?? 'phase4';
if (! in_array($mode, ['seed', 'run'], true) || $ticketsPerOrganization < 1 || $seconds < 1
    || ! preg_match('/^[a-z][a-z0-9-]{2,30}$/', $prefix)) {
    fwrite(STDERR, "Usage: php tests/Integration/phase4_workload.php seed|run [--tickets=10000] [--seconds=600] [--prefix=phase4]\n");
    exit(2);
}

function fixture(int $number, string $prefix): object
{
    $slug = sprintf('%s-%02d', $prefix, $number);
    $organization = DB::table('organizations')->where('slug', $slug)->first();
    if (! $organization) {
        throw new RuntimeException("Missing {$slug}; run seed first.");
    }

    return $organization;
}

function seedOrganization(int $number, string $prefix, int $count): void
{
    $slug = sprintf('%s-%02d', $prefix, $number);
    $existing = DB::table('organizations')->where('slug', $slug)->first();
    if ($existing) {
        $actual = DB::table('tickets')->where('organization_id', $existing->id)->count();
        if ($actual !== $count) {
            throw new RuntimeException("{$slug} has {$actual} Tickets; expected {$count}. Use a new prefix.");
        }
        $members = DB::table('organization_members')->where('organization_id', $existing->id)
            ->orderBy('id')->pluck('id')->all();
        if (count($members) !== 5) {
            throw new RuntimeException("{$slug} does not have five Users.");
        }
        $tagIds = [];
        foreach (['workload' => 'Workload', 'workload-billing' => 'Billing',
            'workload-bug' => 'Bug', 'workload-feature' => 'Feature'] as $tagSlug => $name) {
            $tagId = DB::table('tags')->where('organization_id', $existing->id)
                ->where('slug', $tagSlug)->value('id');
            if (! $tagId) {
                $tagId = (string) Str::uuid();
                DB::table('tags')->insert(['id' => $tagId, 'organization_id' => $existing->id,
                    'name' => $name, 'slug' => $tagSlug, 'created_at' => now(), 'updated_at' => now()]);
            }
            $tagIds[] = $tagId;
        }
        DB::statement(<<<'SQL'
            UPDATE ticket_tags AS tt
            SET tag_id = CASE ((t.ticket_number / 4)::integer % 4)
                WHEN 0 THEN CAST(? AS uuid) WHEN 1 THEN CAST(? AS uuid)
                WHEN 2 THEN CAST(? AS uuid) ELSE CAST(? AS uuid) END
            FROM tickets AS t
            WHERE tt.ticket_id = t.id AND t.organization_id = ? AND t.ticket_number % 4 = 0
            SQL, [...$tagIds, $existing->id]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_messages (id, organization_id, ticket_id, message_type, author_type, author_id, body, created_at, updated_at)
            SELECT gen_random_uuid(), ?, t.id, 'public_reply', ?, CAST(? AS text),
                   'Representative agent reply ' || t.ticket_number, now(), now()
            FROM tickets AS t
            WHERE t.organization_id = ? AND t.ticket_number % 10 = 0
              AND NOT EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = t.id
                              AND m.body = 'Representative agent reply ' || t.ticket_number)
            SQL, [$existing->id, 'App\\Models\\OrganizationMember', $members[1], $existing->id]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_messages (id, organization_id, ticket_id, message_type, author_type, author_id, body, created_at, updated_at)
            SELECT gen_random_uuid(), ?, t.id, 'internal_note', ?, CAST(? AS text),
                   'Representative internal note ' || t.ticket_number, now(), now()
            FROM tickets AS t
            WHERE t.organization_id = ? AND t.ticket_number % 10 = 0
              AND NOT EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = t.id
                              AND m.body = 'Representative internal note ' || t.ticket_number)
            SQL, [$existing->id, 'App\\Models\\OrganizationMember', $members[2], $existing->id]);
        DB::statement(<<<'SQL'
            UPDATE notifications AS n
            SET recipient_member_id = CASE ((t.ticket_number / 10)::integer % 5)
                WHEN 0 THEN CAST(? AS bigint) WHEN 1 THEN CAST(? AS bigint)
                WHEN 2 THEN CAST(? AS bigint) WHEN 3 THEN CAST(? AS bigint)
                ELSE CAST(? AS bigint) END
            FROM tickets AS t
            WHERE n.ticket_id = t.id AND t.organization_id = ?
              AND n.activity_type = 'ticket_assigned' AND t.ticket_number % 10 = 0
            SQL, [...$members, $existing->id]);
        app(TagCatalogCache::class)->invalidate((string) $existing->id);

        return;
    }

    DB::transaction(function () use ($number, $slug, $count): void {
        $now = now();
        $organizationId = DB::table('organizations')->insertGetId([
            'name' => "Phase 4 workload {$number}", 'slug' => $slug,
            'ticket_counter' => $count, 'created_at' => $now, 'updated_at' => $now,
        ]);
        $members = [];
        for ($userNumber = 1; $userNumber <= 5; $userNumber++) {
            $user = User::create([
                'name' => "Workload User {$number}.{$userNumber}",
                'email' => "{$slug}-user-{$userNumber}@example.test",
                'password' => Str::random(64),
            ]);
            $members[] = DB::table('organization_members')->insertGetId([
                'organization_id' => $organizationId, 'user_id' => $user->id,
                'role' => $userNumber === 1 ? 'admin' : 'agent',
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        $customerId = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $customerId, 'organization_id' => $organizationId,
            'name' => 'Workload Customer', 'email' => "{$slug}-customer@example.test",
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $tagIds = [];
        foreach (['workload' => 'Workload', 'workload-billing' => 'Billing',
            'workload-bug' => 'Bug', 'workload-feature' => 'Feature'] as $tagSlug => $name) {
            $tagId = (string) Str::uuid();
            DB::table('tags')->insert([
                'id' => $tagId, 'organization_id' => $organizationId,
                'name' => $name, 'slug' => $tagSlug,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            $tagIds[] = $tagId;
        }

        // A temporary relation keeps the UUID/number pairing stable across bulk inserts.
        DB::statement('CREATE TEMP TABLE phase4_ticket_ids (number integer PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP');
        DB::statement('INSERT INTO phase4_ticket_ids SELECT n, gen_random_uuid() FROM generate_series(1, ?) AS n', [$count]);
        DB::statement(<<<'SQL'
            INSERT INTO tickets (id, organization_id, ticket_number, customer_id, subject, status, priority,
                                 assigned_member_id, created_at, updated_at)
            SELECT p.id, ?, p.number, ?, 'Phase 4 workload Ticket ' || p.number,
                   CASE WHEN p.number % 5 = 0 THEN 'pending' ELSE 'open' END,
                   CASE WHEN p.number % 7 = 0 THEN 'high' ELSE 'medium' END,
                   CASE WHEN p.number % 4 = 0 THEN NULL ELSE CAST(? AS bigint) END, now(), now()
            FROM phase4_ticket_ids p
            SQL, [$organizationId, $customerId, $members[1]]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_messages (id, organization_id, ticket_id, message_type, author_type, author_id, body, created_at, updated_at)
            SELECT gen_random_uuid(), ?, p.id, 'public_reply', ?, ?,
                   'Representative customer conversation ' || p.number, now(), now()
            FROM phase4_ticket_ids p
            SQL, [$organizationId, 'App\\Models\\Customer', $customerId]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_messages (id, organization_id, ticket_id, message_type, author_type, author_id, body, created_at, updated_at)
            SELECT gen_random_uuid(), ?, p.id, 'public_reply', ?, CAST(? AS text),
                   'Representative agent reply ' || p.number, now(), now()
            FROM phase4_ticket_ids p WHERE p.number % 10 = 0
            SQL, [$organizationId, 'App\\Models\\OrganizationMember', $members[1]]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_messages (id, organization_id, ticket_id, message_type, author_type, author_id, body, created_at, updated_at)
            SELECT gen_random_uuid(), ?, p.id, 'internal_note', ?, CAST(? AS text),
                   'Representative internal note ' || p.number, now(), now()
            FROM phase4_ticket_ids p WHERE p.number % 10 = 0
            SQL, [$organizationId, 'App\\Models\\OrganizationMember', $members[2]]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_assignments (id, organization_id, ticket_id, member_id, assigned_by_id, created_at)
            SELECT gen_random_uuid(), ?, p.id, ?, ?, now()
            FROM phase4_ticket_ids p WHERE p.number % 4 <> 0
            SQL, [$organizationId, $members[1], $members[0]]);
        DB::statement(<<<'SQL'
            INSERT INTO ticket_tags (ticket_id, tag_id, created_at, updated_at)
            SELECT p.id,
                   CASE ((p.number / 4)::integer % 4)
                       WHEN 0 THEN CAST(? AS uuid) WHEN 1 THEN CAST(? AS uuid)
                       WHEN 2 THEN CAST(? AS uuid) ELSE CAST(? AS uuid) END,
                   now(), now()
            FROM phase4_ticket_ids p WHERE p.number % 4 = 0
            SQL, $tagIds);
        DB::statement(<<<'SQL'
            INSERT INTO notifications (id, organization_id, recipient_member_id, ticket_id, activity_type,
                                       latest_activity_metadata, latest_activity_at, created_at, updated_at)
            SELECT gen_random_uuid(), ?,
                   CASE ((p.number / 10)::integer % 5)
                       WHEN 0 THEN CAST(? AS bigint) WHEN 1 THEN CAST(? AS bigint)
                       WHEN 2 THEN CAST(? AS bigint) WHEN 3 THEN CAST(? AS bigint)
                       ELSE CAST(? AS bigint) END,
                   p.id, 'ticket_assigned', '{}', now(), now(), now()
            FROM phase4_ticket_ids p WHERE p.number % 10 = 0
            SQL, [$organizationId, ...$members]);
    });
}

function requestHandle(string $method, string $slug, string $path, string $token, ?array $body = null): CurlHandle
{
    $headers = ["Host: {$slug}.localhost", 'Accept: application/json', "Authorization: Bearer {$token}"];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    if ($method === 'POST' && str_ends_with($path, '/messages')) {
        $headers[] = 'Idempotency-Key: '.bin2hex(random_bytes(32));
    }
    $handle = curl_init('http://nginx'.$path);
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    if ($body !== null) {
        curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
    }

    return $handle;
}

function summarize(array $samples): array
{
    sort($samples);

    return ['count' => count($samples), 'p50_ms' => $samples[(int) floor((count($samples) - 1) * .50)],
        'p95_ms' => $samples[(int) ceil(count($samples) * .95) - 1], 'max_ms' => end($samples)];
}

$issuedTokenIds = [];
try {
    if ($mode === 'seed') {
        for ($number = 1; $number <= 10; $number++) {
            seedOrganization($number, $prefix, $ticketsPerOrganization);
            fwrite(STDERR, "Seeded {$prefix}-".sprintf('%02d', $number)."\n");
        }
        $organizationIds = DB::table('organizations')->where('slug', 'like', $prefix.'-%')->pluck('id');
        $counts = [
            'organizations' => $organizationIds->count(),
            'users' => DB::table('organization_members')->whereIn('organization_id', $organizationIds)->count(),
            'tickets' => DB::table('tickets')->whereIn('organization_id', $organizationIds)->count(),
            'messages' => DB::table('ticket_messages')->whereIn('organization_id', $organizationIds)->count(),
            'assignments' => DB::table('ticket_assignments')->whereIn('organization_id', $organizationIds)->count(),
            'tags' => DB::table('tags')->whereIn('organization_id', $organizationIds)->count(),
            'notifications' => DB::table('notifications')->whereIn('organization_id', $organizationIds)->count(),
        ];
        echo json_encode($counts, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)."\n";
        exit($counts['organizations'] === 10 && $counts['users'] === 50
            && $counts['tickets'] === 10 * $ticketsPerOrganization
            && $counts['messages'] >= 10 * ($ticketsPerOrganization + 2 * intdiv($ticketsPerOrganization, 10))
            && $counts['assignments'] >= 10 * intdiv($ticketsPerOrganization * 3, 4)
            && $counts['tags'] === 40 && $counts['notifications'] >= 10 * intdiv($ticketsPerOrganization, 10) ? 0 : 1);
    }

    $organizations = [];
    for ($number = 1; $number <= 10; $number++) {
        $organization = fixture($number, $prefix);
        $ticketCount = DB::table('tickets')->where('organization_id', $organization->id)->count();
        if ($ticketCount < $ticketsPerOrganization) {
            throw new RuntimeException("{$organization->slug} has only {$ticketCount} Tickets.");
        }
        $tokens = [];
        for ($userNumber = 1; $userNumber <= 5; $userNumber++) {
            $user = User::where('email', "{$organization->slug}-user-{$userNumber}@example.test")->firstOrFail();
            $accessToken = $user->createToken('phase4-workload');
            $tokens[] = $accessToken->plainTextToken;
            $issuedTokenIds[] = $accessToken->accessToken->id;
        }
        $organizations[] = ['slug' => $organization->slug, 'id' => $organization->id,
            'tokens' => $tokens,
            'ticket_ids' => DB::table('tickets')->where('organization_id', $organization->id)
                ->whereRaw('ticket_number % 4 <> 0')->orderBy('ticket_number')->limit(300)->pluck('id')->all()];
    }

    $samples = [];
    $errors = [];
    $multi = curl_multi_init();
    $inFlight = [];
    $start = hrtime(true);
    $planned = 5 * $seconds;
    $requestNumber = 0;
    $completed = 0;
    $maxScheduleLagMs = 0;
    while ($completed < $planned) {
        while ($requestNumber < $planned && $start + $requestNumber * 200000000 <= hrtime(true)) {
            $due = $start + $requestNumber * 200000000;
            $maxScheduleLagMs = max($maxScheduleLagMs, (hrtime(true) - $due) / 1e6);
            $organization = $organizations[intdiv($requestNumber, 10) % 10];
            $ticketId = $organization['ticket_ids'][intdiv($requestNumber, 10) % count($organization['ticket_ids'])];
            $kind = $requestNumber % 10;
            [$endpoint, $method, $path, $body] = match ($kind) {
                0, 5 => ['tickets.list', 'GET', '/api/tickets?per_page=20', null],
                1, 6 => ['tickets.detail', 'GET', '/api/tickets/'.$ticketId, null],
                2, 7 => ['notifications', 'GET', '/api/notifications?mode=recent', null],
                3, 8 => ['tags', 'GET', '/api/tags', null],
                4 => ['replies', 'POST', '/api/tickets/'.$ticketId.'/messages',
                    ['message_type' => 'public_reply', 'body' => 'Workload reply '.$requestNumber]],
                9 => ['priority', 'PATCH', '/api/tickets/'.$ticketId.'/priority',
                    ['priority' => intdiv($requestNumber, 10) % 2 === 0 ? 'high' : 'medium']],
            };
            $token = $organization['tokens'][intdiv($requestNumber, 100) % 5];
            $handle = requestHandle($method, $organization['slug'], $path, $token, $body);
            $inFlight[spl_object_id($handle)] = [$handle, $endpoint];
            curl_multi_add_handle($multi, $handle);
            $requestNumber++;
        }
        curl_multi_exec($multi, $running);
        while ($completedRequest = curl_multi_info_read($multi)) {
            $handle = $completedRequest['handle'];
            $key = spl_object_id($handle);
            $endpoint = $inFlight[$key][1];
            $status = curl_getinfo($handle, CURLINFO_HTTP_CODE);
            $milliseconds = curl_getinfo($handle, CURLINFO_TOTAL_TIME) * 1000;
            $samples[$endpoint][] = $milliseconds;
            if ($status < 200 || $status >= 300) {
                $errors[$endpoint][$status] = ($errors[$endpoint][$status] ?? 0) + 1;
            }
            curl_multi_remove_handle($multi, $handle);
            curl_close($handle);
            unset($inFlight[$key]);
            $completed++;
            if ($completed % 300 === 0) {
                fwrite(STDERR, "Completed {$completed}/{$planned} requests\n");
            }
        }
        if ($completed < $planned) {
            $untilNext = $requestNumber < $planned
                ? max(0, ($start + $requestNumber * 200000000 - hrtime(true)) / 1e9)
                : 0.02;
            if ($running > 0) {
                curl_multi_select($multi, min(0.02, $untilNext ?: 0.02));
            } else {
                usleep((int) (min(0.02, $untilNext) * 1e6));
            }
        }
    }
    curl_multi_close($multi);

    $report = ['seconds' => (hrtime(true) - $start) / 1e9, 'planned_requests' => $planned,
        'target_rps' => 5, 'achieved_rps' => $planned / ((hrtime(true) - $start) / 1e9),
        'max_schedule_lag_ms' => $maxScheduleLagMs,
        'organizations' => 10, 'active_users' => 50,
        'tickets_per_organization' => $ticketsPerOrganization,
        'cache_store' => config('cache.default'),
        'reads' => 4 * $seconds, 'writes' => $seconds, 'endpoints' => [], 'errors' => $errors];
    foreach ($samples as $endpoint => $latencies) {
        $report['endpoints'][$endpoint] = summarize($latencies);
    }
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)."\n";
    $failed = $errors !== [] || $report['achieved_rps'] < 4.9;
    foreach ($report['endpoints'] as $endpoint => $summary) {
        $failed = $failed || $summary['p95_ms'] >= (in_array($endpoint, ['replies', 'priority'], true) ? 1000 : 500);
    }
    DB::table('personal_access_tokens')->whereIn('id', $issuedTokenIds)->delete();
    exit($failed ? 1 : 0);
} catch (Throwable $error) {
    if ($issuedTokenIds !== []) {
        DB::table('personal_access_tokens')->whereIn('id', $issuedTokenIds)->delete();
    }
    fwrite(STDERR, $error->getMessage()."\n");
    exit(1);
}
