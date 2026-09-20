<?php

use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\User;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    Artisan::call('db:seed');

    $this->acmeOrg = Organization::where('slug', 'acme')->first();
    $this->betaOrg = Organization::where('slug', 'beta')->first();

    $this->acmeAdmin = User::where('email', 'admin@acme.test')->first();
    $this->acmeAgent = User::where('email', 'agent@acme.test')->first();
    $this->betaAdmin = User::where('email', 'admin@beta.test')->first();
    $this->betaAgent = User::where('email', 'agent@beta.test')->first();

    $this->acmeAdminToken = $this->acmeAdmin->createToken('acme-admin')->plainTextToken;
    $this->acmeAgentToken = $this->acmeAgent->createToken('acme-agent')->plainTextToken;
    $this->betaAdminToken = $this->betaAdmin->createToken('beta-admin')->plainTextToken;
    $this->betaAgentToken = $this->betaAgent->createToken('beta-agent')->plainTextToken;

    $this->acmeTicket = Ticket::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->first();

    $this->betaTicket = Ticket::withoutGlobalScopes()
        ->where('organization_id', $this->betaOrg->id)
        ->first();

    $this->acmeCustomer = Customer::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->first();

    $this->betaCustomer = Customer::withoutGlobalScopes()
        ->where('organization_id', $this->betaOrg->id)
        ->first();

    $this->acmeAttachment = TicketAttachment::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->first();

    $this->tokenService = app(CustomerTokenService::class);
});

// =============================================================================
// Section 1: Ticket Query & Listing Isolation
// =============================================================================

test('organization B users only see organization B tickets and cannot count or list organization A tickets', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson('http://beta.localhost/api/tickets');

    $response->assertStatus(200);

    $ticketIds = collect($response->json('data'))->pluck('id')->all();
    $allAcmeTicketIds = Ticket::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->pluck('id')
        ->all();

    // Must have tickets from Beta
    expect($ticketIds)->not->toBeEmpty();

    // Must NOT contain any ticket from Acme
    foreach ($allAcmeTicketIds as $acmeId) {
        expect($ticketIds)->not->toContain($acmeId);
    }

    // Total count in meta must strictly match Beta's ticket count (5), never 10
    expect($response->json('meta.total'))->toBe(5);
});

test('organization B user cannot view organization A ticket by ID from beta host', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(404);
});

test('organization B user cannot access organization A tickets endpoint on acme host', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson('http://acme.localhost/api/tickets');

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);
});

test('organization B user cannot view organization A ticket on acme host', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. You are not an Organization Member of this Organization.']);
});

// =============================================================================
// Section 2: Ticket Mutation Boundary Isolation
// =============================================================================

test('organization B user cannot post messages to organization A ticket', function () {
    // Via Beta Host (Ticket not in Org B)
    $betaHostResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->postJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
            'message_type' => TicketMessageType::PUBLIC_REPLY->value,
            'body' => 'Hostile cross-organization injection attempt',
        ]);
    $betaHostResponse->assertStatus(404);

    // Via Acme Host (Not a member of Org A)
    $acmeHostResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
            'message_type' => TicketMessageType::PUBLIC_REPLY->value,
            'body' => 'Hostile cross-organization injection attempt',
        ]);
    $acmeHostResponse->assertStatus(403);
});

test('organization B user cannot update status of organization A ticket', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->patchJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/status", [
            'status' => TicketStatus::RESOLVED->value,
        ]);

    $response->assertStatus(404);
    expect($this->acmeTicket->fresh()->status)->not->toBe(TicketStatus::RESOLVED);
});

test('organization B user cannot update priority of organization A ticket', function () {
    $response = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->patchJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/priority", [
            'priority' => TicketPriority::LOW->value,
        ]);

    $response->assertStatus(404);
});

test('organization B user cannot claim or assign organization A ticket', function () {
    // Claim attempt
    $claimResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->postJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/claim");
    $claimResponse->assertStatus(404);

    // Assign attempt
    $assignResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->postJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/assign", [
            'team_id' => 1,
        ]);
    $assignResponse->assertStatus(404);
});

test('organization B admin cannot delete or restore organization A ticket', function () {
    // Delete attempt
    $deleteResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->deleteJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}");
    $deleteResponse->assertStatus(404);

    // Restore attempt
    $restoreResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAdminToken)
        ->postJson("http://beta.localhost/api/tickets/{$this->acmeTicket->id}/restore");
    $restoreResponse->assertStatus(404);
});

// =============================================================================
// Section 3: Tag Isolation & Cross-Tenant Tag Attachment Rejection
// =============================================================================

test('tag queries strictly return tags scoped to the authenticated organization', function () {
    $betaTagsResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->getJson('http://beta.localhost/api/tags');
    $betaTagsResponse->assertStatus(200);

    $acmeTagIds = Tag::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->pluck('id')
        ->all();
    $returnedTagIds = collect($betaTagsResponse->json('data'))->pluck('id')->all();

    foreach ($acmeTagIds as $id) {
        expect($returnedTagIds)->not->toContain($id);
    }
});

test('attaching a tag from another organization is strictly rejected with unprocessable entity', function () {
    $betaTag = Tag::withoutGlobalScopes()->where('organization_id', $this->betaOrg->id)->first();

    $attachResponse = $this->withHeader('Authorization', 'Bearer '.$this->acmeAdminToken)
        ->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags", [
            'tag_id' => $betaTag->id,
        ]);

    $attachResponse->assertStatus(422)
        ->assertJsonValidationErrors(['tag_id']);
});

// =============================================================================
// Section 4: Customer Portal & Signed Token Security Isolation
// =============================================================================

test('customer signed token from organization A is rejected on organization B portal', function () {
    // Generate valid Acme token for Acme customer and ticket
    $acmeToken = $this->tokenService->generateToken($this->acmeCustomer, $this->acmeTicket);

    // Attempt to access Beta portal with Acme customer token
    $response = $this->withHeader('X-Customer-Token', $acmeToken)
        ->getJson("http://beta.localhost/api/portal/tickets/{$this->betaTicket->id}");

    $response->assertStatus(403)
        ->assertJson(['message' => 'Forbidden. Token belongs to another organization.']);
});

test('customer token cannot access another customer ticket within the same organization', function () {
    // Create a second customer and ticket within Acme
    $otherCustomer = Customer::withoutGlobalScopes()->where('organization_id', $this->acmeOrg->id)->where('id', '!=', $this->acmeTicket->customer_id)->first();
    $otherCustomerToken = $this->tokenService->generateToken($otherCustomer);

    $response = $this->withHeader('X-Customer-Token', $otherCustomerToken)
        ->getJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(403);
});

test('customer ticket creation via portal strictly scopes to host organization', function () {
    $response = $this->postJson('http://beta.localhost/api/portal/tickets', [
        'name' => 'George Newcomer',
        'email' => 'george@beta-customer.test',
        'subject' => 'Inquiry for Beta Support',
        'message' => 'Please help with onboarding integration.',
        'priority' => TicketPriority::HIGH->value,
    ]);

    $response->assertStatus(201);

    $ticketId = $response->json('ticket.id');
    $createdTicket = Ticket::withoutGlobalScopes()->find($ticketId);

    expect($createdTicket)->not->toBeNull()
        ->and($createdTicket->organization_id)->toBe($this->betaOrg->id)
        ->and($createdTicket->organization_id)->not->toBe($this->acmeOrg->id);
});

test('customer cannot reply to ticket using forged or tampered token', function () {
    $tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmb28iOiJiYXIifQ.tamperedsignature12345';

    $response = $this->withHeader('X-Customer-Token', $tamperedToken)
        ->postJson("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}/reply", [
            'body' => 'Tampered reply attempt',
        ]);

    $response->assertStatus(401)
        ->assertJson(['message' => 'Invalid or tampered customer token.']);
});

// =============================================================================
// Section 5: Attachment Storage Isolation
// =============================================================================

test('agent from organization B cannot download organization A attachment', function () {
    // Via Beta Host (scoped out by OrganizationScope -> 404)
    $betaResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->get("http://beta.localhost/api/attachments/{$this->acmeAttachment->id}/download");
    $betaResponse->assertStatus(404);

    // Via Acme Host (rejected by membership middleware -> 403)
    $acmeResponse = $this->withHeader('Authorization', 'Bearer '.$this->betaAgentToken)
        ->get("http://acme.localhost/api/attachments/{$this->acmeAttachment->id}/download");
    $acmeResponse->assertStatus(403);
});

test('customer cannot download attachment from another organization or internal notes', function () {
    // 1. Cross-tenant download attempt by customer
    $acmeCustomer = Customer::withoutGlobalScopes()->find($this->acmeTicket->customer_id);
    $acmeToken = $this->tokenService->generateToken($acmeCustomer, $this->acmeTicket);

    // Create attachment on Beta ticket
    $disk = config('filesystems.attachments_disk', 'private');
    $betaAttachmentId = (string) Str::uuid();
    $betaFilePath = "tenants/{$this->betaOrg->id}/tickets/{$this->betaTicket->id}/attachments/{$betaAttachmentId}.pdf";
    Storage::disk($disk)->put($betaFilePath, 'Beta Secret Attachment');

    $betaMsg = $this->betaTicket->messages()->first();
    $betaAttachment = TicketAttachment::create([
        'id' => $betaAttachmentId,
        'organization_id' => $this->betaOrg->id,
        'ticket_message_id' => $betaMsg->id,
        'file_name' => 'beta_secret.pdf',
        'file_path' => $betaFilePath,
        'mime_type' => 'application/pdf',
        'file_size' => 20,
    ]);

    $crossDownloadResponse = $this->withHeader('X-Customer-Token', $acmeToken)
        ->get("http://acme.localhost/api/portal/tickets/{$this->acmeTicket->id}/attachments/{$betaAttachment->id}");

    // Should reject with 403 or 404
    expect(in_array($crossDownloadResponse->status(), [403, 404], true))->toBeTrue();

    // 2. Customer cannot download attachment belonging to an internal note
    $ticketWithNote = Ticket::withoutGlobalScopes()
        ->where('organization_id', $this->acmeOrg->id)
        ->whereHas('messages', fn ($q) => $q->where('message_type', TicketMessageType::INTERNAL_NOTE->value))
        ->firstOrFail();

    $internalMsg = $ticketWithNote->messages()
        ->where('message_type', TicketMessageType::INTERNAL_NOTE->value)
        ->firstOrFail();

    $internalAttachmentId = (string) Str::uuid();
    $internalFilePath = "tenants/{$this->acmeOrg->id}/tickets/{$ticketWithNote->id}/attachments/{$internalAttachmentId}.pdf";
    Storage::disk($disk)->put($internalFilePath, 'Internal confidential note attachment');

    $internalAttachment = TicketAttachment::create([
        'id' => $internalAttachmentId,
        'organization_id' => $this->acmeOrg->id,
        'ticket_message_id' => $internalMsg->id,
        'file_name' => 'internal_note.pdf',
        'file_path' => $internalFilePath,
        'mime_type' => 'application/pdf',
        'file_size' => 36,
    ]);

    $customerWithNote = Customer::withoutGlobalScopes()->findOrFail($ticketWithNote->customer_id);
    $customerTokenForNoteTicket = $this->tokenService->generateToken($customerWithNote, $ticketWithNote);

    $internalDownloadResponse = $this->withHeader('X-Customer-Token', $customerTokenForNoteTicket)
        ->get("http://acme.localhost/api/portal/tickets/{$ticketWithNote->id}/attachments/{$internalAttachment->id}");

    $internalDownloadResponse->assertStatus(404);
});
