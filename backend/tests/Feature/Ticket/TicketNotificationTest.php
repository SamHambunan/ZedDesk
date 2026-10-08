<?php

use App\Context\OrganizationContext;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Customer;
use App\Models\Ticket;
use App\Models\Team;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('customer Ticket creation leaves a durable inbox item for each active Organization Member', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $members = collect(range(1, 2))->map(function ($number) use ($organization) {
        $user = User::create(['name' => "Agent {$number}", 'email' => "agent{$number}@acme.test", 'password' => bcrypt('password')]);

        return OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    });

    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer', 'email' => 'customer@acme.test',
        'subject' => 'New work', 'message' => 'Please help',
    ])->assertCreated();

    foreach ($members as $member) {
        Sanctum::actingAs($member->user);
        $this->getJson('http://acme.localhost/api/notifications/unread-count')
            ->assertOk()->assertJsonPath('unread_count', 1);
        $this->getJson('http://acme.localhost/api/notifications')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.ticket_id', $created->json('ticket.id'))
            ->assertJsonPath('data.0.activity_type', 'ticket_created')
            ->assertJsonPath('data.0.recipient_member_id', $member->id);
    }
});

test('inbox actions and private Notification channel stay with the current Organization Member', function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    Carbon::setTestNow('2026-10-07 12:01:00 UTC');
    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@example.test', 'password' => bcrypt('password')]);
    $otherUser = User::create(['name' => 'Other', 'email' => 'other@example.test', 'password' => bcrypt('password')]);
    $acmeMember = OrganizationMember::create(['organization_id' => $acme->id, 'user_id' => $user->id, 'role' => 'agent']);
    $otherMember = OrganizationMember::create(['organization_id' => $acme->id, 'user_id' => $otherUser->id, 'role' => 'agent']);
    $betaMember = OrganizationMember::create(['organization_id' => $beta->id, 'user_id' => $user->id, 'role' => 'agent']);

    foreach (['acme', 'beta'] as $slug) {
        $this->postJson("http://{$slug}.localhost/api/portal/tickets", [
            'name' => 'Customer', 'email' => "customer@{$slug}.test",
            'subject' => "{$slug} ticket", 'message' => 'Please help',
        ])->assertCreated();
    }

    Sanctum::actingAs($user);
    $acmeId = $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')->json('data.0.id');
    $betaId = $this->getJson('http://beta.localhost/api/notifications')->assertJsonCount(1, 'data')->json('data.0.id');
    $this->postJson("http://acme.localhost/api/notifications/{$betaId}/mark-read")->assertNotFound();
    $this->postJson("http://beta.localhost/api/notifications/{$acmeId}/mark-read")->assertNotFound();
    $channel = $this->getJson('http://acme.localhost/api/live/notification-channel')->assertOk()->json('channel');
    expect($channel)->toBe('private-organization.'.$acme->id.'.member.'.$acmeMember->id.'.notifications.'.intdiv(Carbon::now()->timestamp, 300));
    $auth = fn ($slug, $name) => $this->postJson("http://{$slug}.localhost/api/broadcasting/auth", [
        'socket_id' => '123.456', 'channel_name' => $name,
    ]);
    $auth('acme', $channel)->assertOk();
    $auth('beta', $channel)->assertForbidden();
    $otherChannel = 'private-organization.'.$acme->id.'.member.'.$otherMember->id.'.notifications.'.intdiv(Carbon::now()->timestamp, 300);
    $auth('acme', $otherChannel)->assertForbidden();
    Carbon::setTestNow('2026-10-07 12:06:00 UTC');
    $auth('acme', $channel)->assertForbidden();
    OrganizationMember::whereKey($acmeMember->id)->delete();
    $this->getJson('http://acme.localhost/api/notifications')->assertForbidden();
    $auth('acme', 'private-organization.'.$acme->id.'.member.'.$acmeMember->id.'.notifications.'.intdiv(Carbon::now()->timestamp, 300))
        ->assertForbidden();
    $this->getJson('http://beta.localhost/api/notifications')->assertOk();
    expect($betaMember->id)->not->toBe($acmeMember->id);
});

test('reading a Ticket leaves the inbox unread and later Customer activity creates a fresh unread item', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer', 'email' => 'customer@acme.test',
        'subject' => 'Follow up', 'message' => 'First message',
    ])->assertCreated();
    $ticketId = $created->json('ticket.id');
    $token = $created->json('token');

    Sanctum::actingAs($user);
    $this->getJson("http://acme.localhost/api/tickets/{$ticketId}")->assertOk();
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
    $first = $this->getJson('http://acme.localhost/api/notifications')->json('data.0.id');
    $this->postJson("http://acme.localhost/api/notifications/{$first}/mark-read")
        ->assertOk()->assertJsonPath('data.id', $first);
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 0);

    $this->withHeader('X-Customer-Token', $token)
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticketId}/reply", ['message' => 'Second message'])
        ->assertCreated();

    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.activity_type', 'customer_public_reply')
        ->assertJsonPath('data.1.id', $first);
});

test('assignment and Internal Notes update only the handling member inbox and preserve read history', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $actors = collect(['alice', 'bob', 'cara'])->mapWithKeys(function ($name) use ($organization) {
        $user = User::create(['name' => ucfirst($name), 'email' => "{$name}@acme.test", 'password' => bcrypt('password')]);
        $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);

        return [$name => compact('user', 'member')];
    });
    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer', 'email' => 'customer@acme.test',
        'subject' => 'Routing', 'message' => 'Please help',
    ])->assertCreated();
    $ticketId = $created->json('ticket.id');

    Sanctum::actingAs($actors['alice']['user']);
    $this->postJson("http://acme.localhost/api/tickets/{$ticketId}/assign", [
        'member_id' => $actors['bob']['member']->id,
    ])->assertOk();
    $this->postJson("http://acme.localhost/api/tickets/{$ticketId}/messages", [
        'message_type' => 'internal_note', 'body' => 'Private follow up',
    ])->assertCreated();
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'ticket_created');

    Sanctum::actingAs($actors['bob']['user']);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'internal_note');
    $readId = $this->getJson('http://acme.localhost/api/notifications')->json('data.0.id');
    $this->postJson("http://acme.localhost/api/notifications/{$readId}/mark-read")->assertOk();

    Sanctum::actingAs($actors['cara']['user']);
    $this->postJson("http://acme.localhost/api/notifications/{$readId}/mark-read")->assertNotFound();
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk()->assertJsonPath('marked_read', 1);

    Sanctum::actingAs($actors['alice']['user']);
    $this->postJson("http://acme.localhost/api/tickets/{$ticketId}/messages", [
        'message_type' => 'internal_note', 'body' => 'More private work',
    ])->assertCreated();
    Sanctum::actingAs($actors['bob']['user']);
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.activity_type', 'internal_note')
        ->assertJsonPath('data.1.id', $readId);
});

test('rolled-back Ticket creation leaves no inbox item', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);

    try {
        DB::transaction(function () use ($organization, $customer) {
            Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Aborted']);
            throw new RuntimeException('abort write');
        });
    } catch (RuntimeException $error) {
        expect($error->getMessage())->toBe('abort write');
    }

    Sanctum::actingAs($user);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 0);
});

test('inbox pagination and mark-all-read apply only to the active Organization', function () {
    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@example.test', 'password' => bcrypt('password')]);
    foreach ([$acme, $beta] as $organization) {
        OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    }
    foreach (['acme', 'acme', 'acme', 'beta'] as $index => $slug) {
        $this->postJson("http://{$slug}.localhost/api/portal/tickets", [
            'name' => 'Customer', 'email' => "customer@{$slug}.test",
            'subject' => "Ticket {$index}", 'message' => 'Please help',
        ])->assertCreated();
    }

    Sanctum::actingAs($user);
    $this->getJson('http://acme.localhost/api/notifications?per_page=2')->assertOk()
        ->assertJsonCount(2, 'data')->assertJsonPath('total', 3)->assertJsonPath('last_page', 2);
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk()
        ->assertJsonPath('marked_read', 3);
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 0);
    $this->getJson('http://beta.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
});

test('Team Assignment routes later Customer activity to active Team members only', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $actors = collect(['alice', 'bob', 'cara'])->mapWithKeys(function ($name) use ($organization) {
        $user = User::create(['name' => ucfirst($name), 'email' => "{$name}@acme.test", 'password' => bcrypt('password')]);
        $member = OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);

        return [$name => compact('user', 'member')];
    });
    $team = Team::create(['organization_id' => $organization->id, 'name' => 'Support']);
    $team->members()->attach($actors['bob']['member']->id);
    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer', 'email' => 'customer@acme.test',
        'subject' => 'Team work', 'message' => 'Please help',
    ])->assertCreated();
    $ticketId = $created->json('ticket.id');

    Sanctum::actingAs($actors['alice']['user']);
    $this->postJson("http://acme.localhost/api/tickets/{$ticketId}/assign", ['team_id' => $team->id])->assertOk();
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk();
    Sanctum::actingAs($actors['bob']['user']);
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk();
    Sanctum::actingAs($actors['cara']['user']);
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')->assertOk();

    $this->withHeader('X-Customer-Token', $created->json('token'))
        ->postJson("http://acme.localhost/api/portal/tickets/{$ticketId}/reply", ['message' => 'A follow up'])
        ->assertCreated();

    Sanctum::actingAs($actors['bob']['user']);
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonPath('data.0.activity_type', 'customer_public_reply');
    foreach (['alice', 'cara'] as $name) {
        Sanctum::actingAs($actors[$name]['user']);
        $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 0);
    }
});
