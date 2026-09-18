<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Exceptions\ImmutableAttachmentException;
use App\Exceptions\InvalidAttachmentException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\User;
use App\Services\AttachmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

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
        'subject' => 'Acme Ticket with Attachment',
    ]);

    $this->acmeMessage = $this->acmeTicket->addPublicReply(
        $this->acmeMember,
        'Here is the screenshot of the issue.'
    );

    $this->betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Ticket with Attachment',
    ]);

    $this->betaMessage = $this->betaTicket->addPublicReply(
        $this->betaMember,
        'Beta reply message.'
    );

    $this->service = new AttachmentService(disk: 'private');
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket_attachments table has expected schema and uuid primary key', function () {
    expect(Schema::hasTable('ticket_attachments'))->toBeTrue()
        ->and(Schema::hasColumns('ticket_attachments', [
            'id',
            'organization_id',
            'ticket_message_id',
            'file_name',
            'file_path',
            'mime_type',
            'file_size',
            'created_at',
            'updated_at',
        ]))->toBeTrue();
});

test('attachment service stores valid file in partitioned tenant path', function () {
    $file = UploadedFile::fake()->create('screenshot.png', 500, 'image/png');

    $attachment = $this->service->store($file, $this->acmeMessage);

    expect($attachment->id)->toBeString()
        ->and(Str::isUuid($attachment->id))->toBeTrue()
        ->and($attachment->organization_id)->toBe($this->acmeOrg->id)
        ->and($attachment->ticket_message_id)->toBe($this->acmeMessage->id)
        ->and($attachment->file_name)->toBe('screenshot.png')
        ->and($attachment->mime_type)->toBe('image/png')
        ->and($attachment->file_size)->toBe($file->getSize());

    $expectedPath = "tenants/{$this->acmeOrg->id}/tickets/{$this->acmeTicket->id}/attachments/{$attachment->id}.png";
    expect($attachment->file_path)->toBe($expectedPath);

    Storage::disk('private')->assertExists($expectedPath);

    $this->assertDatabaseHas('ticket_attachments', [
        'id' => $attachment->id,
        'organization_id' => $this->acmeOrg->id,
        'ticket_message_id' => $this->acmeMessage->id,
        'file_name' => 'screenshot.png',
        'file_path' => $expectedPath,
    ]);
});

test('attachment service rejects file larger than 10MB', function () {
    // 10MB + 1KB
    $largeFile = UploadedFile::fake()->create('huge-video.pdf', 10241, 'application/pdf');

    expect(fn () => $this->service->store($largeFile, $this->acmeMessage))
        ->toThrow(InvalidAttachmentException::class, 'File size exceeds the 10MB limit.');
});

test('attachment service rejects disallowed MIME types', function () {
    $exeFile = UploadedFile::fake()->create('malware.exe', 100, 'application/x-msdownload');

    expect(fn () => $this->service->store($exeFile, $this->acmeMessage))
        ->toThrow(InvalidAttachmentException::class);
});

test('attachment service allows common document and image MIME types', function (string $filename, string $mime) {
    $file = UploadedFile::fake()->create($filename, 200, $mime);

    $attachment = $this->service->store($file, $this->acmeMessage);

    expect($attachment->mime_type)->toBe($mime);
    Storage::disk('private')->assertExists($attachment->file_path);
})->with([
    'jpeg' => ['photo.jpg', 'image/jpeg'],
    'png' => ['photo.png', 'image/png'],
    'gif' => ['anim.gif', 'image/gif'],
    'webp' => ['image.webp', 'image/webp'],
    'pdf' => ['invoice.pdf', 'application/pdf'],
    'txt' => ['notes.txt', 'text/plain'],
    'csv' => ['data.csv', 'text/csv'],
    'zip' => ['archive.zip', 'application/zip'],
    'json' => ['payload.json', 'application/json'],
]);

test('ticket attachment is strictly append-only and immutable', function () {
    $file = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');
    $attachment = $this->service->store($file, $this->acmeMessage);

    // Update attempt must fail
    expect(function () use ($attachment) {
        $attachment->file_name = 'tampered.pdf';
        $attachment->save();
    })->toThrow(ImmutableAttachmentException::class);

    // Delete attempt must fail
    expect(function () use ($attachment) {
        $attachment->delete();
    })->toThrow(ImmutableAttachmentException::class);
});

test('ticket attachment validates cross-organization message creation', function () {
    expect(function () {
        TicketAttachment::create([
            'organization_id' => $this->betaOrg->id,
            'ticket_message_id' => $this->acmeMessage->id,
            'file_name' => 'hacked.pdf',
            'file_path' => 'path',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
        ]);
    })->toThrow(DomainException::class, 'Cross-organization ticket attachment creation is rejected.');
});

test('ticket attachment relations navigate between message, ticket, and attachments', function () {
    $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf');
    $attachment = $this->service->store($file, $this->acmeMessage);

    expect($attachment->ticketMessage->id)->toBe($this->acmeMessage->id)
        ->and($attachment->ticket->id)->toBe($this->acmeTicket->id)
        ->and($this->acmeMessage->fresh()->attachments)->toHaveCount(1)
        ->and($this->acmeMessage->fresh()->attachments->first()->id)->toBe($attachment->id);
});

test('attachment service delivers secure streaming download to authorized organization member', function () {
    $file = UploadedFile::fake()->create('secret-report.pdf', 100, 'application/pdf');
    $attachment = $this->service->store($file, $this->acmeMessage);

    $response = $this->service->download($attachment, $this->acmeUser);

    expect($response)->toBeInstanceOf(StreamedResponse::class)
        ->and($response->headers->get('Content-Type'))->toBe('application/pdf')
        ->and($response->headers->get('Content-Disposition'))->toContain('secret-report.pdf');
});

test('attachment service rejects streaming download for user from different organization', function () {
    $file = UploadedFile::fake()->create('confidential.pdf', 100, 'application/pdf');
    $attachment = $this->service->store($file, $this->acmeMessage);

    expect(fn () => $this->service->download($attachment, $this->betaUser))
        ->toThrow(HttpException::class);
});
