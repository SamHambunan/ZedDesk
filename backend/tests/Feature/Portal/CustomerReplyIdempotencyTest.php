<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function customerReplyIdempotencyFixture(): array
{
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Help', 'status' => 'pending']);
    $ticket->update(['assigned_member_id' => $member->id]);

    return [$organization, $customer, $ticket, app(CustomerTokenService::class)->generateToken($customer, $ticket)];
}

test('customer reply requires a high entropy key and identical retry returns the original result once', function () {
    [$organization, $customer, $ticket, $token] = customerReplyIdempotencyFixture();
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";
    $payload = ['message' => 'Please help'];

    $this->withHeader('X-Customer-Token', $token)->postJson($url, $payload)->assertUnprocessable();
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', 'short')->postJson($url, $payload)->assertUnprocessable();

    $key = (string) Str::uuid();
    $first = $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated()->assertJsonPath('ticket.status', 'open');
    $counts = [
        DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
        DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
        DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
        DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
    ];
    $replay = $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();

    expect($replay->getContent())->toBe($first->getContent())
        ->and($counts[0])->toBe(1)
        ->and([
            DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
            DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
            DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
            DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
        ])->toBe($counts);
    $record = DB::table('request_idempotency')->sole();
    expect($record->organization_id)->toBe($organization->id)
        ->and($record->actor_type)->toBe('customer')
        ->and($record->actor_id)->toBe($customer->id)
        ->and($record->operation)->toBe('customer.reply.create')
        ->and($record->target_id)->toBe($ticket->id)
        ->and($record->key_hash)->toBe(hash('sha256', $key))
        ->and($record->encrypted_response)->not->toContain('Please help');
});

test('multipart retries compare body aliases and file bytes before storing files', function () {
    Storage::fake('private');
    [, , $ticket, $token] = customerReplyIdempotencyFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";
    $headers = fn () => $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key);
    $payload = fn (string $bytes) => ['message' => 'File attached', 'attachments' => [UploadedFile::fake()->createWithContent('proof.txt', $bytes)]];

    $first = $headers()->post($url, $payload('first bytes'), ['Accept' => 'application/json'])->assertCreated();
    $replay = $headers()->post($url, ['body' => 'File attached', 'attachments' => [UploadedFile::fake()->createWithContent('proof.txt', 'first bytes')]], ['Accept' => 'application/json'])->assertCreated();
    expect($replay->getContent())->toBe($first->getContent())
        ->and(Storage::disk('private')->allFiles())->toHaveCount(1);

    $headers()->post($url, $payload('changed bytes'), ['Accept' => 'application/json'])->assertConflict();
    $headers()->postJson($url, ['message' => 'Different reply'])->assertConflict();
    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
        ->and(DB::table('ticket_attachments')->count())->toBe(1)
        ->and(Storage::disk('private')->allFiles())->toHaveCount(1);
});

test('a retained reply expires after one day and a current token is required for replay', function () {
    [, $customer, $ticket, $token] = customerReplyIdempotencyFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";
    $payload = ['message' => 'First reply'];
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();

    $expired = app(CustomerTokenService::class)->signPayload([
        'customer_id' => $customer->id,
        'organization_id' => $customer->organization_id,
        'ticket_id' => $ticket->id,
        'expires_at' => time() - 10,
    ]);
    $this->withHeader('X-Customer-Token', $expired)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertUnauthorized();

    DB::table('request_idempotency')->update(['expires_at' => now()->subSecond()]);
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();
    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(2);
});

test('a retained reply cannot bypass changed customer access or unavailable ticket', function () {
    [$organization, $customer, $ticket, $token] = customerReplyIdempotencyFixture();
    $key = (string) Str::uuid();
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";
    $payload = ['message' => 'One reply'];
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertCreated();

    $otherCustomer = Customer::create(['organization_id' => $organization->id, 'name' => 'Other', 'email' => 'other@acme.test']);
    $ticket->update(['customer_id' => $otherCustomer->id]);
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertForbidden();

    $ticket->update(['customer_id' => $customer->id]);
    $ticket->delete();
    $this->withHeader('X-Customer-Token', $token)->withHeader('Idempotency-Key', $key)->postJson($url, $payload)->assertNotFound();
    expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
});
