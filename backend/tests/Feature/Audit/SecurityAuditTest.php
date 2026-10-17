<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\AttachmentService;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->organization = Organization::create([
        'name' => 'Acme Corp',
        'slug' => 'acme',
    ]);

    $this->adminUser = User::create([
        'name' => 'Admin Boss',
        'email' => 'admin_secret@acme.test',
        'password' => Hash::make('admin_pass_123'),
    ]);

    $this->adminMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->adminUser->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->agentUser = User::create([
        'name' => 'Agent Worker',
        'email' => 'agent_secret@acme.test',
        'password' => Hash::make('agent_pass_123'),
    ]);

    $this->agentMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->agentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->customer = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Customer Joe',
        'email' => 'joe_secret@customer.test',
    ]);

    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Confidential inquiry',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::MEDIUM,
    ]);

    $this->auditUrl = 'http://acme.localhost/api/audit-logs';
    Storage::fake('private');
});

afterEach(function () {
    disableSecurityAuditInsertFailure();
    OrganizationContext::clear();
});

function enableSecurityAuditInsertFailure(): void
{
    DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION reject_security_audit_insert() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit storage unavailable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reject_security_audit_insert ON audit_logs;
CREATE TRIGGER reject_security_audit_insert BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_security_audit_insert();
SQL);
}

function disableSecurityAuditInsertFailure(): void
{
    DB::unprepared('DROP TRIGGER IF EXISTS reject_security_audit_insert ON audit_logs;');
    DB::unprepared('DROP FUNCTION IF EXISTS reject_security_audit_insert;');
}

test('registration records security audit and rolls back when audit fails', function () {
    $response = $this->postJson('http://localhost/api/register', [
        'name' => 'New User',
        'email' => 'newuser_secret@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(201);
    $userId = $response->json('user.id');
    $token = $response->json('token');
    expect($token)->not->toBeEmpty();

    $regLog = AuditLog::where('action', 'auth.register')->sole();
    expect($regLog->classification)->toBe('security')
        ->and($regLog->outcome)->toBe('success')
        ->and($regLog->organization_id)->toBeNull()
        ->and($regLog->actor_type)->toBe('user')
        ->and($regLog->actor_id)->toBe((string) $userId)
        ->and($regLog->target_type)->toBe('user')
        ->and($regLog->target_id)->toBe((string) $userId);

    // Verify token issuance was audited
    $credLog = AuditLog::where('action', 'credential.issued')
        ->where('target_id', (string) $userId)
        ->sole();
    expect($credLog->classification)->toBe('security')
        ->and($credLog->outcome)->toBe('success')
        ->and($credLog->organization_id)->toBeNull();

    // Sensitive data not in audit logs
    $jsonAttrs = json_encode($regLog->getAttributes()).json_encode($credLog->getAttributes());
    expect($jsonAttrs)->not->toContain('newuser_secret@example.test')
        ->and($jsonAttrs)->not->toContain('password123')
        ->and($jsonAttrs)->not->toContain($token);

    // Rollback test: when audit fails, user creation and token issuance roll back
    enableSecurityAuditInsertFailure();
    $userCount = User::count();
    $tokenCount = PersonalAccessToken::count();

    $failRes = $this->postJson('http://localhost/api/register', [
        'name' => 'Failed User',
        'email' => 'failed_secret@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);
    $failRes->assertStatus(500);

    expect(User::count())->toBe($userCount)
        ->and(PersonalAccessToken::count())->toBe($tokenCount);
    disableSecurityAuditInsertFailure();
});

test('login success audits authentication and rolls back on audit failure', function () {
    $response = $this->postJson('http://localhost/api/login', [
        'email' => 'admin_secret@acme.test',
        'password' => 'admin_pass_123',
    ]);

    $response->assertStatus(200);
    $token = $response->json('token');
    expect($token)->not->toBeEmpty();

    $log = AuditLog::where('action', 'auth.login')->where('outcome', 'success')->sole();
    expect($log->classification)->toBe('security')
        ->and($log->organization_id)->toBeNull()
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->adminUser->id)
        ->and($log->target_type)->toBe('user')
        ->and($log->target_id)->toBe((string) $this->adminUser->id);

    // Credential issuance also audited
    $credLog = AuditLog::where('action', 'credential.issued')
        ->where('target_id', (string) $this->adminUser->id)
        ->sole();
    expect($credLog->classification)->toBe('security')
        ->and($credLog->outcome)->toBe('success');

    // Rollback test: when audit fails, login does not return a token and rolls back
    enableSecurityAuditInsertFailure();
    $initialTokens = PersonalAccessToken::count();

    $failRes = $this->postJson('http://localhost/api/login', [
        'email' => 'admin_secret@acme.test',
        'password' => 'admin_pass_123',
    ]);
    $failRes->assertStatus(500);

    expect(PersonalAccessToken::count())->toBe($initialTokens);
    disableSecurityAuditInsertFailure();
});

test('login denial audits failure with truthful unresolved actor and preserves 422 when audit fails', function () {
    // 1. Bad password for existing user
    $failRes = $this->postJson('http://localhost/api/login', [
        'email' => 'admin_secret@acme.test',
        'password' => 'wrong_pass',
    ]);
    $failRes->assertStatus(422);

    $denialLog = AuditLog::where('action', 'auth.login')->where('outcome', 'denied')->first();
    expect($denialLog)->not->toBeNull()
        ->and($denialLog->classification)->toBe('security')
        ->and($denialLog->outcome)->toBe('denied')
        ->and($denialLog->actor_type)->toBe('unresolved')
        ->and($denialLog->actor_id)->toBeNull()
        ->and($denialLog->organization_id)->toBeNull();

    $denialJson = json_encode($denialLog->getAttributes());
    expect($denialJson)->not->toContain('admin_secret@acme.test')
        ->and($denialJson)->not->toContain('wrong_pass');

    // 2. Unknown email
    $this->postJson('http://localhost/api/login', [
        'email' => 'nonexistent_attacker@evil.test',
        'password' => 'any_pass',
    ])->assertStatus(422);

    // 3. When audit storage fails, denial remains denied (422) with sanitized contract
    enableSecurityAuditInsertFailure();
    $deniedUnderFailure = $this->postJson('http://localhost/api/login', [
        'email' => 'admin_secret@acme.test',
        'password' => 'wrong_pass',
    ]);
    $deniedUnderFailure->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
    disableSecurityAuditInsertFailure();
});

test('logout audits session termination and rolls back on audit failure', function () {
    Sanctum::actingAs($this->agentUser);
    $tokenModel = $this->agentUser->createToken('test_token');
    $this->withToken($tokenModel->plainTextToken);

    $response = $this->postJson('http://localhost/api/logout');
    $response->assertStatus(200);

    $log = AuditLog::where('action', 'auth.logout')->sole();
    expect($log->classification)->toBe('security')
        ->and($log->outcome)->toBe('success')
        ->and($log->organization_id)->toBeNull()
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->agentUser->id);

    // Rollback test: when audit fails, token deletion rolls back
    $newToken = $this->agentUser->createToken('rollback_token');
    $this->withToken($newToken->plainTextToken);

    enableSecurityAuditInsertFailure();
    $failRes = $this->postJson('http://localhost/api/logout');
    $failRes->assertStatus(500);

    expect(PersonalAccessToken::where('id', $newToken->accessToken->id)->exists())->toBeTrue();
    disableSecurityAuditInsertFailure();
});

test('customer ticket intake audits credential issuance and rolls back on failure', function () {
    $res = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Intake Secret User',
        'email' => 'intake_secret@acme.test',
        'subject' => 'Secret Intake Subject',
        'message' => 'Secret message body',
    ]);
    $res->assertStatus(201);
    $token = $res->json('token');
    expect($token)->not->toBeEmpty();

    $credLog = AuditLog::where('action', 'credential.issued')
        ->where('target_type', 'customer')
        ->sole();
    expect($credLog->classification)->toBe('security')
        ->and($credLog->outcome)->toBe('success')
        ->and($credLog->organization_id)->toBe($this->organization->id);

    $attrs = json_encode($credLog->getAttributes());
    expect($attrs)->not->toContain('intake_secret@acme.test')
        ->and($attrs)->not->toContain('Intake Secret User')
        ->and($attrs)->not->toContain($token);

    // Rollback test
    enableSecurityAuditInsertFailure();
    $initialTickets = Ticket::count();

    $failRes = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Rollback Customer',
        'email' => 'rollback@acme.test',
        'subject' => 'Rollback Subject',
        'message' => 'Rollback message',
    ]);
    $failRes->assertStatus(500);

    expect(Ticket::count())->toBe($initialTickets);
    disableSecurityAuditInsertFailure();
});

test('customer magic link audits credential issuance and denial remains 404 on audit failure', function () {
    $res = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'joe_secret@customer.test',
    ]);
    $res->assertStatus(200);
    $token = $res->json('token');
    expect($token)->not->toBeEmpty();

    $credLog = AuditLog::where('action', 'credential.issued')
        ->where('target_type', 'customer')
        ->where('target_id', (string) $this->customer->id)
        ->sole();
    expect($credLog->classification)->toBe('security')
        ->and($credLog->outcome)->toBe('success')
        ->and($credLog->organization_id)->toBe($this->organization->id);

    $attrs = json_encode($credLog->getAttributes());
    expect($attrs)->not->toContain('joe_secret@customer.test')
        ->and($attrs)->not->toContain($token);

    // Rollback test for magic link
    enableSecurityAuditInsertFailure();
    $failRes = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'joe_secret@customer.test',
    ]);
    $failRes->assertStatus(500);
    disableSecurityAuditInsertFailure();

    // Unknown customer denial audit
    $denialRes = $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'unknown@customer.test',
    ]);
    $denialRes->assertStatus(404);

    $denialLog = AuditLog::where('action', 'customer.access_denied')->first();
    expect($denialLog)->not->toBeNull()
        ->and($denialLog->outcome)->toBe('denied')
        ->and($denialLog->organization_id)->toBe($this->organization->id);

    // When audit storage fails, denial remains 404
    enableSecurityAuditInsertFailure();
    $this->postJson('http://acme.localhost/api/portal/magic-link', [
        'email' => 'unknown@customer.test',
    ])->assertStatus(404);
    disableSecurityAuditInsertFailure();
});

test('invitation acceptance credential issuance is audited and rolls back on failure', function () {
    $invitation = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'invited_secret@acme.test',
        'role' => Role::AGENT->value,
        'token' => 'safe_test_invitation_token_12345',
        'expires_at' => now()->addDays(7),
    ]);

    $res = $this->postJson("http://acme.localhost/api/invitations/{$invitation->token}/accept", [
        'name' => 'Invited Person',
        'password' => 'secret_pass_123',
        'password_confirmation' => 'secret_pass_123',
    ]);
    $res->assertStatus(201);
    $token = $res->json('token');
    $userId = $res->json('user.id');
    expect($token)->not->toBeEmpty();

    $credLog = AuditLog::where('action', 'credential.issued')
        ->where('target_id', (string) $userId)
        ->sole();
    expect($credLog->classification)->toBe('security')
        ->and($credLog->outcome)->toBe('success')
        ->and($credLog->organization_id)->toBe($this->organization->id);

    // Rollback test
    $rollbackInv = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'rollback_inv@acme.test',
        'role' => Role::AGENT->value,
        'token' => 'rollback_test_invitation_token_12345',
        'expires_at' => now()->addDays(7),
    ]);

    enableSecurityAuditInsertFailure();
    $userCount = User::count();
    $memberCount = OrganizationMember::count();

    $failRes = $this->postJson("http://acme.localhost/api/invitations/{$rollbackInv->token}/accept", [
        'name' => 'Rollback Person',
        'password' => 'secret_pass_123',
        'password_confirmation' => 'secret_pass_123',
    ]);
    $failRes->assertStatus(500);

    expect(User::count())->toBe($userCount)
        ->and(OrganizationMember::count())->toBe($memberCount);
    disableSecurityAuditInsertFailure();
});

test('membership access denial is audited and remains 403 on audit failure', function () {
    $otherUser = User::create([
        'name' => 'Outsider User',
        'email' => 'outsider@other.test',
        'password' => Hash::make('password'),
    ]);
    Sanctum::actingAs($otherUser);

    $res = $this->getJson('http://acme.localhost/api/tickets');
    $res->assertStatus(403);

    $log = AuditLog::where('action', 'membership.denied')->sole();
    expect($log->classification)->toBe('security')
        ->and($log->outcome)->toBe('denied')
        ->and($log->organization_id)->toBeNull()
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $otherUser->id)
        ->and($log->target_type)->toBe('organization')
        ->and($log->target_id)->toBe((string) $this->organization->id);

    // Under audit failure, denial remains 403
    enableSecurityAuditInsertFailure();
    $this->getJson('http://acme.localhost/api/tickets')
        ->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);
    disableSecurityAuditInsertFailure();
});

test('role access denial is audited and remains 403 on audit failure', function () {
    Sanctum::actingAs($this->agentUser);

    // Non-admin agent attempting to access Admin-only audit log feed
    $res = $this->getJson($this->auditUrl);
    $res->assertStatus(403);

    $log = AuditLog::where('action', 'role.denied')->first();
    expect($log)->not->toBeNull()
        ->and($log->classification)->toBe('security')
        ->and($log->outcome)->toBe('denied')
        ->and($log->organization_id)->toBe($this->organization->id)
        ->and($log->actor_id)->toBe((string) $this->agentUser->id);

    // Under audit failure, denial remains 403
    enableSecurityAuditInsertFailure();
    $this->getJson($this->auditUrl)->assertStatus(403);
    disableSecurityAuditInsertFailure();
});

test('customer token access denials are audited and remain 401/403 on audit failure', function () {
    // 1. Missing customer token
    $res = $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}");
    $res->assertStatus(401);

    $missingLog = AuditLog::where('action', 'customer.token_denied')->first();
    expect($missingLog)->not->toBeNull()
        ->and($missingLog->outcome)->toBe('denied')
        ->and($missingLog->actor_type)->toBe('unresolved')
        ->and($missingLog->actor_id)->toBeNull();

    // 2. Tampered token
    $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}?token=invalid.tampered.token")
        ->assertStatus(401);

    // 3. Expired token
    $tokenService = app(CustomerTokenService::class);
    $expiredToken = $tokenService->generateToken($this->customer, $this->ticket, -100);
    $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}?token={$expiredToken}")
        ->assertStatus(401);

    // 4. Cross-organization customer token
    $otherOrg = Organization::create(['name' => 'Beta Corp', 'slug' => 'beta']);
    $otherCustomer = Customer::create(['organization_id' => $otherOrg->id, 'name' => 'Beta Cust', 'email' => 'beta@customer.test']);
    $crossToken = $tokenService->generateToken($otherCustomer);

    $crossRes = $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}?token={$crossToken}");
    $crossRes->assertStatus(403);

    // 5. Audit failure keeps denial intact
    enableSecurityAuditInsertFailure();
    $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}")
        ->assertStatus(401);
    $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}?token={$crossToken}")
        ->assertStatus(403);
    disableSecurityAuditInsertFailure();
});

test('attachment access denial is audited and remains 403 on audit failure', function () {
    $file = UploadedFile::fake()->create('confidential.pdf', 100, 'application/pdf');
    $service = app(AttachmentService::class);
    $message = TicketMessage::create([
        'organization_id' => $this->organization->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => 'public_reply',
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Message body',
    ]);
    $attachment = $service->store($file, $message);

    $otherUser = User::create([
        'name' => 'Outsider Agent',
        'email' => 'outsider_agent@other.test',
        'password' => Hash::make('password'),
    ]);

    // AttachmentService::download rejects outsider with 403 HttpException
    try {
        $service->download($attachment, $otherUser);
        $this->fail('Expected HttpException 403');
    } catch (HttpException $e) {
        expect($e->getStatusCode())->toBe(403);
    }

    $log = AuditLog::where('action', 'attachment.access_denied')->sole();
    expect($log->classification)->toBe('security')
        ->and($log->outcome)->toBe('denied')
        ->and($log->organization_id)->toBe($this->organization->id)
        ->and($log->actor_id)->toBe((string) $otherUser->id)
        ->and($log->target_type)->toBe('attachment')
        ->and($log->target_id)->toBe((string) $attachment->id);

    // Under audit failure, denial remains 403
    enableSecurityAuditInsertFailure();
    try {
        $service->download($attachment, $otherUser);
        $this->fail('Expected HttpException 403');
    } catch (HttpException $e) {
        expect($e->getStatusCode())->toBe(403);
    }
    disableSecurityAuditInsertFailure();
});

test('channel access denial is audited and remains 403 on audit failure', function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();

    $otherUser = User::create([
        'name' => 'Outsider 3',
        'email' => 'outsider3@test.test',
        'password' => Hash::make('password'),
    ]);
    Sanctum::actingAs($otherUser);

    // Channel belonging to Acme
    $generation = intdiv(now()->timestamp, 300);
    $channelName = "private-organization.{$this->organization->id}.{$generation}";

    $res = $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'channel_name' => $channelName,
        'socket_id' => '1234.5678',
    ]);
    $res->assertStatus(403);

    $log = AuditLog::where('action', 'channel.access_denied')->first();
    expect($log)->not->toBeNull()
        ->and($log->classification)->toBe('security')
        ->and($log->outcome)->toBe('denied')
        ->and($log->organization_id)->toBeNull()
        ->and($log->actor_id)->toBe((string) $otherUser->id)
        ->and($log->target_type)->toBe('channel');

    // Customer channel denial
    $custRes = $this->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/broadcasting/auth", [
        'channel_name' => "private-customer.ticket.{$this->ticket->id}.{$generation}",
        'socket_id' => '1234.5678',
    ]);
    $custRes->assertStatus(401); // without customer token

    // Under audit failure, denial remains 403
    enableSecurityAuditInsertFailure();
    $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'channel_name' => $channelName,
        'socket_id' => '1234.5678',
    ])->assertStatus(403);
    disableSecurityAuditInsertFailure();
});

test('global security events are unavailable to organization admin feeds and verified context determines ownership', function () {
    // 1. Global login event (organization_id = null)
    $loginRes = $this->postJson('http://localhost/api/login', [
        'email' => 'admin_secret@acme.test',
        'password' => 'admin_pass_123',
    ]);
    $loginRes->assertStatus(200);

    $globalLog = AuditLog::where('action', 'auth.login')->sole();
    expect($globalLog->organization_id)->toBeNull();

    // 2. Organization Admin queries their organization feed
    Sanctum::actingAs($this->adminUser);
    $feedRes = $this->getJson($this->auditUrl)->assertOk();
    $items = collect($feedRes->json('data'));

    // Global login must NOT be visible in organization admin feed
    expect($items->contains('action', 'auth.login'))->toBeFalse();
    foreach ($items as $item) {
        expect($item['organization_id'])->toBe($this->organization->id);
    }
});

test('operator-only CLI inspection provides safe identifiers, filters, and bounded pagination', function () {
    // Seed some security events
    $this->postJson('http://localhost/api/register', [
        'name' => 'Operator Inspect User',
        'email' => 'inspect_secret@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ])->assertStatus(201);

    $this->postJson('http://localhost/api/login', [
        'email' => 'inspect_secret@example.test',
        'password' => 'wrong_pass',
    ])->assertStatus(422);

    // Run CLI inspection listing
    Artisan::call('security:audit', ['--limit' => 10]);
    $output = Artisan::output();

    expect($output)->toContain('Security Audit Records')
        ->and($output)->toContain('auth.register')
        ->and($output)->toContain('auth.login');

    // Verify privacy in CLI output: no passwords or emails
    expect($output)->not->toContain('inspect_secret@example.test')
        ->and($output)->not->toContain('password123')
        ->and($output)->not->toContain('wrong_pass');

    // Inspect single record
    $regLog = AuditLog::where('action', 'auth.register')->first();
    Artisan::call('security:audit', ['id' => $regLog->id]);
    $singleOutput = Artisan::output();

    expect($singleOutput)->toContain($regLog->id)
        ->and($singleOutput)->toContain('auth.register')
        ->and($singleOutput)->not->toContain('inspect_secret@example.test');

    // Filter by outcome
    Artisan::call('security:audit', ['--outcome' => 'denied']);
    $deniedOutput = Artisan::output();
    expect($deniedOutput)->toContain('denied')
        ->and($deniedOutput)->not->toContain('auth.register');

    // Filter by action
    Artisan::call('security:audit', ['--action' => 'auth.register']);
    $regOutput = Artisan::output();
    expect($regOutput)->toContain('auth.register');

    // Alias audit:security works identically
    Artisan::call('audit:security', ['--limit' => 5]);
    expect(Artisan::output())->toContain('Security Audit Records');
});

test('privacy and redaction ensure sensitive metadata is never retained or exposed', function () {
    // Request with query params containing token and headers
    $token = 'secret_test_token_abcdef123456';
    $this->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}?token={$token}&signature=secret_sig")
        ->assertStatus(401);

    $log = AuditLog::where('action', 'customer.token_denied')->first();
    expect($log)->not->toBeNull();

    $logJson = json_encode($log->getAttributes());
    expect($logJson)->not->toContain($token)
        ->and($logJson)->not->toContain('secret_sig')
        ->and($logJson)->not->toContain('token=')
        ->and($log->request_location)->not->toContain('token=');
});
