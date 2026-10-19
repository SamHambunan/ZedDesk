<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use App\Services\AttachmentService;
use App\Services\CustomerTokenService;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('private');
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->user = User::create(['name' => 'Agent', 'email' => 'agent@example.test', 'password' => Hash::make('password')]);
    $member = OrganizationMember::create(['organization_id' => $this->organization->id, 'user_id' => $this->user->id, 'role' => Role::AGENT->value]);
    $customer = Customer::create(['organization_id' => $this->organization->id, 'name' => 'Customer', 'email' => 'customer@example.test']);
    $this->ticket = Ticket::create(['organization_id' => $this->organization->id, 'customer_id' => $customer->id, 'subject' => 'Upload recovery']);
    $this->message = $this->ticket->addPublicReply($member, 'First message');
    Sanctum::actingAs($this->user);
});

afterEach(fn () => OrganizationContext::clear());

test('separate upload removes bytes if metadata persistence fails', function () {
    TicketAttachment::creating(fn () => throw new RuntimeException('metadata failed'));

    $this->post("http://acme.localhost/api/tickets/{$this->ticket->id}/messages/{$this->message->id}/attachments", [
        'file' => UploadedFile::fake()->create('report.pdf', 10, 'application/pdf'),
    ])->assertStatus(500);

    expect(Storage::disk('private')->allFiles('tenants'))->toBe([]);
    $this->assertDatabaseCount('ticket_attachments', 0);
});

test('message transaction failure after attachment write removes bytes and message', function () {
    app()->bind(AttachmentService::class, fn () => new class extends AttachmentService
    {
        public function store(UploadedFile $file, TicketMessage $message): TicketAttachment
        {
            $this->transaction(fn () => parent::store($file, $message));
            throw new RuntimeException('later write failed');
        }
    });

    $this->withHeader('Idempotency-Key', (string) Str::uuid())->post("http://acme.localhost/api/tickets/{$this->ticket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Reply with a file',
        'attachments' => [UploadedFile::fake()->create('report.pdf', 10, 'application/pdf')],
    ])->assertStatus(500);

    expect(Storage::disk('private')->allFiles('tenants'))->toBe([]);
    $this->assertDatabaseCount('ticket_attachments', 0);
    $this->assertDatabaseMissing('ticket_messages', ['body' => 'Reply with a file']);
});

test('separate upload removes partial bytes when storage reports a failed write', function () {
    $disk = Storage::disk('private');
    $failingDisk = Mockery::mock($disk)->makePartial();
    $failingDisk->shouldReceive('put')->once()->andReturnUsing(function ($path, $contents) use ($disk) {
        $disk->put($path, $contents);

        return false;
    });
    Storage::set('private', $failingDisk);

    $this->post("http://acme.localhost/api/tickets/{$this->ticket->id}/messages/{$this->message->id}/attachments", [
        'file' => UploadedFile::fake()->create('partial.pdf', 10, 'application/pdf'),
    ])->assertStatus(500);

    expect($disk->allFiles('tenants'))->toBe([]);
    $this->assertDatabaseCount('ticket_attachments', 0);
});

test('a commit listener failure preserves a referenced attachment', function () {
    TicketAttachment::created(function () {
        Event::listen(TransactionCommitted::class, fn () => throw new RuntimeException('post-commit callback failed'));
    });

    $this->post("http://acme.localhost/api/tickets/{$this->ticket->id}/messages/{$this->message->id}/attachments", [
        'file' => UploadedFile::fake()->create('saved.pdf', 10, 'application/pdf'),
    ])->assertStatus(500);

    $attachment = TicketAttachment::firstOrFail();
    Storage::disk('private')->assertExists($attachment->file_path);
});

test('customer ticket creation failure after attachment write removes bytes and business records', function () {
    TicketAttachment::created(fn () => throw new RuntimeException('later transaction step failed'));

    $this->post('http://acme.localhost/api/portal/tickets', [
        'name' => 'New Customer',
        'email' => 'new@example.test',
        'subject' => 'Failed intake',
        'message' => 'Please help',
        'attachments' => [UploadedFile::fake()->create('report.pdf', 10, 'application/pdf')],
    ], ['Accept' => 'application/json'])->assertStatus(500);

    expect(Storage::disk('private')->allFiles('tenants'))->toBe([]);
    $this->assertDatabaseMissing('customers', ['email' => 'new@example.test']);
    $this->assertDatabaseMissing('tickets', ['subject' => 'Failed intake']);
    $this->assertDatabaseCount('ticket_attachments', 0);
});

test('customer reply failure on second attachment removes both files and message', function () {
    $created = 0;
    TicketAttachment::creating(function () use (&$created) {
        if (++$created === 2) {
            throw new RuntimeException('second metadata write failed');
        }
    });

    $token = (new CustomerTokenService)->generateToken($this->ticket->customer, $this->ticket);
    $this->withHeaders(['X-Customer-Token' => $token, 'Idempotency-Key' => (string) \Illuminate\Support\Str::uuid(), 'Accept' => 'application/json'])
        ->post("http://acme.localhost/api/portal/tickets/{$this->ticket->id}/reply", [
            'message' => 'Reply with two files',
            'attachments' => [
                UploadedFile::fake()->create('first.pdf', 10, 'application/pdf'),
                UploadedFile::fake()->create('second.pdf', 10, 'application/pdf'),
            ],
        ])->assertStatus(500);

    expect(Storage::disk('private')->allFiles('tenants'))->toBe([]);
    $this->assertDatabaseMissing('ticket_messages', ['body' => 'Reply with two files']);
    $this->assertDatabaseCount('ticket_attachments', 0);
    $this->assertDatabaseCount('request_idempotency', 0);
});

test('cleanup removes old orphans and preserves referenced, recent, and other organization files', function () {
    $service = new AttachmentService('private');
    $referenced = $service->store(UploadedFile::fake()->create('saved.pdf', 10, 'application/pdf'), $this->message);
    $otherOrganization = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $otherMember = OrganizationMember::create(['organization_id' => $otherOrganization->id, 'user_id' => $this->user->id, 'role' => Role::AGENT->value]);
    $otherCustomer = Customer::create(['organization_id' => $otherOrganization->id, 'name' => 'Other Customer', 'email' => 'other@example.test']);
    $otherTicket = Ticket::create(['organization_id' => $otherOrganization->id, 'customer_id' => $otherCustomer->id, 'subject' => 'Other attachment']);
    $otherMessage = $otherTicket->addPublicReply($otherMember, 'Other message');
    $otherAttachment = $service->store(UploadedFile::fake()->create('other.pdf', 10, 'application/pdf'), $otherMessage);
    $base = "tenants/{$this->organization->id}/tickets/{$this->ticket->id}/attachments";
    $orphan = "$base/11111111-1111-4111-8111-111111111111.v2_pdf";
    $recent = "$base/22222222-2222-4222-8222-222222222222.pdf";
    $other = $otherAttachment->file_path;
    $otherOrphan = "tenants/{$otherOrganization->id}/tickets/{$otherTicket->id}/attachments/33333333-3333-4333-8333-333333333333.pdf";

    foreach ([$orphan, $recent, $otherOrphan] as $path) {
        Storage::disk('private')->put($path, 'private bytes');
    }
    foreach ([$orphan, $otherOrphan, $other, $referenced->file_path] as $path) {
        touch(Storage::disk('private')->path($path), time() - 7200);
    }

    $this->artisan('attachments:clean-orphans', ['--organization' => $this->organization->id])->assertSuccessful();
    Storage::disk('private')->assertMissing($orphan);
    foreach ([$recent, $otherOrphan, $other, $referenced->file_path] as $path) {
        Storage::disk('private')->assertExists($path);
    }
    $this->artisan('attachments:clean-orphans')->assertSuccessful();
    Storage::disk('private')->assertMissing($otherOrphan);
    foreach ([$recent, $other, $referenced->file_path] as $path) {
        Storage::disk('private')->assertExists($path);
    }
});

test('cleanup skips a file locked by an upload transaction and recovers it later', function () {
    $path = "tenants/{$this->organization->id}/tickets/{$this->ticket->id}/attachments/44444444-4444-4444-8444-444444444444.pdf";
    Storage::disk('private')->put($path, 'partial upload');
    touch(Storage::disk('private')->path($path), time() - 7200);

    config(['database.connections.attachment_upload_test' => config('database.connections.pgsql')]);
    $writer = DB::connection('attachment_upload_test');
    $writer->beginTransaction();

    try {
        $writer->select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$path]);
        $this->artisan('attachments:clean-orphans')->assertSuccessful();
        Storage::disk('private')->assertExists($path);
    } finally {
        $writer->rollBack();
        DB::purge('attachment_upload_test');
    }

    $this->artisan('attachments:clean-orphans')->assertSuccessful();
    Storage::disk('private')->assertMissing($path);
});
