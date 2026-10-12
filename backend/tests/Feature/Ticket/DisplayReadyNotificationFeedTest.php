<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

function displayReadyMember(Organization $organization, string $name, string $role = 'agent'): OrganizationMember
{
    $user = User::create([
        'name' => $name,
        'email' => strtolower(str_replace(' ', '.', $name)).'@'.$organization->slug.'.test',
        'password' => bcrypt('password'),
    ]);

    return OrganizationMember::create([
        'organization_id' => $organization->id,
        'user_id' => $user->id,
        'role' => $role,
    ]);
}

function displayReadyTicket(Organization $organization, string $subject = 'Help needed'): Ticket
{
    $customer = Customer::firstOrCreate(
        ['organization_id' => $organization->id, 'email' => 'pat@customer.test'],
        ['name' => 'Pat Customer']
    );

    return Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => $subject,
    ]);
}

test('recent mode returns the true five newest Notifications by latest activity independent of unread-first default', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $agent = displayReadyMember($organization, 'Agent Alpha');
    Sanctum::actingAs($agent->user);

    // Create 7 tickets and adjust their automatically generated notifications
    $items = [];
    for ($i = 1; $i <= 7; $i++) {
        $ticket = displayReadyTicket($organization, "Ticket {$i}");
        $activityTime = Carbon::parse("2026-10-12 10:0{$i}:00 UTC");

        // Let items 1 to 4 be UNREAD, and items 5, 6, 7 be READ
        // Item 7 has the most recent activity (10:07), Item 1 has the oldest (10:01)
        $readAt = $i >= 5 ? Carbon::parse("2026-10-12 10:0{$i}:30 UTC") : null;

        $notification = Notification::where('recipient_member_id', $agent->id)
            ->where('ticket_id', $ticket->id)
            ->firstOrFail();

        $notification->update([
            'latest_activity_at' => $activityTime,
            'read_at' => $readAt,
            'created_at' => $activityTime,
            'updated_at' => $activityTime,
        ]);
        $items[$i] = $notification->fresh();
    }

    // 1. Default mode prioritizes unread items first
    $defaultResponse = $this->getJson('http://acme.localhost/api/notifications?per_page=10')->assertOk();
    $defaultData = $defaultResponse->json('data');
    // First 4 items in default mode are unread (items 4, 3, 2, 1)
    expect($defaultData[0]['id'])->toBe($items[4]->id)
        ->and($defaultData[0]['read_at'])->toBeNull()
        ->and($defaultData[3]['id'])->toBe($items[1]->id);

    // 2. Recent mode returns the true 5 newest Notifications by latest activity
    $recentResponse = $this->getJson('http://acme.localhost/api/notifications?mode=recent')->assertOk();
    $recentData = $recentResponse->json('data');

    expect($recentData)->toHaveCount(5)
        // 5 newest are: item 7 (10:07, read), item 6 (10:06, read), item 5 (10:05, read), item 4 (10:04, unread), item 3 (10:03, unread)
        ->and($recentData[0]['id'])->toBe($items[7]->id)
        ->and($recentData[0]['read_at'])->not->toBeNull()
        ->and($recentData[1]['id'])->toBe($items[6]->id)
        ->and($recentData[2]['id'])->toBe($items[5]->id)
        ->and($recentData[3]['id'])->toBe($items[4]->id)
        ->and($recentData[4]['id'])->toBe($items[3]->id);

    // Also verify recent=1 query param alias
    $aliasResponse = $this->getJson('http://acme.localhost/api/notifications?recent=1')->assertOk();
    expect($aliasResponse->json('data'))->toHaveCount(5)
        ->and($aliasResponse->json('data.0.id'))->toBe($items[7]->id);
});

test('unread filter paginates only unread Notifications with accurate totals', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $agent = displayReadyMember($organization, 'Agent Beta');
    Sanctum::actingAs($agent->user);

    // Create 3 unread notifications and 4 read notifications (total 7)
    for ($i = 1; $i <= 7; $i++) {
        $ticket = displayReadyTicket($organization, "Ticket {$i}");
        $time = Carbon::parse("2026-10-12 11:0{$i}:00 UTC");
        $isUnread = $i <= 3; // items 1, 2, 3 unread; items 4, 5, 6, 7 read

        Notification::where('recipient_member_id', $agent->id)
            ->where('ticket_id', $ticket->id)
            ->update([
                'latest_activity_at' => $time,
                'read_at' => $isUnread ? null : $time,
                'created_at' => $time,
                'updated_at' => $time,
            ]);
    }

    // Default pagination total is 7
    $this->getJson('http://acme.localhost/api/notifications')
        ->assertOk()
        ->assertJsonPath('total', 7);

    // Unread filter paginates only unread items with accurate total (3)
    $page1 = $this->getJson('http://acme.localhost/api/notifications?filter=unread&per_page=2')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('total', 3)
        ->assertJsonPath('last_page', 2)
        ->assertJsonPath('current_page', 1);

    expect(collect($page1->json('data'))->every(fn ($item) => $item['read_at'] === null))->toBeTrue();

    // Page 2 returns the remaining 1 unread item
    $page2 = $this->getJson('http://acme.localhost/api/notifications?filter=unread&per_page=2&page=2')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('total', 3)
        ->assertJsonPath('current_page', 2);

    expect($page2->json('data.0.read_at'))->toBeNull();

    // Also verify unread=1 and status=unread aliases
    $this->getJson('http://acme.localhost/api/notifications?unread=1')
        ->assertOk()
        ->assertJsonPath('total', 3);

    $this->getJson('http://acme.localhost/api/notifications?status=unread')
        ->assertOk()
        ->assertJsonPath('total', 3);
});

test('authorized rows provide Ticket Number, subject, activity, actor when available, and time', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $agent = displayReadyMember($organization, 'Agent Gamma');
    $actorMember = displayReadyMember($organization, 'Staff Reassigner');
    $ticket = displayReadyTicket($organization, 'Billing Dispute');
    $secondTicket = displayReadyTicket($organization, 'Feedback Ticket');

    Sanctum::actingAs($agent->user);

    $time = Carbon::parse('2026-10-12 12:30:00 UTC');
    $customerTime = Carbon::parse('2026-10-12 12:45:00 UTC');

    // 1. Notification with actor member (e.g. assignment_changed) on ticket 1
    Notification::where('recipient_member_id', $agent->id)
        ->where('ticket_id', $ticket->id)
        ->update([
            'activity_type' => 'assignment_changed',
            'latest_activity_metadata' => [
                'to_member_id' => $agent->id,
                'actor_member_id' => $actorMember->id,
            ],
            'latest_activity_at' => $time,
            'created_at' => $time,
            'updated_at' => $time,
        ]);

    // 2. Notification with customer actor (e.g. customer_public_reply) on ticket 2
    Notification::where('recipient_member_id', $agent->id)
        ->where('ticket_id', $secondTicket->id)
        ->update([
            'activity_type' => 'customer_public_reply',
            'latest_activity_metadata' => [
                'message_id' => (string) Str::uuid(),
            ],
            'latest_activity_at' => $customerTime,
            'created_at' => $customerTime,
            'updated_at' => $customerTime,
        ]);

    $response = $this->getJson('http://acme.localhost/api/notifications')->assertOk();
    $data = $response->json('data');

    // Most recent is customer_public_reply
    $customerReplyRow = $data[0];
    expect($customerReplyRow['ticket_number'])->toBe($secondTicket->ticket_number)
        ->and($customerReplyRow['subject'])->toBe('Feedback Ticket')
        ->and($customerReplyRow['activity'])->toBe('customer_public_reply')
        ->and($customerReplyRow['activity_type'])->toBe('customer_public_reply')
        ->and($customerReplyRow['actor'])->not->toBeNull()
        ->and($customerReplyRow['actor']['name'])->toBe('Pat Customer')
        ->and($customerReplyRow['actor']['email'])->toBe('pat@customer.test')
        ->and($customerReplyRow['time'])->not->toBeNull()
        ->and($customerReplyRow['ticket'])->not->toBeNull()
        ->and($customerReplyRow['ticket']['ticket_number'])->toBe($secondTicket->ticket_number)
        ->and($customerReplyRow['ticket']['subject'])->toBe('Feedback Ticket');

    // Second row is assignment_changed with actor member
    $assignmentRow = $data[1];
    expect($assignmentRow['ticket_number'])->toBe($ticket->ticket_number)
        ->and($assignmentRow['subject'])->toBe('Billing Dispute')
        ->and($assignmentRow['activity'])->toBe('assignment_changed')
        ->and($assignmentRow['actor'])->not->toBeNull()
        ->and($assignmentRow['actor']['name'])->toBe('Staff Reassigner')
        ->and($assignmentRow['actor']['email'])->toBe('staff.reassigner@acme.test')
        ->and($assignmentRow['time'])->not->toBeNull();
});

test('safe unavailable fallbacks apply when Ticket is deleted or actor is unavailable', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $agent = displayReadyMember($organization, 'Agent Delta');
    $actorMember = displayReadyMember($organization, 'Temporary Staff');
    $ticket = displayReadyTicket($organization, 'Temporary Ticket');

    Sanctum::actingAs($agent->user);

    $time = Carbon::parse('2026-10-12 13:00:00 UTC');

    $notification = Notification::where('recipient_member_id', $agent->id)
        ->where('ticket_id', $ticket->id)
        ->firstOrFail();

    $notification->update([
        'activity_type' => 'internal_note',
        'latest_activity_metadata' => [
            'actor_member_id' => $actorMember->id,
        ],
        'latest_activity_at' => $time,
        'created_at' => $time,
        'updated_at' => $time,
    ]);

    // Soft-delete the ticket
    $ticket->delete();

    // Remove the actor member
    $actorMember->delete();

    // Feed still succeeds and provides safe fallbacks
    $response = $this->getJson('http://acme.localhost/api/notifications')->assertOk();
    $data = $response->json('data');

    expect($data)->toHaveCount(1);
    $row = $data[0];

    // Notification identity and activity/time are preserved
    expect($row['id'])->toBe($notification->id)
        ->and($row['activity'])->toBe('internal_note')
        ->and($row['activity_type'])->toBe('internal_note')
        ->and($row['time'])->not->toBeNull()
        // Deleted ticket details safely fall back
        ->and($row['ticket_number'])->toBeNull()
        ->and($row['subject'])->toBeNull()
        ->and($row['ticket'])->toBeNull()
        // Unavailable actor safely falls back
        ->and($row['actor'])->toBeNull();
});

test('current Organization Member scoping and cross-Organization denial are enforced', function () {
    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);

    $user = User::create(['name' => 'Multi Member', 'email' => 'multi@example.test', 'password' => bcrypt('password')]);
    $outsiderUser = User::create(['name' => 'Outsider', 'email' => 'outsider@beta.test', 'password' => bcrypt('password')]);

    $acmeMember = OrganizationMember::create(['organization_id' => $acme->id, 'user_id' => $user->id, 'role' => 'agent']);
    $betaMember = OrganizationMember::create(['organization_id' => $beta->id, 'user_id' => $user->id, 'role' => 'agent']);
    $outsiderMember = OrganizationMember::create(['organization_id' => $beta->id, 'user_id' => $outsiderUser->id, 'role' => 'agent']);

    $acmeTicket = displayReadyTicket($acme, 'Acme Secret Work');
    $betaTicket = displayReadyTicket($beta, 'Beta Secret Work');

    $acmeNotification = Notification::where('recipient_member_id', $acmeMember->id)->where('ticket_id', $acmeTicket->id)->firstOrFail();
    $betaNotification = Notification::where('recipient_member_id', $betaMember->id)->where('ticket_id', $betaTicket->id)->firstOrFail();

    // 1. User authenticated in Acme sees only Acme notification
    Sanctum::actingAs($user);
    $acmeFeed = $this->getJson('http://acme.localhost/api/notifications')->assertOk();
    expect($acmeFeed->json('data'))->toHaveCount(1)
        ->and($acmeFeed->json('data.0.id'))->toBe($acmeNotification->id)
        ->and($acmeFeed->json('data.0.subject'))->toBe('Acme Secret Work');

    // User authenticated in Beta sees only Beta notification
    $betaFeed = $this->getJson('http://beta.localhost/api/notifications')->assertOk();
    expect($betaFeed->json('data'))->toHaveCount(1)
        ->and($betaFeed->json('data.0.id'))->toBe($betaNotification->id)
        ->and($betaFeed->json('data.0.subject'))->toBe('Beta Secret Work');

    // 2. Cross-organization mark-read is denied (404/not found in current org inbox)
    $this->postJson("http://acme.localhost/api/notifications/{$betaNotification->id}/mark-read")->assertNotFound();
    $this->postJson("http://beta.localhost/api/notifications/{$acmeNotification->id}/mark-read")->assertNotFound();

    // 3. Outsider user who only belongs to Beta is forbidden on Acme endpoint
    Sanctum::actingAs($outsiderUser);
    $this->getJson('http://acme.localhost/api/notifications')->assertForbidden();
    $this->getJson('http://acme.localhost/api/notifications?mode=recent')->assertForbidden();
    $this->getJson('http://acme.localhost/api/notifications?filter=unread')->assertForbidden();
    $this->postJson("http://acme.localhost/api/notifications/{$acmeNotification->id}/mark-read")->assertForbidden();

    // 4. Removed member is forbidden
    Sanctum::actingAs($user);
    OrganizationMember::whereKey($acmeMember->id)->delete();
    $this->getJson('http://acme.localhost/api/notifications')->assertForbidden();
});

test('existing mark-read unread-count and mark-all-read contracts remain compatible', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $agent = displayReadyMember($organization, 'Agent Epsilon');
    $ticket = displayReadyTicket($organization, 'Contract Compatibility');
    $secondTicket = displayReadyTicket($organization, 'Contract Second Ticket');

    Sanctum::actingAs($agent->user);

    $time = Carbon::parse('2026-10-12 15:00:00 UTC');
    $n1 = Notification::where('recipient_member_id', $agent->id)->where('ticket_id', $ticket->id)->firstOrFail();
    $n1->update([
        'latest_activity_at' => $time,
        'read_at' => null,
        'created_at' => $time,
        'updated_at' => $time,
    ]);

    $n2 = Notification::where('recipient_member_id', $agent->id)->where('ticket_id', $secondTicket->id)->firstOrFail();
    $n2->update([
        'latest_activity_at' => $time->copy()->addMinutes(1),
        'read_at' => null,
        'created_at' => $time->copy()->addMinutes(1),
        'updated_at' => $time->copy()->addMinutes(1),
    ]);

    // Unread count is 2
    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertOk()
        ->assertJsonPath('unread_count', 2);

    // Mark single notification read
    $markResponse = $this->postJson("http://acme.localhost/api/notifications/{$n1->id}/mark-read")
        ->assertOk()
        ->assertJsonPath('data.id', $n1->id)
        ->assertJsonPath('data.activity_type', 'ticket_created')
        ->assertJsonPath('data.ticket_number', $ticket->ticket_number)
        ->assertJsonPath('data.subject', 'Contract Compatibility');

    expect($markResponse->json('data.read_at'))->not->toBeNull();

    // Unread count is now 1
    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertOk()
        ->assertJsonPath('unread_count', 1);

    // Mark all read
    $this->postJson('http://acme.localhost/api/notifications/mark-all-read')
        ->assertOk()
        ->assertJsonPath('marked_read', 1);

    $this->getJson('http://acme.localhost/api/notifications/unread-count')
        ->assertOk()
        ->assertJsonPath('unread_count', 0);
});
