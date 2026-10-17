<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

if (! function_exists('enableAdminAuditInsertFailure')) {
    function enableAdminAuditInsertFailure(): void
    {
        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION reject_audit_insert() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit storage unavailable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reject_audit_insert ON audit_logs;
CREATE TRIGGER reject_audit_insert BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_insert();
SQL);
    }
}

if (! function_exists('disableAdminAuditInsertFailure')) {
    function disableAdminAuditInsertFailure(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS reject_audit_insert ON audit_logs;');
        DB::unprepared('DROP FUNCTION IF EXISTS reject_audit_insert;');
    }
}

beforeEach(function () {
    $this->organization = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->adminUser = User::create([
        'name' => 'Acme Admin',
        'email' => 'admin_secret@acme.test',
        'password' => Hash::make('secret_password_123'),
    ]);

    $this->adminMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->adminUser->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->agentUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent_secret@acme.test',
        'password' => Hash::make('secret_password_456'),
    ]);

    $this->agentMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->agentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->auditUrl = 'http://acme.localhost/api/audit-logs';
});

afterEach(function () {
    disableAdminAuditInsertFailure();
    OrganizationContext::clear();
});

test('organization creation records audit log and rolls back on failure', function () {
    $newUser = User::create([
        'name' => 'Founder User',
        'email' => 'founder_secret@newcorp.test',
        'password' => Hash::make('founder_password_789'),
    ]);
    Sanctum::actingAs($newUser);

    $response = $this->postJson('http://localhost/api/organizations', [
        'name' => 'NewCorp Secret Enterprise',
        'slug' => 'newcorp-enterprise',
    ]);

    $response->assertStatus(201);
    $orgId = $response->json('organization.id');

    $log = AuditLog::where('action', 'organization.created')->sole();
    expect($log->organization_id)->toBe($orgId)
        ->and($log->classification)->toBe('business')
        ->and($log->action)->toBe('organization.created')
        ->and($log->outcome)->toBe('success')
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $newUser->id)
        ->and($log->target_type)->toBe('organization')
        ->and($log->target_id)->toBe((string) $orgId)
        ->and($log->changes['organization_id'])->toBe($orgId);

    // Verify sensitive data is not copied into audit log
    $logJson = json_encode($log->getAttributes());
    expect($logJson)->not->toContain('NewCorp Secret Enterprise')
        ->and($logJson)->not->toContain('founder_secret@newcorp.test')
        ->and($logJson)->not->toContain('founder_password_789');

    // Rollback test: failure during audit writing rolls back the organization and member creation
    enableAdminAuditInsertFailure();
    $initialOrgCount = Organization::count();
    $initialMemberCount = OrganizationMember::count();

    $failResponse = $this->postJson('http://localhost/api/organizations', [
        'name' => 'Rollback Org',
        'slug' => 'rollback-org',
    ]);
    $failResponse->assertStatus(500);

    expect(Organization::count())->toBe($initialOrgCount)
        ->and(OrganizationMember::count())->toBe($initialMemberCount);
    disableAdminAuditInsertFailure();
});

test('team creation, update, and deletion record audit logs, preserve identifiers, and roll back on failure', function () {
    Sanctum::actingAs($this->adminUser);

    // 1. Team creation
    $teamRes = $this->postJson('http://acme.localhost/api/teams', [
        'name' => 'Secret Operations Team',
        'description' => 'Classified team description with secret details',
    ]);
    $teamRes->assertStatus(201);
    $teamId = $teamRes->json('team.id');

    $createLog = AuditLog::where('action', 'team.created')->sole();
    expect($createLog->organization_id)->toBe($this->organization->id)
        ->and($createLog->classification)->toBe('business')
        ->and($createLog->action)->toBe('team.created')
        ->and($createLog->outcome)->toBe('success')
        ->and($createLog->actor_type)->toBe('user')
        ->and($createLog->actor_id)->toBe((string) $this->adminUser->id)
        ->and($createLog->target_type)->toBe('team')
        ->and($createLog->target_id)->toBe((string) $teamId)
        ->and($createLog->changes['team_id'])->toBe($teamId);

    $createLogJson = json_encode($createLog->getAttributes());
    expect($createLogJson)->not->toContain('Secret Operations Team')
        ->and($createLogJson)->not->toContain('Classified team description');

    // Rollback on team creation
    enableAdminAuditInsertFailure();
    $failCreate = $this->postJson('http://acme.localhost/api/teams', [
        'name' => 'Rollback Team',
        'description' => 'Should roll back',
    ]);
    $failCreate->assertStatus(500);
    expect(Team::where('name', 'Rollback Team')->exists())->toBeFalse();
    disableAdminAuditInsertFailure();

    // 2. Team update
    $updateRes = $this->putJson("http://acme.localhost/api/teams/{$teamId}", [
        'name' => 'Updated Operations Team',
        'description' => 'Updated classified description',
    ]);
    $updateRes->assertStatus(200);

    $updateLog = AuditLog::where('action', 'team.updated')->sole();
    expect($updateLog->organization_id)->toBe($this->organization->id)
        ->and($updateLog->actor_id)->toBe((string) $this->adminUser->id)
        ->and($updateLog->target_type)->toBe('team')
        ->and($updateLog->target_id)->toBe((string) $teamId)
        ->and($updateLog->changes['team_id'])->toBe($teamId);

    $updateLogJson = json_encode($updateLog->getAttributes());
    expect($updateLogJson)->not->toContain('Updated Operations Team')
        ->and($updateLogJson)->not->toContain('Updated classified description');

    // Rollback on team update
    enableAdminAuditInsertFailure();
    $failUpdate = $this->putJson("http://acme.localhost/api/teams/{$teamId}", [
        'name' => 'Failing Update Team',
    ]);
    $failUpdate->assertStatus(500);
    expect(Team::find($teamId)->name)->toBe('Updated Operations Team');
    disableAdminAuditInsertFailure();

    // 3. Team deletion
    $deleteRes = $this->deleteJson("http://acme.localhost/api/teams/{$teamId}");
    $deleteRes->assertStatus(200);

    $deleteLog = AuditLog::where('action', 'team.deleted')->sole();
    expect($deleteLog->organization_id)->toBe($this->organization->id)
        ->and($deleteLog->target_type)->toBe('team')
        ->and($deleteLog->target_id)->toBe((string) $teamId)
        ->and($deleteLog->changes['team_id'])->toBe($teamId);

    // Preserved in Admin feed even after record deletion
    expect(Team::find($teamId))->toBeNull();
    $feedRes = $this->getJson($this->auditUrl.'?target_type=team&target_id='.$teamId);
    $feedRes->assertOk()->assertJsonCount(3, 'data'); // created, updated, deleted
});

test('team membership changes record audit logs and roll back on failure', function () {
    Sanctum::actingAs($this->adminUser);

    $team = Team::create([
        'organization_id' => $this->organization->id,
        'name' => 'Support Core Team',
    ]);

    // 1. Add member to team
    $addRes = $this->postJson("http://acme.localhost/api/teams/{$team->id}/members", [
        'organization_member_id' => $this->agentMember->id,
    ]);
    $addRes->assertStatus(201);

    $addLog = AuditLog::where('action', 'team.member_added')->sole();
    expect($addLog->organization_id)->toBe($this->organization->id)
        ->and($addLog->target_type)->toBe('team')
        ->and($addLog->target_id)->toBe((string) $team->id)
        ->and($addLog->actor_id)->toBe((string) $this->adminUser->id)
        ->and($addLog->changes['team_id'])->toBe($team->id)
        ->and($addLog->changes['member_id'])->toBe($this->agentMember->id)
        ->and($addLog->changes['user_id'])->toBe($this->agentUser->id);

    $addLogJson = json_encode($addLog->getAttributes());
    expect($addLogJson)->not->toContain('Acme Agent')
        ->and($addLogJson)->not->toContain('agent_secret@acme.test');

    // Rollback on member add
    enableAdminAuditInsertFailure();
    $anotherUser = User::create([
        'name' => 'Another Agent',
        'email' => 'another@acme.test',
        'password' => Hash::make('password'),
    ]);
    $anotherMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $anotherUser->id,
        'role' => Role::AGENT->value,
    ]);
    $failAdd = $this->postJson("http://acme.localhost/api/teams/{$team->id}/members", [
        'organization_member_id' => $anotherMember->id,
    ]);
    $failAdd->assertStatus(500);
    expect($team->members()->where('organization_members.id', $anotherMember->id)->exists())->toBeFalse();
    disableAdminAuditInsertFailure();

    // 2. Remove member from team
    $removeRes = $this->deleteJson("http://acme.localhost/api/teams/{$team->id}/members/{$this->agentMember->id}");
    $removeRes->assertStatus(200);

    $removeLog = AuditLog::where('action', 'team.member_removed')->sole();
    expect($removeLog->organization_id)->toBe($this->organization->id)
        ->and($removeLog->target_type)->toBe('team')
        ->and($removeLog->target_id)->toBe((string) $team->id)
        ->and($removeLog->changes['team_id'])->toBe($team->id)
        ->and($removeLog->changes['member_id'])->toBe($this->agentMember->id)
        ->and($removeLog->changes['user_id'])->toBe($this->agentUser->id);

    // Rollback on member remove
    $team->members()->attach($this->agentMember->id);
    enableAdminAuditInsertFailure();
    $failRemove = $this->deleteJson("http://acme.localhost/api/teams/{$team->id}/members/{$this->agentMember->id}");
    $failRemove->assertStatus(500);
    expect($team->members()->where('organization_members.id', $this->agentMember->id)->exists())->toBeTrue();
    disableAdminAuditInsertFailure();
});

test('invitation creation, revocation, and acceptance record audit logs and roll back on failure', function () {
    Sanctum::actingAs($this->adminUser);

    // 1. Create invitation
    $invRes = $this->postJson('http://acme.localhost/api/invitations', [
        'email' => 'candidate_secret@example.test',
        'role' => 'agent',
    ]);
    $invRes->assertStatus(201);
    $invitationId = $invRes->json('invitation.id');
    $token = $invRes->json('invitation.token');

    $createLog = AuditLog::where('action', 'invitation.created')->sole();
    expect($createLog->organization_id)->toBe($this->organization->id)
        ->and($createLog->target_type)->toBe('invitation')
        ->and($createLog->target_id)->toBe((string) $invitationId)
        ->and($createLog->actor_id)->toBe((string) $this->adminUser->id)
        ->and($createLog->changes['invitation_id'])->toBe($invitationId)
        ->and($createLog->changes['role'])->toBe('agent');

    $createLogJson = json_encode($createLog->getAttributes());
    expect($createLogJson)->not->toContain('candidate_secret@example.test')
        ->and($createLogJson)->not->toContain($token);

    // Rollback on invitation creation
    enableAdminAuditInsertFailure();
    $failCreate = $this->postJson('http://acme.localhost/api/invitations', [
        'email' => 'rollback_candidate@example.test',
        'role' => 'agent',
    ]);
    $failCreate->assertStatus(500);
    expect(Invitation::where('email', 'rollback_candidate@example.test')->exists())->toBeFalse();
    disableAdminAuditInsertFailure();

    // 2. Revoke invitation
    $revokeRes = $this->deleteJson("http://acme.localhost/api/invitations/{$invitationId}");
    $revokeRes->assertStatus(200);

    $revokeLog = AuditLog::where('action', 'invitation.revoked')->sole();
    expect($revokeLog->organization_id)->toBe($this->organization->id)
        ->and($revokeLog->target_type)->toBe('invitation')
        ->and($revokeLog->target_id)->toBe((string) $invitationId)
        ->and($revokeLog->changes['invitation_id'])->toBe($invitationId)
        ->and($revokeLog->changes['revoked'])->toBeTrue();

    // Rollback on revocation
    $invitation2 = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'candidate2@example.test',
        'role' => Role::AGENT,
        'token' => 'token-candidate-2',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);
    enableAdminAuditInsertFailure();
    $failRevoke = $this->deleteJson("http://acme.localhost/api/invitations/{$invitation2->id}");
    $failRevoke->assertStatus(500);
    expect($invitation2->fresh()->revoked_at)->toBeNull();
    disableAdminAuditInsertFailure();

    // 3. Accept invitation - unauthenticated flow (new user registration)
    $invitation3 = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'newuser_candidate@example.test',
        'role' => Role::AGENT,
        'token' => 'token-candidate-3',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    // Switch to unauthenticated for accept
    $this->app['auth']->forgetGuards();

    $acceptRes = $this->postJson('/api/invitations/token-candidate-3/accept', [
        'name' => 'Alice Candidate Secret',
        'password' => 'super_secret_pw_999',
        'password_confirmation' => 'super_secret_pw_999',
    ]);
    $acceptRes->assertStatus(201);
    $newUserId = $acceptRes->json('user.id');

    $acceptLog = AuditLog::where('action', 'invitation.accepted')->sole();
    expect($acceptLog->organization_id)->toBe($this->organization->id)
        ->and($acceptLog->target_type)->toBe('invitation')
        ->and($acceptLog->target_id)->toBe((string) $invitation3->id)
        ->and($acceptLog->actor_id)->toBe((string) $newUserId)
        ->and($acceptLog->changes['invitation_id'])->toBe($invitation3->id)
        ->and($acceptLog->changes['user_id'])->toBe($newUserId)
        ->and($acceptLog->changes['role'])->toBe('agent');

    $acceptLogJson = json_encode($acceptLog->getAttributes());
    expect($acceptLogJson)->not->toContain('Alice Candidate Secret')
        ->and($acceptLogJson)->not->toContain('newuser_candidate@example.test')
        ->and($acceptLogJson)->not->toContain('super_secret_pw_999')
        ->and($acceptLogJson)->not->toContain('token-candidate-3');

    // Rollback on unauthenticated accept
    $invitation4 = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'rollback_user@example.test',
        'role' => Role::AGENT,
        'token' => 'token-candidate-4',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    enableAdminAuditInsertFailure();
    $failAccept = $this->postJson('/api/invitations/token-candidate-4/accept', [
        'name' => 'Rollback User',
        'password' => 'password12345',
        'password_confirmation' => 'password12345',
    ]);
    $failAccept->assertStatus(500);

    // Assert User, OrganizationMember, and invitation acceptance all rolled back
    expect(User::where('email', 'rollback_user@example.test')->exists())->toBeFalse()
        ->and($invitation4->fresh()->accepted_at)->toBeNull();
    disableAdminAuditInsertFailure();

    // 4. Accept invitation - authenticated flow (existing user)
    $existingUser = User::create([
        'name' => 'Bob Existing',
        'email' => 'bob_existing@example.test',
        'password' => Hash::make('password123'),
    ]);
    $invitation5 = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'bob_existing@example.test',
        'role' => Role::AGENT,
        'token' => 'token-candidate-5',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    Sanctum::actingAs($existingUser);
    $authAcceptRes = $this->postJson('/api/invitations/token-candidate-5/accept');
    $authAcceptRes->assertStatus(200);

    $authAcceptLog = AuditLog::where('action', 'invitation.accepted')->where('target_id', (string) $invitation5->id)->sole();
    expect($authAcceptLog->organization_id)->toBe($this->organization->id)
        ->and($authAcceptLog->actor_id)->toBe((string) $existingUser->id)
        ->and($authAcceptLog->changes['invitation_id'])->toBe($invitation5->id)
        ->and($authAcceptLog->changes['user_id'])->toBe($existingUser->id)
        ->and($authAcceptLog->changes['role'])->toBe('agent');

    // Rollback on authenticated accept
    $invitation6 = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'bob_existing@example.test',
        'role' => Role::ADMIN,
        'token' => 'token-candidate-6',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);
    // Temporarily remove existing membership to allow re-test of rollback
    OrganizationMember::where('user_id', $existingUser->id)->delete();

    enableAdminAuditInsertFailure();
    $failAuthAccept = $this->postJson('/api/invitations/token-candidate-6/accept');
    $failAuthAccept->assertStatus(500);
    expect(OrganizationMember::where('user_id', $existingUser->id)->exists())->toBeFalse()
        ->and($invitation6->fresh()->accepted_at)->toBeNull();
    disableAdminAuditInsertFailure();
});

test('invitation acceptance derives organization context when subdomain is absent and denies cross-organization acceptance', function () {
    // 1. Derives organization context when subdomain is absent (apex domain)
    $invitation = Invitation::create([
        'organization_id' => $this->organization->id,
        'email' => 'apex_user@example.test',
        'role' => Role::AGENT,
        'token' => 'apex-token-123',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    $res = $this->postJson('http://localhost/api/invitations/apex-token-123/accept', [
        'name' => 'Apex User',
        'password' => 'secret_password_123',
        'password_confirmation' => 'secret_password_123',
    ]);
    $res->assertStatus(201);

    $log = AuditLog::where('action', 'invitation.accepted')->where('target_id', (string) $invitation->id)->sole();
    expect($log->organization_id)->toBe($this->organization->id);

    // 2. Denies cross-organization invitation acceptance when attempted against a mismatched subdomain
    $otherOrg = Organization::create(['name' => 'Other Org', 'slug' => 'other-org']);
    $otherInv = Invitation::create([
        'organization_id' => $otherOrg->id,
        'email' => 'cross_target@example.test',
        'role' => Role::AGENT,
        'token' => 'other-token-456',
        'expires_at' => now()->addDays(7),
        'invited_by_user_id' => $this->adminUser->id,
    ]);

    // Access other-token-456 on acme's subdomain -> 404
    $crossRes = $this->postJson('http://acme.localhost/api/invitations/other-token-456/accept', [
        'name' => 'Cross User',
        'password' => 'secret_password_123',
        'password_confirmation' => 'secret_password_123',
    ]);
    $crossRes->assertStatus(404);
});

test('tag catalog creation records audit log and rolls back on failure', function () {
    Sanctum::actingAs($this->adminUser);

    $tagRes = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Confidential Urgent Bug',
        'slug' => 'confidential-urgent-bug',
    ]);
    $tagRes->assertStatus(201);
    $tagId = $tagRes->json('data.id');

    $log = AuditLog::where('action', 'tag.created')->sole();
    expect($log->organization_id)->toBe($this->organization->id)
        ->and($log->classification)->toBe('business')
        ->and($log->action)->toBe('tag.created')
        ->and($log->outcome)->toBe('success')
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->adminUser->id)
        ->and($log->target_type)->toBe('tag')
        ->and($log->target_id)->toBe((string) $tagId)
        ->and($log->changes['tag_id'])->toBe((string) $tagId);

    $logJson = json_encode($log->getAttributes());
    expect($logJson)->not->toContain('Confidential Urgent Bug')
        ->and($logJson)->not->toContain('confidential-urgent-bug');

    // Rollback test: failure rolls back tag creation
    enableAdminAuditInsertFailure();
    $failTag = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Rollback Tag',
        'slug' => 'rollback-tag',
    ]);
    $failTag->assertStatus(500);
    expect(Tag::where('slug', 'rollback-tag')->exists())->toBeFalse();
    disableAdminAuditInsertFailure();

    // Preserve identifier after referenced record is deleted
    Tag::find($tagId)->delete();
    $feedRes = $this->getJson($this->auditUrl.'?target_type=tag&target_id='.$tagId);
    $feedRes->assertOk()->assertJsonCount(1, 'data');
    expect($feedRes->json('data.0.target_id'))->toBe((string) $tagId);
});

test('administration audit logs are exposed only to organization admin and isolated across organizations', function () {
    // Generate some administration audit logs
    Sanctum::actingAs($this->adminUser);
    $this->postJson('http://acme.localhost/api/teams', ['name' => 'Admin Feed Team'])->assertStatus(201);
    $this->postJson('http://acme.localhost/api/tags', ['name' => 'Admin Feed Tag'])->assertStatus(201);

    // 1. Non-admin (agent) is forbidden from reading the audit log feed
    Sanctum::actingAs($this->agentUser);
    $this->getJson($this->auditUrl)->assertForbidden();

    // 2. Organization admin can read and filter the administration audit logs
    Sanctum::actingAs($this->adminUser);
    $adminRes = $this->getJson($this->auditUrl)->assertOk();
    expect(count($adminRes->json('data')))->toBeGreaterThanOrEqual(2);

    $teamRes = $this->getJson($this->auditUrl.'?target_type=team')->assertOk();
    expect($teamRes->json('data.0.target_type'))->toBe('team');

    $tagRes = $this->getJson($this->auditUrl.'?action=tag.created')->assertOk();
    expect($tagRes->json('data.0.action'))->toBe('tag.created');

    // 3. Admin of another organization cannot access Acme audit logs
    $otherOrg = Organization::create(['name' => 'Beta Corp', 'slug' => 'beta']);
    $otherAdmin = User::create([
        'name' => 'Beta Admin',
        'email' => 'admin@beta.test',
        'password' => Hash::make('password'),
    ]);
    OrganizationMember::create([
        'organization_id' => $otherOrg->id,
        'user_id' => $otherAdmin->id,
        'role' => Role::ADMIN->value,
    ]);

    Sanctum::actingAs($otherAdmin);
    // Request to Acme's endpoint with Beta admin is forbidden by membership check
    $this->getJson($this->auditUrl)->assertForbidden();

    // Request to Beta's own endpoint returns 0 items for Acme targets
    $betaRes = $this->getJson('http://beta.localhost/api/audit-logs')->assertOk();
    expect($betaRes->json('data'))->toBeEmpty();
});
