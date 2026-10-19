<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function memberMessageFixture(): Ticket
{
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    Sanctum::actingAs($user);

    return Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Retryable reply']);
}

test('member message requires a high entropy request key', function () {
    $ticket = memberMessageFixture();

    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'public_reply', 'body' => 'Hello',
    ])->assertUnprocessable();
    $this->withHeader('Idempotency-Key', 'short-key')->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'public_reply', 'body' => 'Hello',
    ])->assertUnprocessable();

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(0);
});

test('a repeated member reply returns the original response without repeating business effects', function () {
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = ['message_type' => 'public_reply', 'body' => 'Hello', 'target_status' => 'open'];

    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();
    $counts = [
        DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
        DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
        DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
        DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
    ];

    $second = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();

    $stored = DB::table('request_idempotency')->sole();
    expect($second->getContent())->toBe($first->getContent())
        ->and($stored->key_hash)->toBe(hash('sha256', $key))
        ->and($stored->encrypted_response)->not->toContain('Hello')
        ->and([
            DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
            DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
            DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
            DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
        ])->toBe($counts);

    $this->withHeader('Idempotency-Key', $key)->postJson($url, [
        'message_type' => 'public_reply', 'body' => 'Changed', 'target_status' => 'open',
    ])->assertConflict();
});

test('file content, filename, message kind, and requested status are part of the retry operation', function () {
    Storage::fake('private');
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = fn (string $contents, string $name = 'note.txt', string $kind = 'internal_note', string $status = 'open') => [
        'message_type' => $kind,
        'body' => 'Same body',
        'target_status' => $status,
        'attachments' => [UploadedFile::fake()->createWithContent($name, $contents)],
    ];

    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload('first bytes'))->assertCreated();
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload('first bytes'))->assertCreated()
        ->assertJsonPath('data.id', $first->json('data.id'));
    expect(DB::table('ticket_attachments')->count())->toBe(1)
        ->and(Storage::disk('private')->allFiles())->toHaveCount(1);

    foreach ([$payload('different bytes'), $payload('first bytes', 'renamed.txt'), $payload('first bytes', 'note.txt', 'public_reply'), $payload('first bytes', 'note.txt', 'internal_note', 'resolved')] as $changed) {
        $this->withHeader('Idempotency-Key', $key)->postJson($url, $changed)->assertConflict();
    }

    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
        ->and(DB::table('ticket_attachments')->count())->toBe(1)
        ->and(Storage::disk('private')->allFiles())->toHaveCount(1);
});

test('a Public Reply status override is saved once and a changed override conflicts', function () {
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = ['message_type' => 'public_reply', 'body' => 'Please wait', 'target_status' => 'pending'];

    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated()
        ->assertJsonPath('ticket.status', 'pending');
    $revision = $ticket->fresh()->revision;
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated()
        ->assertJsonPath('data.id', $first->json('data.id'))
        ->assertJsonPath('ticket.status', 'pending');
    $this->withHeader('Idempotency-Key', $key)->postJson($url, [
        'message_type' => 'public_reply', 'body' => 'Please wait', 'target_status' => 'open',
    ])->assertConflict();

    expect($ticket->fresh()->revision)->toBe($revision)
        ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
});

test('the result remains available for 24 hours after a slow mutation finishes', function () {
    $ticket = memberMessageFixture();
    $started = Carbon::parse('2026-10-19 00:00:00');
    Carbon::setTestNow($started);
    TicketMessage::creating(function () use ($started) {
        Carbon::setTestNow($started->copy()->addHours(2));
    });

    try {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
                'message_type' => 'internal_note', 'body' => 'Slow message',
            ])->assertCreated();

        $expires = Carbon::parse(DB::table('request_idempotency')->sole()->expires_at);
        expect(now()->diffInHours($expires))->toBe(24.0);
    } finally {
        Carbon::setTestNow();
    }
});

test('expired results are replaced and removed by scheduled maintenance', function () {
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = ['message_type' => 'internal_note', 'body' => 'Note'];

    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();
    DB::table('request_idempotency')->update(['expires_at' => now()->subSecond()]);
    $second = $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();
    expect($second->json('data.id'))->not->toBe($first->json('data.id'));

    DB::table('request_idempotency')->update(['expires_at' => now()->subSecond()]);
    $this->artisan('idempotency:clean')->assertExitCode(0);
    expect(DB::table('request_idempotency')->count())->toBe(0);
});

test('the same key is independent for another actor or target Ticket', function () {
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $payload = ['message_type' => 'internal_note', 'body' => 'Scoped note'];
    $first = $this->withHeader('Idempotency-Key', $key)
        ->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", $payload)->assertCreated();

    $anotherTicket = Ticket::create([
        'organization_id' => $ticket->organization_id,
        'customer_id' => $ticket->customer_id,
        'subject' => 'Another target',
    ]);
    $second = $this->withHeader('Idempotency-Key', $key)
        ->postJson("http://acme.localhost/api/tickets/{$anotherTicket->id}/messages", $payload)->assertCreated();

    $anotherUser = User::create(['name' => 'Another Agent', 'email' => 'another@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $ticket->organization_id, 'user_id' => $anotherUser->id, 'role' => 'agent']);
    Sanctum::actingAs($anotherUser);
    $third = $this->withHeader('Idempotency-Key', $key)
        ->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", $payload)->assertCreated();

    expect($first->json('data.id'))->not->toBe($second->json('data.id'))
        ->and($first->json('data.id'))->not->toBe($third->json('data.id'))
        ->and($second->json('data.id'))->not->toBe($third->json('data.id'))
        ->and(DB::table('request_idempotency')->count())->toBe(3);
});

test('a replay requires current member access and target availability', function () {
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = ['message_type' => 'internal_note', 'body' => 'Note'];
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();

    OrganizationMember::where('organization_id', $ticket->organization_id)->delete();
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertForbidden();

    OrganizationMember::create(['organization_id' => $ticket->organization_id, 'user_id' => auth()->id(), 'role' => 'agent']);
    $ticket->delete();
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertNotFound();
});

test('failed audit persistence rolls back the key, message, outbox, and uploaded file', function () {
    Storage::fake('private');
    $ticket = memberMessageFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = fn () => [
        'message_type' => 'internal_note',
        'body' => 'Audit must persist',
        'attachments' => [UploadedFile::fake()->createWithContent('proof.txt', 'file bytes')],
    ];

    DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION reject_idempotent_message_audit() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit storage unavailable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER reject_idempotent_message_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_idempotent_message_audit();
SQL);

    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload())->assertStatus(500);
    expect(DB::table('request_idempotency')->count())->toBe(0)
        ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(0)
        ->and(DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count())->toBe(0)
        ->and(Storage::disk('private')->allFiles())->toBe([]);

    DB::unprepared('DROP TRIGGER reject_idempotent_message_audit ON audit_logs; DROP FUNCTION reject_idempotent_message_audit;');
    $this->withHeader('Idempotency-Key', $key)->postJson($url, $payload())->assertCreated();
});
