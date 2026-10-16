<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->customer = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Confidential Customer',
        'email' => 'customer_secret@example.test',
    ]);
    $this->agentUser = User::create([
        'name' => 'Agent Secret',
        'email' => 'agent_secret@example.test',
        'password' => bcrypt('password'),
    ]);
    $this->agentMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->agentUser->id,
        'role' => Role::AGENT->value,
    ]);
    $this->adminUser = User::create([
        'name' => 'Admin User',
        'email' => 'admin_secret@example.test',
        'password' => bcrypt('password'),
    ]);
    $this->adminMember = OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->adminUser->id,
        'role' => Role::ADMIN->value,
    ]);
    $this->team = Team::create([
        'organization_id' => $this->organization->id,
        'name' => 'Support Team',
    ]);
    $this->team->members()->attach($this->agentMember->id);

    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Confidential subject',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::MEDIUM,
    ]);

    $this->auditUrl = 'http://acme.localhost/api/audit-logs';
    Storage::fake('private');
});

afterEach(fn () => OrganizationContext::clear());

function enableAuditInsertFailure(): void
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

function disableAuditInsertFailure(): void
{
    DB::unprepared('DROP TRIGGER IF EXISTS reject_audit_insert ON audit_logs;');
    DB::unprepared('DROP FUNCTION IF EXISTS reject_audit_insert;');
}

test('ticket creation via customer intake creates audit record and rolls back on failure', function () {
    $file = UploadedFile::fake()->create('financial_secret.pdf', 100, 'application/pdf');

    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Secret Customer',
        'email' => 'secret_portal@example.test',
        'subject' => 'Secret Intake Subject',
        'message' => 'Secret Customer message body with credentials',
        'attachments' => [$file],
    ]);

    $response->assertStatus(201);
    $ticketId = $response->json('ticket.id');

    $log = AuditLog::where('action', 'ticket.created')->sole();
    expect($log->organization_id)->toBe($this->organization->id)
        ->and($log->classification)->toBe('business')
        ->and($log->action)->toBe('ticket.created')
        ->and($log->outcome)->toBe('success')
        ->and($log->actor_type)->toBe('customer')
        ->and($log->actor_id)->toBe((string) $response->json('customer.id'))
        ->and($log->target_type)->toBe('ticket')
        ->and($log->target_id)->toBe($ticketId)
        ->and($log->changes['status'])->toBe('new')
        ->and($log->changes['priority'])->toBe('medium')
        ->and($log->changes['ticket_number'])->toBe($response->json('ticket.ticket_number'));

    $attributesJson = json_encode($log->getAttributes());
    expect($attributesJson)->not->toContain(
        'Secret Customer',
        'secret_portal@example.test',
        'Secret Intake Subject',
        'credentials',
        'financial_secret.pdf'
    );

    // Rollback test
    enableAuditInsertFailure();
    $failFile = UploadedFile::fake()->create('rollback_secret.pdf', 100, 'application/pdf');
    $initialTicketCount = Ticket::count();

    $failResponse = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Rollback Customer',
        'email' => 'rollback@example.test',
        'subject' => 'Rollback Subject',
        'message' => 'Rollback Body',
        'attachments' => [$failFile],
    ]);
    $failResponse->assertStatus(500);

    expect(Ticket::count())->toBe($initialTicketCount);
    // Ensure uploaded file was cleaned up
    $disk = Storage::disk(config('filesystems.attachments_disk', 'private'));
    expect($disk->allFiles())->toHaveCount(1); // Only the first file remains

    disableAuditInsertFailure();
});

test('public reply and internal note create audit records without copying bodies, and roll back on failure', function () {
    Sanctum::actingAs($this->agentUser);

    // 1. Agent Public Reply
    $file = UploadedFile::fake()->create('reply_secret.pdf', 50, 'application/pdf');
    $replyRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Secret reply body content with confidential information',
        'attachments' => [$file],
    ]);
    $replyRes->assertStatus(201);
    $replyId = $replyRes->json('data.id');

    $replyLog = AuditLog::where('action', 'ticket.public_reply_created')->sole();
    expect($replyLog->organization_id)->toBe($this->organization->id)
        ->and($replyLog->classification)->toBe('business')
        ->and($replyLog->actor_type)->toBe('user')
        ->and($replyLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($replyLog->target_type)->toBe('ticket')
        ->and($replyLog->target_id)->toBe($this->ticket->id)
        ->and($replyLog->changes['message_id'])->toBe($replyId)
        ->and($replyLog->changes['message_type'])->toBe('public_reply');

    $replyLogJson = json_encode($replyLog->getAttributes());
    expect($replyLogJson)->not->toContain('Secret reply body content', 'confidential information', 'reply_secret.pdf');

    // 2. Agent Internal Note
    $noteRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Super private internal staff note credentials',
    ]);
    $noteRes->assertStatus(201);
    $noteId = $noteRes->json('data.id');

    $noteLog = AuditLog::where('action', 'ticket.internal_note_created')->sole();
    expect($noteLog->organization_id)->toBe($this->organization->id)
        ->and($noteLog->actor_type)->toBe('user')
        ->and($noteLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($noteLog->target_type)->toBe('ticket')
        ->and($noteLog->target_id)->toBe($this->ticket->id)
        ->and($noteLog->changes['message_id'])->toBe($noteId)
        ->and($noteLog->changes['message_type'])->toBe('internal_note');

    $noteLogJson = json_encode($noteLog->getAttributes());
    expect($noteLogJson)->not->toContain('Super private internal staff note credentials');

    // 3. Customer Public Reply via Portal
    $token = app(CustomerTokenService::class)->generateToken($this->customer, $this->ticket);
    $this->app['auth']->forgetGuards();

    $custReplyRes = $this->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply?token=".urlencode($token), [
        'message' => 'Customer reply message text with secret info',
    ]);
    $custReplyRes->assertStatus(201);
    $custReplyId = $custReplyRes->json('reply.id');

    $custLog = AuditLog::where('action', 'ticket.public_reply_created')
        ->where('actor_type', 'customer')
        ->sole();
    expect($custLog->actor_id)->toBe((string) $this->customer->id)
        ->and($custLog->changes['message_id'])->toBe($custReplyId);

    // 4. Rollback test for message creation
    Sanctum::actingAs($this->agentUser);
    enableAuditInsertFailure();
    $initialMessageCount = TicketMessage::count();

    $failMsg = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Should fail to persist',
    ]);
    $failMsg->assertStatus(500);
    expect(TicketMessage::count())->toBe($initialMessageCount);

    disableAuditInsertFailure();
});

test('separate attachment upload records audit log without filename and rolls back storage on failure', function () {
    Sanctum::actingAs($this->agentUser);

    $message = TicketMessage::create([
        'organization_id' => $this->organization->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => 'public_reply',
        'author_type' => OrganizationMember::class,
        'author_id' => $this->agentMember->id,
        'body' => 'Message for attachment',
    ]);

    $file = UploadedFile::fake()->create('private_records_filename.pdf', 80, 'application/pdf');

    $res = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages/{$message->id}/attachments", [
        'file' => $file,
    ]);
    $res->assertStatus(201);
    $attachmentId = $res->json('data.id');

    $log = AuditLog::where('action', 'ticket.attachment_created')->sole();
    expect($log->organization_id)->toBe($this->organization->id)
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->agentUser->id)
        ->and($log->target_type)->toBe('ticket')
        ->and($log->target_id)->toBe($this->ticket->id)
        ->and($log->changes['attachment_id'])->toBe($attachmentId)
        ->and($log->changes['message_id'])->toBe($message->id)
        ->and($log->changes['mime_type'])->toBe('application/pdf')
        ->and($log->changes['file_size'])->toBe(80 * 1024);

    $logJson = json_encode($log->getAttributes());
    expect($logJson)->not->toContain('private_records_filename.pdf');

    // Rollback test: failure deletes uploaded file and does not persist attachment row
    enableAuditInsertFailure();
    $disk = Storage::disk(config('filesystems.attachments_disk', 'private'));
    $initialDiskFileCount = count($disk->allFiles());
    $initialAttachmentCount = TicketAttachment::count();

    $failFile = UploadedFile::fake()->create('should_rollback.pdf', 80, 'application/pdf');
    $failRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/messages/{$message->id}/attachments", [
        'file' => $failFile,
    ]);
    $failRes->assertStatus(500);

    expect(TicketAttachment::count())->toBe($initialAttachmentCount)
        ->and(count($disk->allFiles()))->toBe($initialDiskFileCount);

    disableAuditInsertFailure();
});

test('assignment and claim record audit logs, preserve revision conflicts, and roll back on failure', function () {
    Sanctum::actingAs($this->agentUser);

    // 1. Assign ticket
    $assignRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/assign", [
        'team_id' => $this->team->id,
        'member_id' => $this->agentMember->id,
        'expected_assignment_revision' => 1,
    ]);
    $assignRes->assertStatus(200);

    $assignLog = AuditLog::where('action', 'ticket.assigned')->sole();
    expect($assignLog->organization_id)->toBe($this->organization->id)
        ->and($assignLog->actor_type)->toBe('user')
        ->and($assignLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($assignLog->target_type)->toBe('ticket')
        ->and($assignLog->target_id)->toBe($this->ticket->id)
        ->and($assignLog->changes['team_id']['new'])->toBe($this->team->id)
        ->and($assignLog->changes['member_id']['new'])->toBe($this->agentMember->id);

    // Distinct immutable assignment history in ticket_assignments table
    expect(TicketAssignment::count())->toBe(1);

    // Conflict returns 409 and does not add an audit record
    $conflictRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/assign", [
        'team_id' => null,
        'member_id' => null,
        'expected_assignment_revision' => 1,
    ]);
    $conflictRes->assertStatus(409);
    expect(AuditLog::where('action', 'ticket.assigned')->count())->toBe(1);

    // Unassign ticket
    $unassignRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/assign", [
        'team_id' => null,
        'member_id' => null,
    ]);
    $unassignRes->assertStatus(200);

    $unassignLog = AuditLog::where('action', 'ticket.assigned')->whereNull('changes->team_id->new')->first();
    expect($unassignLog)->not->toBeNull()
        ->and($unassignLog->changes['team_id']['new'])->toBeNull()
        ->and($unassignLog->changes['member_id']['new'])->toBeNull();

    // 2. Claim ticket
    $newTicket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Claimable ticket',
        'status' => TicketStatus::NEW,
    ]);

    $claimRes = $this->postJson("http://acme.localhost/api/tickets/{$newTicket->id}/claim");
    $claimRes->assertStatus(200);

    $claimLog = AuditLog::where('action', 'ticket.claimed')->sole();
    expect($claimLog->organization_id)->toBe($this->organization->id)
        ->and($claimLog->actor_type)->toBe('user')
        ->and($claimLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($claimLog->target_type)->toBe('ticket')
        ->and($claimLog->target_id)->toBe($newTicket->id)
        ->and($claimLog->changes['member_id']['new'])->toBe($this->agentMember->id);

    // 3. Rollback test for assignment
    enableAuditInsertFailure();
    $currentAssignmentCount = TicketAssignment::count();
    $initialAssignLogCount = AuditLog::where('action', 'ticket.assigned')->count();

    $failAssign = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/assign", [
        'team_id' => $this->team->id,
        'member_id' => $this->agentMember->id,
    ]);
    $failAssign->assertStatus(500);

    expect(TicketAssignment::count())->toBe($currentAssignmentCount)
        ->and(AuditLog::where('action', 'ticket.assigned')->count())->toBe($initialAssignLogCount);

    disableAuditInsertFailure();
});

test('status updates record audit logs, preserve revision conflicts, and roll back on failure', function () {
    Sanctum::actingAs($this->agentUser);

    $res = $this->patchJson("http://acme.localhost/api/tickets/{$this->ticket->id}/status", [
        'status' => 'pending',
        'expected_status_revision' => 1,
    ]);
    $res->assertStatus(200);

    $log = AuditLog::where('action', 'ticket.status_changed')->sole();
    expect($log->organization_id)->toBe($this->organization->id)
        ->and($log->actor_type)->toBe('user')
        ->and($log->actor_id)->toBe((string) $this->agentUser->id)
        ->and($log->target_type)->toBe('ticket')
        ->and($log->target_id)->toBe($this->ticket->id)
        ->and($log->changes['status']['old'])->toBe('open')
        ->and($log->changes['status']['new'])->toBe('pending');

    // Conflict returns 409 and does not add an audit record
    $conflictRes = $this->patchJson("http://acme.localhost/api/tickets/{$this->ticket->id}/status", [
        'status' => 'resolved',
        'expected_status_revision' => 1,
    ]);
    $conflictRes->assertStatus(409);
    expect(AuditLog::where('action', 'ticket.status_changed')->count())->toBe(1);

    // Rollback test
    enableAuditInsertFailure();
    $failRes = $this->patchJson("http://acme.localhost/api/tickets/{$this->ticket->id}/status", [
        'status' => 'resolved',
    ]);
    $failRes->assertStatus(500);

    expect($this->ticket->fresh()->status->value)->toBe('pending')
        ->and(AuditLog::where('action', 'ticket.status_changed')->count())->toBe(1);

    disableAuditInsertFailure();
});

test('tag attach and detach record audit logs and roll back on failure', function () {
    Sanctum::actingAs($this->agentUser);

    $tag = Tag::create([
        'organization_id' => $this->organization->id,
        'name' => 'Billing Secret',
        'slug' => 'billing-secret',
    ]);

    // Attach tag
    $attachRes = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags", [
        'tag_id' => $tag->id,
    ]);
    $attachRes->assertStatus(200);

    $attachLog = AuditLog::where('action', 'ticket.tag_attached')->sole();
    expect($attachLog->organization_id)->toBe($this->organization->id)
        ->and($attachLog->actor_type)->toBe('user')
        ->and($attachLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($attachLog->target_type)->toBe('ticket')
        ->and($attachLog->target_id)->toBe($this->ticket->id)
        ->and($attachLog->changes['tag_id'])->toBe($tag->id);

    // Detach tag
    $detachRes = $this->deleteJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags/{$tag->id}");
    $detachRes->assertStatus(200);

    $detachLog = AuditLog::where('action', 'ticket.tag_detached')->sole();
    expect($detachLog->organization_id)->toBe($this->organization->id)
        ->and($detachLog->actor_type)->toBe('user')
        ->and($detachLog->actor_id)->toBe((string) $this->agentUser->id)
        ->and($detachLog->target_type)->toBe('ticket')
        ->and($detachLog->target_id)->toBe($this->ticket->id)
        ->and($detachLog->changes['tag_id'])->toBe($tag->id);

    // Idempotent re-detach of already detached tag does not create duplicate audit log
    $this->deleteJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags/{$tag->id}")->assertStatus(200);
    expect(AuditLog::where('action', 'ticket.tag_detached')->count())->toBe(1);

    // Re-attach tag then idempotent re-attach does not create duplicate audit log
    $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags", ['tag_id' => $tag->id])->assertStatus(200);
    expect(AuditLog::where('action', 'ticket.tag_attached')->count())->toBe(2);
    $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags", ['tag_id' => $tag->id])->assertStatus(200);
    expect(AuditLog::where('action', 'ticket.tag_attached')->count())->toBe(2);
    $this->deleteJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags/{$tag->id}")->assertStatus(200);

    // Rollback test
    enableAuditInsertFailure();
    $failAttach = $this->postJson("http://acme.localhost/api/tickets/{$this->ticket->id}/tags", [
        'tag_id' => $tag->id,
    ]);
    $failAttach->assertStatus(500);

    expect($this->ticket->fresh()->tags)->toHaveCount(0);

    disableAuditInsertFailure();
});

test('soft delete and restore record audit logs, retain target id after deletion, and roll back on failure', function () {
    Sanctum::actingAs($this->adminUser);

    $ticketId = $this->ticket->id;

    // Delete ticket
    $delRes = $this->deleteJson("http://acme.localhost/api/tickets/{$ticketId}");
    $delRes->assertStatus(200);

    $delLog = AuditLog::where('action', 'ticket.deleted')->sole();
    expect($delLog->organization_id)->toBe($this->organization->id)
        ->and($delLog->actor_type)->toBe('user')
        ->and($delLog->actor_id)->toBe((string) $this->adminUser->id)
        ->and($delLog->target_type)->toBe('ticket')
        ->and($delLog->target_id)->toBe($ticketId)
        ->and($delLog->changes['deleted'])->toBeTrue();

    // Even if force deleted, the historical identifier is retained
    expect($this->ticket->fresh()->trashed())->toBeTrue();

    // Restore ticket
    $restoreRes = $this->postJson("http://acme.localhost/api/tickets/{$ticketId}/restore");
    $restoreRes->assertStatus(200);

    $restoreLog = AuditLog::where('action', 'ticket.restored')->sole();
    expect($restoreLog->organization_id)->toBe($this->organization->id)
        ->and($restoreLog->target_id)->toBe($ticketId)
        ->and($restoreLog->changes['restored'])->toBeTrue();

    // Rollback test
    enableAuditInsertFailure();
    $failDel = $this->deleteJson("http://acme.localhost/api/tickets/{$ticketId}");
    $failDel->assertStatus(500);

    expect($this->ticket->fresh()->trashed())->toBeFalse();

    disableAuditInsertFailure();
});

test('ordinary reads, notification read markers, presence, and live channels do not generate audit logs', function () {
    Sanctum::actingAs($this->agentUser);

    $initialCount = AuditLog::count();

    // Reads
    $this->getJson('http://acme.localhost/api/tickets')->assertStatus(200);
    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}")->assertStatus(200);

    // Live channels
    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}/live-channel")->assertStatus(200);
    $this->getJson("http://acme.localhost/api/tickets/{$this->ticket->id}/viewing-channel")->assertStatus(200);
    $this->getJson('http://acme.localhost/api/live/presence-channel')->assertStatus(200);
    $this->getJson('http://acme.localhost/api/live/notification-channel')->assertStatus(200);

    // Notification reads
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertStatus(200);

    expect(AuditLog::count())->toBe($initialCount);
});

test('only an Organization Admin can read the audit log feed for remaining ticket actions', function () {
    Sanctum::actingAs($this->agentUser);
    $this->patchJson("http://acme.localhost/api/tickets/{$this->ticket->id}/status", [
        'status' => 'pending',
    ])->assertStatus(200);

    // Non-admin agent is forbidden from reading the audit log feed
    $this->getJson($this->auditUrl)->assertForbidden();

    // Organization Admin can read and filter the audit log feed over HTTP
    Sanctum::actingAs($this->adminUser);
    $adminRes = $this->getJson($this->auditUrl.'?action=ticket.status_changed&target_id='.$this->ticket->id);
    $adminRes->assertOk();
    $adminRes->assertJsonFragment(['action' => 'ticket.status_changed', 'target_id' => $this->ticket->id]);

    // Cross-tenant access is rejected
    $otherOrg = Organization::create(['name' => 'Other Org', 'slug' => 'other-org']);
    $this->getJson('http://other-org.localhost/api/audit-logs')->assertForbidden();
});
