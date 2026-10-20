<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Services\AuditLogWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-10-20 12:00:00');

    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->otherOrganization = Organization::create(['name' => 'Other', 'slug' => 'other']);
    $admin = User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password')]);
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $admin->id,
        'role' => Role::ADMIN->value,
    ]);
    OrganizationMember::create([
        'organization_id' => $this->otherOrganization->id,
        'user_id' => $admin->id,
        'role' => Role::ADMIN->value,
    ]);
    Sanctum::actingAs($admin);
});

afterEach(function () {
    Carbon::setTestNow();
    OrganizationContext::clear();
});

function auditRetentionRecord(?int $organizationId, string $classification, Carbon $occurredAt, ?string $ip = '192.0.2.10'): string
{
    $id = (string) Str::uuid();
    DB::table('audit_logs')->insert([
        'id' => $id,
        'occurred_at' => $occurredAt,
        'classification' => $classification,
        'action' => 'test.event',
        'outcome' => 'success',
        'organization_id' => $organizationId,
        'actor_type' => 'user',
        'actor_id' => 'historical-user',
        'target_type' => 'ticket',
        'target_id' => 'deleted-ticket',
        'changes' => json_encode(['status' => 'open']),
        'ip_address' => $ip,
    ]);

    return $id;
}

function visibleAuditRecords($test): array
{
    return collect($test->getJson('http://acme.localhost/api/audit-logs?per_page=100')->assertOk()->json('data'))
        ->keyBy('id')->all();
}

test('retention uses exact classification and IP boundaries while preserving surviving history', function () {
    $businessExpired = auditRetentionRecord($this->organization->id, 'business', now()->subYear()->subSecond());
    $businessBoundary = auditRetentionRecord($this->organization->id, 'business', now()->subYear());
    $securityExpired = auditRetentionRecord($this->organization->id, 'security', now()->subDays(90)->subSecond());
    $securityBoundary = auditRetentionRecord($this->organization->id, 'security', now()->subDays(90));
    $ipExpired = auditRetentionRecord($this->organization->id, 'business', now()->subDays(30)->subSecond());
    $ipBoundary = auditRetentionRecord($this->organization->id, 'business', now()->subDays(30));
    $new = auditRetentionRecord($this->organization->id, 'business', now()->subDays(1));
    $other = auditRetentionRecord($this->otherOrganization->id, 'business', now()->subDays(31));
    $global = auditRetentionRecord(null, 'security', now()->subDays(31));
    $globalExpired = auditRetentionRecord(null, 'security', now()->subDays(90)->subSecond());

    $this->artisan('audit:clean')->assertSuccessful();

    $records = visibleAuditRecords($this);
    expect($records)->not->toHaveKeys([$businessExpired, $securityExpired, $other, $global]);
    expect($records)->toHaveKeys([$businessBoundary, $securityBoundary, $ipExpired, $ipBoundary, $new]);
    expect($records[$businessBoundary]['ip_address'])->toBeNull()
        ->and($records[$securityBoundary]['ip_address'])->toBeNull()
        ->and($records[$ipExpired]['ip_address'])->toBeNull()
        ->and($records[$ipBoundary]['ip_address'])->toBe('192.0.2.10')
        ->and($records[$new]['ip_address'])->toBe('192.0.2.10')
        ->and($records[$ipExpired]['target_id'])->toBe('deleted-ticket')
        ->and($records[$ipExpired]['changes'])->toBe(['status' => 'open']);

    Artisan::call('security:audit', ['id' => $global]);
    expect(Artisan::output())->toContain($global)->not->toContain('192.0.2.10');
    expect(Artisan::call('security:audit', ['id' => $globalExpired]))->toBe(1);
    $otherRecords = collect($this->getJson('http://other.localhost/api/audit-logs?per_page=100')->assertOk()->json('data'))
        ->keyBy('id')->all();
    expect($otherRecords[$other]['ip_address'])->toBeNull();

    $this->artisan('audit:clean')->assertSuccessful();
    expect(visibleAuditRecords($this))->toHaveKeys([$businessBoundary, $securityBoundary, $ipExpired, $ipBoundary, $new]);
});

test('a bounded partial cleanup resumes safely on the next run', function () {
    $old = collect(range(1, 3))->map(fn () => auditRetentionRecord($this->organization->id, 'business', now()->subYears(2)))->all();
    $survivor = auditRetentionRecord($this->organization->id, 'business', now()->subDays(35));

    $this->artisan('audit:clean', ['--batch-size' => 1, '--max-batches' => 1])->assertSuccessful();
    expect(array_intersect($old, array_keys(visibleAuditRecords($this))))->toHaveCount(2);

    $this->artisan('audit:clean', ['--batch-size' => 1])->assertSuccessful();
    $records = visibleAuditRecords($this);
    expect($records)->toHaveKey($survivor)->not->toHaveKeys($old);
    expect($records[$survivor]['ip_address'])->toBeNull();
});

test('audit metadata cannot retain a second copy of an IP address', function () {
    app(AuditLogWriter::class)->recordAction(
        organizationId: $this->organization->id,
        actor: null,
        action: 'test.event',
        changes: [
            'status' => 'open',
            'ip_address' => '192.0.2.10',
            'nested' => ['client_ip' => '192.0.2.11'],
            'note' => 'Remote 192.0.2.12 and 2001:db8::1; remote:198.51.100.12; ipv6:2001:db8::2',
        ],
        requestLocation: '/api/tickets',
        targetType: 'ticket',
        targetId: 'historical-ticket'
    );

    $record = collect(visibleAuditRecords($this))->first();
    expect($record['changes'])->toEqual([
        'status' => 'open',
        'nested' => [],
        'note' => 'Remote [REDACTED_IP] and [REDACTED_IP]; remote:[REDACTED_IP]; ipv6:[REDACTED_IP]',
    ]);
});
