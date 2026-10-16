<?php

use App\Context\OrganizationContext;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Services\AuditLogWriter;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $this->organization->id, 'name' => 'Private Customer', 'email' => 'secret@example.test']);
    $this->user = User::create(['name' => 'Private Agent', 'email' => 'agent@example.test', 'password' => bcrypt('password')]);
    $this->member = OrganizationMember::create(['organization_id' => $this->organization->id, 'user_id' => $this->user->id, 'role' => 'agent']);
    $this->ticket = Ticket::create(['organization_id' => $this->organization->id, 'customer_id' => $customer->id, 'subject' => 'Private subject']);
    $this->priorityUrl = "http://acme.localhost/api/tickets/{$this->ticket->id}/priority";
    $this->auditUrl = 'http://acme.localhost/api/audit-logs';
    Sanctum::actingAs($this->user);
});

afterEach(fn () => OrganizationContext::clear());

test('a successful Priority change has one attributable metadata-only audit record', function () {
    $this->patchJson($this->priorityUrl.'?token=private', ['priority' => 'high', 'expected_priority_revision' => 1, 'secret' => 'private'])
        ->assertOk()->assertJsonPath('data.priority', 'high');

    $log = AuditLog::sole();
    expect($log->organization_id)->toBe($this->organization->id)
        ->and($log->classification)->toBe('business')
        ->and($log->action)->toBe('ticket.priority_changed')
        ->and($log->outcome)->toBe('success')
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->user->id)
        ->and($log->target_type)->toBe('ticket')
        ->and($log->target_id)->toBe($this->ticket->id)
        ->and($log->changes['priority']['old'])->toBe('medium')
        ->and($log->changes['priority']['new'])->toBe('high')
        ->and($log->occurred_at)->not->toBeNull();
    expect(json_encode($log->getAttributes()))->not->toContain('Private', 'secret@example.test', 'agent@example.test', 'token=private');

    $this->patchJson($this->priorityUrl, ['priority' => 'high'])->assertOk();
    $this->patchJson($this->priorityUrl, ['priority' => 'urgent', 'expected_priority_revision' => 1])->assertStatus(409);
    expect(AuditLog::count())->toBe(1);
});

test('a required audit failure rolls back the Priority and its revision', function () {
    $writer = Mockery::mock(AuditLogWriter::class);
    $writer->shouldReceive('recordPriorityChange')->once()->andThrow(new RuntimeException('audit unavailable'));
    $this->app->instance(AuditLogWriter::class, $writer);

    $this->patchJson($this->priorityUrl, ['priority' => 'high'])->assertStatus(500);

    expect($this->ticket->fresh()->priority->value)->toBe('medium')
        ->and($this->ticket->fresh()->priority_revision)->toBe(1)
        ->and(AuditLog::count())->toBe(0);
});

test('only an Organization Admin can read filtered cursor-paginated history', function () {
    $this->patchJson($this->priorityUrl, ['priority' => 'high'])->assertOk();
    $this->patchJson($this->priorityUrl, ['priority' => 'urgent'])->assertOk();

    $this->getJson($this->auditUrl)->assertForbidden();
    $this->member->update(['role' => 'admin']);

    $first = $this->getJson($this->auditUrl.'?per_page=1')->assertOk()
        ->assertJsonCount(1, 'data')->json();
    expect($first['next_cursor'])->not->toBeNull();
    $second = $this->getJson($this->auditUrl.'?per_page=1&cursor='.urlencode($first['next_cursor']))
        ->assertOk()->assertJsonCount(1, 'data')->json();
    expect($second['data'][0]['id'])->not->toBe($first['data'][0]['id']);

    $this->getJson($this->auditUrl.'?action=ticket.priority_changed&actor_id='.$this->user->id.'&target_type=ticket&target_id='.$this->ticket->id.'&outcome=success&from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString())
        ->assertOk()->assertJsonCount(2, 'data');
    $this->getJson($this->auditUrl.'?actor_id=999999')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->auditUrl.'?outcome=failure')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->auditUrl.'?action=unrelated')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->auditUrl.'?target_id='.Str::uuid())->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->auditUrl.'?from='.now()->addDay()->toDateString())->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->auditUrl.'?per_page=101')->assertUnprocessable();
});

test('history is isolated by Organization and preserves deleted identifiers', function () {
    $this->patchJson($this->priorityUrl, ['priority' => 'high'])->assertOk();
    $this->member->update(['role' => 'admin']);
    $id = $this->ticket->id;
    $this->ticket->forceDelete();
    $this->getJson($this->auditUrl)->assertOk()->assertJsonPath('data.0.target_id', $id);

    $other = Organization::create(['name' => 'Other', 'slug' => 'other']);
    OrganizationMember::create(['organization_id' => $other->id, 'user_id' => $this->user->id, 'role' => 'admin']);
    $this->getJson('http://other.localhost/api/audit-logs')->assertOk()->assertJsonCount(0, 'data');
    $this->postJson($this->auditUrl, ['action' => 'forged'])->assertStatus(405);
});

test('global security records stay outside Organization Admin history and customer tokens cannot read it', function () {
    DB::table('audit_logs')->insert([
        'id' => (string) Str::uuid(),
        'occurred_at' => now(),
        'classification' => 'security',
        'action' => 'auth.login',
        'outcome' => 'success',
        'organization_id' => null,
    ]);
    $this->member->update(['role' => 'admin']);
    $this->getJson($this->auditUrl)->assertOk()->assertJsonCount(0, 'data');

    $token = app(CustomerTokenService::class)->generateToken($this->ticket->customer, $this->ticket);
    $this->app['auth']->forgetGuards();
    $this->getJson($this->auditUrl.'?token='.urlencode($token))->assertUnauthorized();
});
