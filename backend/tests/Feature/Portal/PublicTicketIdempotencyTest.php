<?php

use App\Models\Organization;
use App\Models\Ticket;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('private');
    Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    Organization::create(['name' => 'Beta', 'slug' => 'beta']);
});

function intakePayload(string $message = 'Please help'): array
{
    return ['name' => 'Alice', 'email' => 'alice@example.test', 'subject' => 'Help', 'message' => $message];
}

test('public intake requires a secret key and recovers the original credential without duplicating effects', function () {
    $url = 'http://acme.localhost/api/portal/tickets';
    $this->postJson($url, intakePayload())->assertUnprocessable()->assertJsonValidationErrors('idempotency_key');
    $this->withHeader('Idempotency-Key', 'short')->postJson($url, intakePayload())->assertUnprocessable();
    expect(DB::table('tickets')->count())->toBe(0);

    $key = (string) Str::uuid();
    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertCreated();
    $counts = [DB::table('tickets')->count(), DB::table('ticket_messages')->count(), DB::table('audit_logs')->count(), DB::table('notifications')->count(), DB::table('delivery_outbox')->count()];
    $replay = $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertCreated();

    expect($replay->getContent())->toBe($first->getContent())
        ->and([DB::table('tickets')->count(), DB::table('ticket_messages')->count(), DB::table('audit_logs')->count(), DB::table('notifications')->count(), DB::table('delivery_outbox')->count()])->toBe($counts);

    $record = DB::table('request_idempotency')->sole();
    expect($record->actor_type)->toBe('public')
        ->and($record->actor_id)->toBe('anonymous')
        ->and($record->operation)->toBe('ticket.create')
        ->and($record->key_hash)->toBe(hash('sha256', $key))
        ->and($record->encrypted_response)->not->toContain($first->json('token'))
        ->and($record->encrypted_response)->not->toContain($first->json('access_url'));
    expect(DB::table('audit_logs')->get()->toJson())->not->toContain($key, $first->json('token'));
    expect(DB::table('delivery_outbox')->get()->toJson())->not->toContain($key, $first->json('token'));
});

test('replay compares the complete intake including file bytes and is scoped to organization', function () {
    $key = (string) Str::uuid();
    $send = fn (string $host, array $payload) => $this->withHeader('Idempotency-Key', $key)->post("http://{$host}.localhost/api/portal/tickets", $payload, ['Accept' => 'application/json']);
    $payload = fn (string $bytes) => intakePayload() + ['attachments' => [UploadedFile::fake()->createWithContent('proof.txt', $bytes)]];

    $first = $send('acme', $payload('original'))->assertCreated();
    $send('acme', $payload('original'))->assertCreated()->assertExactJson($first->json());
    $send('beta', $payload('original'))->assertCreated();
    $send('acme', $payload('changed'))->assertConflict();
    $send('acme', intakePayload('changed message'))->assertConflict();

    expect(DB::table('tickets')->count())->toBe(2)
        ->and(DB::table('ticket_attachments')->count())->toBe(2)
        ->and(Storage::disk('private')->allFiles())->toHaveCount(2);
});

test('an email alone cannot recover an intake response', function () {
    $key = (string) Str::uuid();
    $url = 'http://acme.localhost/api/portal/tickets';
    $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertCreated();
    $this->withHeader('Idempotency-Key', $key)->postJson($url, ['email' => 'alice@example.test'])
        ->assertUnprocessable()->assertJsonValidationErrors(['name', 'subject', 'message']);
});

test('a retained credential is unavailable after deletion and expires with its record', function () {
    $key = (string) Str::uuid();
    $url = 'http://acme.localhost/api/portal/tickets';
    $first = $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertCreated();
    Ticket::withoutGlobalScopes()->findOrFail($first->json('ticket.id'))->delete();
    $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertNotFound();
    DB::table('request_idempotency')->update(['expires_at' => now()->subSecond()]);
    $this->artisan('idempotency:clean')->assertSuccessful();
    expect(DB::table('request_idempotency')->count())->toBe(0);
    $next = $this->withHeader('Idempotency-Key', $key)->postJson($url, intakePayload())->assertCreated();
    expect($next->json('ticket.id'))->not->toBe($first->json('ticket.id'));
});
