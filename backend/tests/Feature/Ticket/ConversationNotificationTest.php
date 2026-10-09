<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function conversationMember(Organization $organization, string $name): OrganizationMember
{
    $user = User::create([
        'name' => $name,
        'email' => strtolower($name).'@'.$organization->slug.'.test',
        'password' => bcrypt('password'),
    ]);

    return OrganizationMember::create([
        'organization_id' => $organization->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);
}

function conversationTicket(Organization $organization): array
{
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@'.$organization->slug.'.test',
    ]);
    $ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Conversation follow up',
    ]);

    return [$ticket, app(CustomerTokenService::class)->generateToken($customer, $ticket)];
}

test('Customer Public Reply and its Ticket Status change create one Notification for the current handler', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    [$ticket, $token] = conversationTicket($organization);
    $handler = conversationMember($organization, 'Handler');
    $other = conversationMember($organization, 'Other');
    $ticket->update(['assigned_member_id' => $handler->id, 'status' => 'pending']);

    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", [
            'message' => 'I have more information',
        ])->assertCreated()->assertJsonPath('ticket.status', 'open');

    Sanctum::actingAs($handler->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.ticket_id', $ticket->id)
        ->assertJsonPath('data.0.activity_type', 'customer_public_reply');
    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertJsonPath('unread_count', 1);
    Sanctum::actingAs($other->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
});

test('another Organization Members Internal Note notifies the handler and never the actor', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    [$ticket] = conversationTicket($organization);
    $handler = conversationMember($organization, 'Handler');
    $actor = conversationMember($organization, 'Actor');
    $ticket->update(['assigned_member_id' => $handler->id]);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";

    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['message_type' => 'internal_note', 'body' => 'Please investigate'])
        ->assertCreated();
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');

    Sanctum::actingAs($handler->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'internal_note')
        ->assertJsonPath('data.0.latest_activity_metadata.actor_member_id', $actor->id);

    $this->postJson($url, ['message_type' => 'internal_note', 'body' => 'My own note'])
        ->assertCreated();
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data');
});

test('conversation activity falls back to active Team members then active Organization Members', function () {
    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    [$ticket, $token] = conversationTicket($acme);
    $actor = conversationMember($acme, 'Actor');
    $teammate = conversationMember($acme, 'Teammate');
    $other = conversationMember($acme, 'Other');
    $removed = conversationMember($acme, 'Removed');
    $outsider = conversationMember($beta, 'Outsider');
    $team = Team::create(['organization_id' => $acme->id, 'name' => 'Support']);
    $team->members()->attach([$actor->id, $teammate->id, $removed->id]);
    $removed->delete();
    $ticket->update(['assigned_team_id' => $team->id]);

    Sanctum::actingAs($actor->user);
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/messages", [
        'message_type' => 'internal_note', 'body' => 'Team work',
    ])->assertCreated();
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    Sanctum::actingAs($teammate->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data');
    Sanctum::actingAs($other->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    expect(DB::table('notifications')->where('recipient_member_id', $removed->id)->count())->toBe(0);

    $ticket->update(['assigned_team_id' => null]);
    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticket->id}/reply", [
            'message' => 'Unassigned follow up',
        ])->assertCreated();
    foreach ([$actor, $teammate, $other] as $member) {
        Sanctum::actingAs($member->user);
        $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.activity_type', 'customer_public_reply');
    }
    Sanctum::actingAs($outsider->user);
    $this->getJson('http://beta.localhost/api/notifications')->assertJsonCount(0, 'data');
    expect(DB::table('notifications')->where('recipient_member_id', $removed->id)->count())->toBe(0);
});

test('unread conversation activity groups by Ticket and activity after read creates a new item', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    [$ticket, $token] = conversationTicket($organization);
    $handler = conversationMember($organization, 'Handler');
    $ticket->update(['assigned_member_id' => $handler->id]);
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";

    $this->withHeader('X-Customer-Token', $token)
        ->postJson($url, ['message' => 'First update'])->assertCreated();
    $this->postJson($url, ['message' => 'Second update'])->assertCreated();

    Sanctum::actingAs($handler->user);
    $first = $this->getJson('http://acme.localhost/api/notifications')
        ->assertJsonCount(1, 'data')->json('data.0.id');
    $this->getJson("http://acme.localhost/api/tickets/{$ticket->id}")->assertOk();
    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertJsonPath('unread_count', 1);
    $this->postJson("http://acme.localhost/api/notifications/{$first}/mark-read")->assertOk();

    $this->withHeader('X-Customer-Token', $token)
        ->postJson($url, ['message' => 'Third update'])->assertCreated();
    Sanctum::actingAs($handler->user);
    $items = $this->getJson('http://acme.localhost/api/notifications')
        ->assertJsonCount(2, 'data')->json('data');
    expect(collect($items)->whereNull('read_at')->count())->toBe(1)
        ->and(collect($items)->pluck('id')->contains($first))->toBeTrue();
    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertJsonPath('unread_count', 1);
});

test('standalone Ticket Status Priority and Tag changes and staff Public Replies do not notify', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    [$ticket] = conversationTicket($organization);
    $actor = conversationMember($organization, 'Actor');
    $handler = conversationMember($organization, 'Handler');
    $ticket->update(['assigned_member_id' => $handler->id]);
    Sanctum::actingAs($actor->user);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}";

    $this->patchJson($url.'/status', ['status' => 'open'])->assertOk();
    $this->patchJson($url.'/priority', ['priority' => 'urgent'])->assertOk();
    $tag = $this->postJson('http://acme.localhost/api/tags', ['name' => 'Follow up'])
        ->assertCreated()->json('data.id');
    $this->postJson($url.'/tags', ['tag_id' => $tag])->assertOk();
    $this->postJson($url.'/messages', [
        'message_type' => 'public_reply', 'body' => 'Staff response',
    ])->assertCreated();

    Sanctum::actingAs($handler->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
});

test('conversation Notifications roll back with the message and survive live delivery outage', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    [$ticket, $token] = conversationTicket($organization);
    $handler = conversationMember($organization, 'Handler');
    $ticket->update(['assigned_member_id' => $handler->id]);
    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";

    try {
        DB::transaction(function () use ($url, $token) {
            $this->withHeader('X-Customer-Token', $token)
                ->postJson($url, ['message' => 'Rolled back reply'])->assertCreated();
            throw new RuntimeException('abort reply');
        });
    } catch (RuntimeException $error) {
        expect($error->getMessage())->toBe('abort reply');
    }

    Sanctum::actingAs($handler->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    $this->getJson("http://acme.localhost/api/tickets/{$ticket->id}")
        ->assertDontSee('Rolled back reply');

    config(['broadcasting.connections.reverb.host' => '127.0.0.1', 'broadcasting.connections.reverb.port' => 1]);
    $this->withHeader('X-Customer-Token', $token)
        ->postJson($url, ['message' => 'Durable reply'])->assertCreated();
    Sanctum::actingAs($handler->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'customer_public_reply');
    $this->getJson("http://acme.localhost/api/tickets/{$ticket->id}")
        ->assertSee('Durable reply');
});
