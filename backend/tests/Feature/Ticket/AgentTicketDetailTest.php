<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Events\TicketMessageCreated;
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
use App\Policies\TicketMessagePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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

    $this->acmeAdminUser = User::create([
        'name' => 'Acme Admin',
        'email' => 'admin@acme.test',
        'password' => bcrypt('password'),
    ]);

    $this->acmeAdminMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeAdminUser->id,
        'role' => Role::ADMIN->value,
    ]);

    $this->acmeAgentUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => bcrypt('password'),
    ]);

    $this->acmeAgentMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeAgentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaAgentUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.test',
        'password' => bcrypt('password'),
    ]);

    $this->betaAgentMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->betaAgentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Alice Customer',
        'email' => 'alice@customer.com',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Ticket 1',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::HIGH,
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket message policy allows admin and agent members to author messages and rejects unauthorized users', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $policy = new TicketMessagePolicy;

    expect($policy->create($this->acmeAdminUser, $this->acmeTicket))->toBeTrue()
        ->and($policy->create($this->acmeAgentUser, $this->acmeTicket))->toBeTrue()
        ->and($policy->create($this->betaAgentUser, $this->acmeTicket))->toBeFalse()
        ->and(Gate::forUser($this->acmeAgentUser)->allows('create', [TicketMessage::class, $this->acmeTicket]))->toBeTrue()
        ->and(Gate::forUser($this->betaAgentUser)->allows('create', [TicketMessage::class, $this->acmeTicket]))->toBeFalse();
});

test('get api tickets uuid returns 200 with ticket details, customer, and tags for authenticated agent', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(200)
        ->assertJsonPath('data.id', $this->acmeTicket->id)
        ->assertJsonPath('data.ticket_number', $this->acmeTicket->ticket_number)
        ->assertJsonPath('data.subject', 'Acme Ticket 1')
        ->assertJsonPath('data.status', 'open')
        ->assertJsonPath('data.priority', 'high')
        ->assertJsonPath('data.customer.id', $this->acmeCustomer->id)
        ->assertJsonPath('data.customer.email', 'alice@customer.com');
});

test('get api tickets uuid rejects unauthenticated access with 401', function () {
    $response = $this->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(401);
});

test('get api tickets uuid rejects cross-organization access with 403', function () {
    Sanctum::actingAs($this->betaAgentUser);

    $response = $this->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(403);
});

test('get api tickets uuid returns 404 when ticket does not exist', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $nonExistentUuid = '00000000-0000-0000-0000-000000000000';
    $response = $this->getJson("http://acme.localhost/api/tickets/{$nonExistentUuid}");

    $response->assertStatus(404);
});

test('get api tickets uuid returns full conversation timeline including internal notes and assignment audit log', function () {
    $tag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing',
        'slug' => 'billing',
    ]);
    $this->acmeTicket->attachTag($tag);

    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support Tier 1',
    ]);

    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $team->id,
        'member_id' => $this->acmeAgentMember->id,
        'assigned_by_id' => $this->acmeAdminMember->id,
        'created_at' => now()->subMinutes(30),
    ]);

    $customerMessage = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => Customer::class,
        'author_id' => $this->acmeCustomer->id,
        'body' => 'Initial inquiry from customer',
        'created_at' => now()->subMinutes(25),
    ]);

    $internalNote = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::INTERNAL_NOTE,
        'author_type' => OrganizationMember::class,
        'author_id' => $this->acmeAdminMember->id,
        'body' => 'Internal note for agents only',
        'created_at' => now()->subMinutes(20),
    ]);

    $agentReply = TicketMessage::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'message_type' => TicketMessageType::PUBLIC_REPLY,
        'author_type' => OrganizationMember::class,
        'author_id' => $this->acmeAgentMember->id,
        'body' => 'Agent public reply to customer',
        'created_at' => now()->subMinutes(15),
    ]);

    $attachment = TicketAttachment::create([
        'id' => (string) Str::uuid(),
        'organization_id' => $this->acmeOrg->id,
        'ticket_message_id' => $agentReply->id,
        'file_name' => 'invoice.pdf',
        'file_path' => "tenants/{$this->acmeOrg->id}/tickets/{$this->acmeTicket->id}/attachments/invoice.pdf",
        'mime_type' => 'application/pdf',
        'file_size' => 2048,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}");

    $response->assertStatus(200);

    $messages = $response->json('data.messages');
    expect($messages)->toHaveCount(3)
        ->and($messages[0]['id'])->toBe($customerMessage->id)
        ->and($messages[0]['message_type'])->toBe('public_reply')
        ->and($messages[0]['body'])->toBe('Initial inquiry from customer')
        ->and($messages[1]['id'])->toBe($internalNote->id)
        ->and($messages[1]['message_type'])->toBe('internal_note')
        ->and($messages[1]['body'])->toBe('Internal note for agents only')
        ->and($messages[2]['id'])->toBe($agentReply->id)
        ->and($messages[2]['message_type'])->toBe('public_reply')
        ->and($messages[2]['attachments'])->toHaveCount(1)
        ->and($messages[2]['attachments'][0]['file_name'])->toBe('invoice.pdf');

    $assignments = $response->json('data.assignments');
    expect($assignments)->toHaveCount(1)
        ->and($assignments[0]['id'])->toBe($assignment->id)
        ->and($assignments[0]['team']['name'])->toBe('Support Tier 1')
        ->and($assignments[0]['member']['user']['email'])->toBe('agent@acme.test')
        ->and($assignments[0]['assigned_by']['user']['email'])->toBe('admin@acme.test');

    $tags = $response->json('data.tags');
    expect($tags)->toHaveCount(1)
        ->and($tags[0]['name'])->toBe('Billing');

    $attachments = $response->json('data.attachments');
    expect($attachments)->toHaveCount(1)
        ->and($attachments[0]['file_name'])->toBe('invoice.pdf');
});

test('agent can post public reply which defaults ticket status to pending and dispatches TicketMessageCreated event', function () {
    Event::fake([TicketMessageCreated::class]);

    Sanctum::actingAs($this->acmeAgentUser);

    expect($this->acmeTicket->status)->toBe(TicketStatus::OPEN);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Hello Alice, we are investigating your issue.',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.message_type', 'public_reply')
        ->assertJsonPath('data.body', 'Hello Alice, we are investigating your issue.')
        ->assertJsonPath('ticket.status', 'pending');

    $this->acmeTicket->refresh();
    expect($this->acmeTicket->status)->toBe(TicketStatus::PENDING);

    $message = TicketMessage::where('ticket_id', $this->acmeTicket->id)->first();
    expect($message)->not->toBeNull()
        ->and($message->author_type)->toBe(OrganizationMember::class)
        ->and($message->author_id)->toBe((string) $this->acmeAgentMember->id);

    Event::assertDispatched(TicketMessageCreated::class, function (TicketMessageCreated $event) use ($message) {
        return $event->message->id === $message->id && $event->ticket->id === $this->acmeTicket->id;
    });
});

test('agent can post public reply with status override to resolved', function () {
    Event::fake([TicketMessageCreated::class]);

    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Your issue is resolved.',
        'status' => 'resolved',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('ticket.status', 'resolved');

    $this->acmeTicket->refresh();
    expect($this->acmeTicket->status)->toBe(TicketStatus::RESOLVED);

    Event::assertDispatched(TicketMessageCreated::class);
});

test('agent can post internal note which never alters ticket status', function () {
    Event::fake([TicketMessageCreated::class]);

    Sanctum::actingAs($this->acmeAgentUser);

    expect($this->acmeTicket->status)->toBe(TicketStatus::OPEN);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'internal_note',
        'body' => 'Private note: escalated to tier 2.',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.message_type', 'internal_note')
        ->assertJsonPath('data.body', 'Private note: escalated to tier 2.')
        ->assertJsonPath('ticket.status', 'open');

    $this->acmeTicket->refresh();
    expect($this->acmeTicket->status)->toBe(TicketStatus::OPEN);

    Event::assertDispatched(TicketMessageCreated::class);
});

test('agent can post public reply with optional file attachments', function () {
    Event::fake([TicketMessageCreated::class]);

    Sanctum::actingAs($this->acmeAgentUser);

    $file1 = UploadedFile::fake()->create('document.pdf', 500, 'application/pdf');
    $file2 = UploadedFile::fake()->create('screenshot.png', 100, 'image/png');

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Here are the requested documents.',
        'attachments' => [$file1, $file2],
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.message_type', 'public_reply')
        ->assertJsonCount(2, 'data.attachments');

    $attachments = TicketAttachment::where('organization_id', $this->acmeOrg->id)->get();
    expect($attachments)->toHaveCount(2);

    foreach ($attachments as $att) {
        Storage::disk('private')->assertExists($att->file_path);
    }
});

test('agent message post rejects disallowed attachment mime types with 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $file = UploadedFile::fake()->create('malicious.exe', 100, 'application/x-msdownload');

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Sending executable file',
        'attachments' => [$file],
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['attachments']);
});

test('agent message post rejects oversized attachments exceeding 10MB with 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $largeFile = UploadedFile::fake()->create('huge.pdf', 11 * 1024, 'application/pdf');

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Sending large file',
        'attachments' => [$largeFile],
    ]);

    $response->assertStatus(422);
});

test('agent message post rejects missing or empty message body with 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => '',
    ]);

    $response->assertStatus(422);
});

test('agent message post rejects replies on closed ticket with 422', function () {
    // Transition ticket to closed: NEW -> OPEN -> RESOLVED -> CLOSED
    $this->acmeTicket->status = TicketStatus::OPEN;
    $this->acmeTicket->save();
    $this->acmeTicket->status = TicketStatus::RESOLVED;
    $this->acmeTicket->save();
    $this->acmeTicket->status = TicketStatus::CLOSED;
    $this->acmeTicket->save();

    expect($this->acmeTicket->isClosed())->toBeTrue();

    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Attempting reply on closed ticket',
    ]);

    $response->assertStatus(422);
});

test('agent message post rejects unauthenticated access with 401', function () {
    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Unauthorized reply attempt',
    ]);

    $response->assertStatus(401);
});

test('agent message post rejects cross-organization access with 403', function () {
    Sanctum::actingAs($this->betaAgentUser);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/messages", [
        'message_type' => 'public_reply',
        'body' => 'Cross-tenant reply attempt',
    ]);

    $response->assertStatus(403);
});
