<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use App\Services\AttachmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

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

    $this->acmeUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password'),
    ]);

    $this->betaUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.test',
        'password' => Hash::make('password'),
    ]);

    $this->acmeMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->betaUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Ticket for Attachments',
    ]);

    $this->acmeMessage = $this->acmeTicket->addPublicReply(
        $this->acmeMember,
        'Here is an invoice.'
    );

    $this->service = new AttachmentService('private');

    $file = UploadedFile::fake()->create('invoice.pdf', 300, 'application/pdf');
    $this->acmeAttachment = $this->service->store($file, $this->acmeMessage);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('authenticated organization member can download attachment via streaming endpoint', function () {
    Sanctum::actingAs($this->acmeUser);

    $response = $this->get("http://acme.localhost/api/attachments/{$this->acmeAttachment->id}/download");

    $response->assertStatus(200)
        ->assertHeader('Content-Type', 'application/pdf');

    expect($response->headers->get('Content-Disposition'))->toContain('invoice.pdf');
});

test('unauthenticated request to streaming endpoint is rejected', function () {
    $response = $this->getJson("http://acme.localhost/api/attachments/{$this->acmeAttachment->id}/download");

    $response->assertStatus(401);
});

test('user from another organization is forbidden from downloading attachment', function () {
    Sanctum::actingAs($this->betaUser);

    // Cross-tenant access attempted on Acme subdomain
    $response = $this->getJson("http://acme.localhost/api/attachments/{$this->acmeAttachment->id}/download");
    $response->assertStatus(403);

    // Cross-tenant access attempted on Beta subdomain
    $responseBeta = $this->getJson("http://beta.localhost/api/attachments/{$this->acmeAttachment->id}/download");
    $responseBeta->assertStatus(403);
});

test('streaming endpoint returns 404 when attachment does not exist', function () {
    Sanctum::actingAs($this->acmeUser);

    $randomUuid = 'a0000000-0000-0000-0000-000000000000';
    $response = $this->getJson("http://acme.localhost/api/attachments/{$randomUuid}/download");

    $response->assertStatus(404);
});

test('organization member can upload attachment to ticket message via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $uploadFile = UploadedFile::fake()->create('diagnostic.txt', 200, 'text/plain');

    $response = $this->post("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages/{$this->acmeMessage->id}/attachments", [
        'file' => $uploadFile,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.file_name', 'diagnostic.txt')
        ->assertJsonPath('data.mime_type', 'text/plain');

    $attachmentId = $response->json('data.id');
    $expectedPath = "tenants/{$this->acmeOrg->id}/tickets/{$this->acmeTicket->id}/attachments/{$attachmentId}.txt";

    Storage::disk('private')->assertExists($expectedPath);
    $this->assertDatabaseHas('ticket_attachments', [
        'id' => $attachmentId,
        'organization_id' => $this->acmeOrg->id,
        'ticket_message_id' => $this->acmeMessage->id,
        'file_name' => 'diagnostic.txt',
    ]);
});

test('uploading attachment via api validates file size and mime type', function () {
    Sanctum::actingAs($this->acmeUser);

    // Too large (> 10MB)
    $largeFile = UploadedFile::fake()->create('large.pdf', 10245, 'application/pdf');
    $response = $this->post("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages/{$this->acmeMessage->id}/attachments", [
        'file' => $largeFile,
    ]);
    $response->assertStatus(422);

    // Disallowed MIME type
    $badFile = UploadedFile::fake()->create('script.sh', 50, 'application/x-sh');
    $responseBad = $this->post("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages/{$this->acmeMessage->id}/attachments", [
        'file' => $badFile,
    ]);
    $responseBad->assertStatus(422);
});

test('cross-tenant attachment upload is rejected', function () {
    Sanctum::actingAs($this->betaUser);

    $file = UploadedFile::fake()->create('exploit.pdf', 100, 'application/pdf');

    $response = $this->post("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages/{$this->acmeMessage->id}/attachments", [
        'file' => $file,
    ]);

    $response->assertStatus(403);
});
