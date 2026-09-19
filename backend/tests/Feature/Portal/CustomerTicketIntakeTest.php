<?php

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('private');

    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('public ticket intake creates customer, sequential ticket, initial message, and returns signed token', function () {
    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Alice Smith',
        'email' => 'alice@example.com',
        'subject' => 'Cannot access billing portal',
        'message' => 'Whenever I try to log in, I see an error 500.',
    ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'token',
            'ticket' => [
                'id',
                'ticket_number',
                'subject',
                'status',
                'priority',
            ],
            'customer' => [
                'id',
                'name',
                'email',
            ],
            'initial_message' => [
                'id',
                'body',
            ],
        ]);

    $token = $response->json('token');
    expect($token)->toBeString()
        ->and(strlen($token))->toBeGreaterThan(20)
        ->and(str_contains($token, '.'))->toBeTrue();

    // Verify Customer record was created under acme organization
    $customer = Customer::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->where('email', 'alice@example.com')
        ->first();

    expect($customer)->not->toBeNull()
        ->and($customer->name)->toBe('Alice Smith')
        ->and($response->json('customer.id'))->toBe($customer->id);

    // Verify Ticket record was created
    $ticket = Ticket::withoutGlobalScopes()->where('customer_id', $customer->id)->first();
    expect($ticket)->not->toBeNull()
        ->and($ticket->organization_id)->toBe($this->acmeOrg->id)
        ->and($ticket->subject)->toBe('Cannot access billing portal')
        ->and($ticket->ticket_number)->toBe(1)
        ->and($ticket->status)->toBe(TicketStatus::NEW)
        ->and($response->json('ticket.id'))->toBe($ticket->id)
        ->and($response->json('ticket.ticket_number'))->toBe(1);

    // Verify initial TicketMessage was created as a public reply authored by the customer
    $message = TicketMessage::withoutGlobalScopes()->where('ticket_id', $ticket->id)->first();
    expect($message)->not->toBeNull()
        ->and($message->organization_id)->toBe($this->acmeOrg->id)
        ->and($message->message_type)->toBe(TicketMessageType::PUBLIC_REPLY)
        ->and($message->author_type)->toBe(Customer::class)
        ->and($message->author_id)->toBe($customer->id)
        ->and($message->body)->toBe('Whenever I try to log in, I see an error 500.');
});

test('public ticket intake matches existing customer and increments sequential ticket number', function () {
    // Pre-existing customer in Acme
    $existingCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Alice Existing',
        'email' => 'alice@example.com',
    ]);

    // Create a first ticket to advance the counter
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $existingCustomer->id,
        'subject' => 'First ticket',
    ]);

    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Alice Existing',
        'email' => 'alice@example.com',
        'subject' => 'Second inquiry',
        'message' => 'This is my second ticket.',
    ]);

    $response->assertStatus(201);

    expect($response->json('customer.id'))->toBe($existingCustomer->id)
        ->and($response->json('ticket.ticket_number'))->toBe(2);

    // Customer count in Acme should still be 1
    expect(Customer::withoutGlobalScopes()->where('organization_id', $this->acmeOrg->id)->count())->toBe(1);
});

test('public ticket intake accepts optional attachments and stores them in tenant-partitioned path', function () {
    $file1 = UploadedFile::fake()->create('screenshot.png', 500, 'image/png');
    $file2 = UploadedFile::fake()->create('document.pdf', 1000, 'application/pdf');

    $response = $this->post('http://acme.localhost/api/portal/tickets', [
        'name' => 'Bob Builder',
        'email' => 'bob@example.com',
        'subject' => 'Issue with attachments',
        'message' => 'Please find attached documents.',
        'attachments' => [$file1, $file2],
    ], ['Accept' => 'application/json']);

    $response->assertStatus(201)
        ->assertJsonCount(2, 'attachments');

    $ticketId = $response->json('ticket.id');
    $messageId = $response->json('initial_message.id');

    $attachments = TicketAttachment::where('ticket_message_id', $messageId)->get();
    expect($attachments)->toHaveCount(2);

    foreach ($attachments as $att) {
        expect($att->organization_id)->toBe($this->acmeOrg->id)
            ->and($att->file_path)->toStartWith("tenants/{$this->acmeOrg->id}/tickets/{$ticketId}/attachments/");

        Storage::disk('private')->assertExists($att->file_path);
    }
});

test('public ticket intake rejects attachments exceeding 10mb limit and does not create ticket', function () {
    $largeFile = UploadedFile::fake()->create('huge.pdf', 11 * 1024, 'application/pdf'); // 11MB

    $response = $this->post('http://acme.localhost/api/portal/tickets', [
        'name' => 'Charlie Oversize',
        'email' => 'charlie@example.com',
        'subject' => 'Large file ticket',
        'message' => 'This file is too big.',
        'attachments' => [$largeFile],
    ], ['Accept' => 'application/json']);

    $response->assertStatus(422);

    expect(Customer::withoutGlobalScopes()->where('email', 'charlie@example.com')->first())->toBeNull()
        ->and(Ticket::withoutGlobalScopes()->where('subject', 'Large file ticket')->first())->toBeNull();
});

test('public ticket intake rejects attachments with disallowed mime type', function () {
    $badFile = UploadedFile::fake()->create('script.exe', 100, 'application/x-msdownload');

    $response = $this->post('http://acme.localhost/api/portal/tickets', [
        'name' => 'Dave BadMime',
        'email' => 'dave@example.com',
        'subject' => 'Bad file ticket',
        'message' => 'Malicious file.',
        'attachments' => [$badFile],
    ], ['Accept' => 'application/json']);

    $response->assertStatus(422);

    expect(Customer::withoutGlobalScopes()->where('email', 'dave@example.com')->first())->toBeNull();
});

test('public ticket intake validates required fields and email format', function () {
    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => '',
        'email' => 'not-an-email',
        'subject' => '',
        'message' => '',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'email', 'subject', 'message']);
});
