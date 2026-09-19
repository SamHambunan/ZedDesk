<?php

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use App\Services\AttachmentService;
use App\Services\CustomerTokenService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('private');

    $this->org = Organization::create([
        'name' => 'Acme Support',
        'slug' => 'acme',
    ]);

    $this->customer = Customer::create([
        'organization_id' => $this->org->id,
        'name' => 'Jane Doe',
        'email' => 'jane@example.com',
    ]);

    $this->agent = User::create([
        'name' => 'Agent Smith',
        'email' => 'smith@acme.com',
        'password' => bcrypt('secret123'),
    ]);

    $this->ticket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Portal Test Ticket',
        'status' => TicketStatus::OPEN,
    ]);

    $this->tokenService = new CustomerTokenService;
    $this->token = $this->tokenService->generateToken($this->customer, $this->ticket);
    $this->attachmentService = new AttachmentService('private');
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('customer can view conversation thread with public messages while internal notes are strictly omitted', function () {
    // 1. Initial customer public message
    $publicMsg1 = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Customer original issue description',
    ]);

    // 2. Staff internal note (should NEVER be exposed to customer)
    $internalNote = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => User::class,
        'author_id' => (string) $this->agent->id,
        'body' => 'TOP SECRET: Internal triage notes regarding customer',
    ]);

    // 3. Staff public reply to customer
    $publicMsg2 = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => User::class,
        'author_id' => (string) $this->agent->id,
        'body' => 'Agent public reply to customer',
    ]);

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}");

    $response->assertStatus(200)
        ->assertJsonPath('ticket.id', $this->ticket->id)
        ->assertJsonPath('ticket.subject', 'Portal Test Ticket')
        ->assertJsonPath('ticket.status', 'pending')
        ->assertJsonPath('customer.id', $this->customer->id);

    $messages = $response->json('messages');
    expect($messages)->toBeArray()
        ->and(count($messages))->toBe(2);

    $messageBodies = collect($messages)->pluck('body')->all();
    expect($messageBodies)->toContain('Customer original issue description')
        ->and($messageBodies)->toContain('Agent public reply to customer')
        ->and($messageBodies)->not->toContain('TOP SECRET: Internal triage notes regarding customer');
});

test('customer reply posts public message and automatically reopens pending ticket to open', function () {
    $this->ticket->update(['status' => TicketStatus::PENDING]);
    expect($this->ticket->fresh()->status)->toBe(TicketStatus::PENDING);

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'message' => 'Here is the additional information you requested.',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('ticket.id', $this->ticket->id)
        ->assertJsonPath('ticket.status', 'open')
        ->assertJsonPath('reply.body', 'Here is the additional information you requested.');

    // Verify DB state
    $refreshed = $this->ticket->fresh();
    expect($refreshed->status)->toBe(TicketStatus::OPEN);

    // Verify message was recorded
    $message = TicketMessage::where('ticket_id', $this->ticket->id)->latest('created_at')->first();
    expect($message)->not->toBeNull()
        ->and($message->body)->toBe('Here is the additional information you requested.')
        ->and($message->author_type)->toBe(Customer::class)
        ->and($message->author_id)->toBe($this->customer->id)
        ->and($message->isPublicReply())->toBeTrue();
});

test('customer reply automatically reopens resolved ticket to open and clears resolved_at', function () {
    $resolvedTime = Carbon::parse('2026-09-18 10:00:00');
    $this->ticket->update([
        'status' => TicketStatus::RESOLVED,
        'resolved_at' => $resolvedTime,
    ]);
    expect($this->ticket->fresh()->status)->toBe(TicketStatus::RESOLVED)
        ->and($this->ticket->fresh()->resolved_at)->not->toBeNull();

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'body' => 'Actually, the issue is still persisting after reboot.',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('ticket.status', 'open');

    $refreshed = $this->ticket->fresh();
    expect($refreshed->status)->toBe(TicketStatus::OPEN)
        ->and($refreshed->resolved_at)->toBeNull();
});

test('customer reply preserves open status when ticket is already open', function () {
    expect($this->ticket->status)->toBe(TicketStatus::OPEN);

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'message' => 'Just an update while ticket is open.',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('ticket.status', 'open');

    expect($this->ticket->fresh()->status)->toBe(TicketStatus::OPEN);
});

test('customer reply to closed ticket is rejected with 422 Unprocessable Entity', function () {
    $this->ticket->update([
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);
    expect($this->ticket->fresh()->isClosed())->toBeTrue();

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'message' => 'Attempting to reply to an already closed ticket',
        ]);

    $response->assertStatus(422)
        ->assertJsonStructure(['message']);

    // Ensure no new message was created
    expect(TicketMessage::where('ticket_id', $this->ticket->id)->count())->toBe(0);
});

test('customer reply can attach valid files and stores them on private disk', function () {
    $file = UploadedFile::fake()->create('screenshot.png', 150, 'image/png');

    $response = $this->withHeaders([
        'X-Customer-Token' => $this->token,
        'Accept' => 'application/json',
    ])->post("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
        'message' => 'Here is a screenshot of the issue.',
        'attachments' => [$file],
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('reply.body', 'Here is a screenshot of the issue.')
        ->assertJsonPath('reply.attachments.0.file_name', 'screenshot.png');

    $attachmentId = $response->json('reply.attachments.0.id');
    expect($attachmentId)->not->toBeNull();

    $attachmentRecord = TicketAttachment::find($attachmentId);
    expect($attachmentRecord)->not->toBeNull()
        ->and($attachmentRecord->file_name)->toBe('screenshot.png')
        ->and($attachmentRecord->mime_type)->toBe('image/png');

    Storage::disk('private')->assertExists($attachmentRecord->file_path);
});

test('customer reply with invalid attachment is rejected with 422 Unprocessable Entity', function () {
    // 1. Unsupported MIME
    $badFile = UploadedFile::fake()->create('exploit.sh', 10, 'application/x-sh');

    $response = $this->withHeaders([
        'X-Customer-Token' => $this->token,
        'Accept' => 'application/json',
    ])->post("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
        'message' => 'Trying to upload unsupported file.',
        'attachments' => [$badFile],
    ]);

    $response->assertStatus(422)
        ->assertJsonStructure(['message', 'errors']);

    // 2. Oversized file (>10MB)
    $largeFile = UploadedFile::fake()->create('large.pdf', 10245, 'application/pdf');

    $responseLarge = $this->withHeaders([
        'X-Customer-Token' => $this->token,
        'Accept' => 'application/json',
    ])->post("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
        'message' => 'Trying to upload oversized file.',
        'attachments' => [$largeFile],
    ]);

    $responseLarge->assertStatus(422)
        ->assertJsonStructure(['message', 'errors']);
});

test('customer reply requires valid signed token', function () {
    // Missing token
    $responseNoAuth = $this->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
        'message' => 'Unauthenticated attempt',
    ]);
    $responseNoAuth->assertStatus(401);

    // Another customer's token
    $otherCustomer = Customer::create([
        'organization_id' => $this->org->id,
        'name' => 'Bob Other',
        'email' => 'bob@example.com',
    ]);
    $otherToken = $this->tokenService->generateToken($otherCustomer);

    $responseOther = $this->withHeader('X-Customer-Token', $otherToken)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'message' => 'Cross-customer reply attempt',
        ]);
    $responseOther->assertStatus(403);
});

test('customer can stream attachment belonging to a public reply on their ticket', function () {
    $file = UploadedFile::fake()->create('contract.pdf', 200, 'application/pdf');
    $publicMessage = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Here is the contract document.',
    ]);
    $attachment = $this->attachmentService->store($file, $publicMessage);

    // Using X-Customer-Token header
    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->get("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$attachment->id}");

    $response->assertStatus(200)
        ->assertHeader('Content-Type', 'application/pdf');

    expect($response->headers->get('Content-Disposition'))->toContain('contract.pdf');
});

test('customer can stream attachment via query parameter token', function () {
    $file = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');
    $publicMessage = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Here is the report.',
    ]);
    $attachment = $this->attachmentService->store($file, $publicMessage);

    $response = $this->get("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$attachment->id}?token={$this->token}");

    $response->assertStatus(200)
        ->assertHeader('Content-Type', 'application/pdf');

    expect($response->headers->get('Content-Disposition'))->toContain('report.pdf');
});

test('customer cannot stream attachment belonging to an internal note (conversation privacy)', function () {
    // Internal note with private attachment (e.g. internal audit log)
    $internalNote = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => User::class,
        'author_id' => (string) $this->agent->id,
        'body' => 'Confidential internal note with private document',
    ]);

    $privateFile = UploadedFile::fake()->create('internal_audit.pdf', 300, 'application/pdf');
    $privateAttachment = $this->attachmentService->store($privateFile, $internalNote);

    // Customer attempts to stream the internal note attachment
    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$privateAttachment->id}");

    // Must be rejected with 404 to preserve privacy
    $response->assertStatus(404);
});

test('customer cannot stream attachment belonging to another ticket', function () {
    // Create another ticket for the same customer
    $anotherTicket = Ticket::create([
        'organization_id' => $this->org->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Second Ticket',
    ]);

    $message = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $anotherTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Message on second ticket',
    ]);

    $file = UploadedFile::fake()->create('other_ticket.pdf', 100, 'application/pdf');
    $otherAttachment = $this->attachmentService->store($file, $message);

    // Attempt to access other ticket's attachment using ticket 1's URL
    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$otherAttachment->id}");

    $response->assertStatus(404);
});

test('streaming attachment returns 404 when attachment does not exist', function () {
    $randomUuid = '99999999-9999-9999-9999-999999999999';

    $response = $this->withHeader('X-Customer-Token', $this->token)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$randomUuid}");

    $response->assertStatus(404);
});

test('customer cannot stream attachment when token is from another customer', function () {
    $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf');
    $message = TicketMessage::create([
        'organization_id' => $this->org->id,
        'ticket_id' => $this->ticket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->customer->id,
        'body' => 'Message',
    ]);
    $attachment = $this->attachmentService->store($file, $message);

    $otherCustomer = Customer::create([
        'organization_id' => $this->org->id,
        'name' => 'Eve Intruder',
        'email' => 'eve@example.com',
    ]);
    $intruderToken = $this->tokenService->generateToken($otherCustomer);

    $response = $this->withHeader('X-Customer-Token', $intruderToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/attachments/{$attachment->id}");

    $response->assertStatus(403);
});
