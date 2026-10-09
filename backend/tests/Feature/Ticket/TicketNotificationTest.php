<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
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
        expect(DB::table('notifications')->where('recipient_member_id', $member->id)
            ->selectRaw('jsonb_typeof(latest_activity_metadata) as metadata_type')->value('metadata_type'))->toBe('object');
    }
});

test('inbox actions and private Notification channel stay with the current Organization Member', function () {
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
    Sanctum::actingAs($otherUser);
    $otherId = $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')->json('data.0.id');
    Sanctum::actingAs($user);
    $this->postJson("http://acme.localhost/api/notifications/{$betaId}/mark-read")->assertNotFound();
    $this->postJson("http://beta.localhost/api/notifications/{$acmeId}/mark-read")->assertNotFound();
    $this->postJson("http://acme.localhost/api/notifications/{$otherId}/mark-read")->assertNotFound();
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
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

test('reading a Ticket leaves its Notification unread and marking it read retains history', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer', 'email' => 'customer@acme.test',
        'subject' => 'Follow up', 'message' => 'First message',
    ])->assertCreated();
    $ticketId = $created->json('ticket.id');

    Sanctum::actingAs($user);
    $this->getJson("http://acme.localhost/api/tickets/{$ticketId}")->assertOk();
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
    $first = $this->getJson('http://acme.localhost/api/notifications')->json('data.0.id');
    $this->postJson("http://acme.localhost/api/notifications/{$first}/mark-read")
        ->assertOk()->assertJsonPath('data.id', $first)
        ->assertJsonPath('data.activity_type', 'ticket_created');
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 0);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $first);
    expect($this->getJson('http://acme.localhost/api/notifications')->json('data.0.read_at'))->not->toBeNull();
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
