<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(fn () => OrganizationContext::clear());

function assignmentNotificationMember(Organization $organization, string $name): OrganizationMember
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

function assignmentNotificationTicket(Organization $organization): Ticket
{
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@'.$organization->slug.'.test',
    ]);

    return Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Handoff',
    ]);
}

test('Assignment handoff notifies incoming and outgoing handlers but excludes the actor', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $ticket = assignmentNotificationTicket($organization);
    $actor = assignmentNotificationMember($organization, 'Actor');
    $outgoing = assignmentNotificationMember($organization, 'Outgoing');
    $incoming = assignmentNotificationMember($organization, 'Incoming');
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/assign";

    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['member_id' => $outgoing->id])->assertOk();
    $this->postJson($url, ['member_id' => $incoming->id])->assertOk();

    $this->getJson('http://acme.localhost/api/notifications')->assertOk()->assertJsonCount(0, 'data');
    Sanctum::actingAs($outgoing->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'assignment_changed')
        ->assertJsonPath('data.0.ticket_id', $ticket->id)
        ->assertJsonPath('data.0.latest_activity_metadata.to_member_id', $incoming->id);
    Sanctum::actingAs($incoming->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'assignment_changed')
        ->assertJsonPath('data.0.ticket_id', $ticket->id);
});

test('Team and unassigned fallbacks reach only active Organization Members', function () {
    $acme = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $beta = Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $ticket = assignmentNotificationTicket($acme);
    $actor = assignmentNotificationMember($acme, 'Actor');
    $teammate = assignmentNotificationMember($acme, 'Teammate');
    $other = assignmentNotificationMember($acme, 'Other');
    $removed = assignmentNotificationMember($acme, 'Removed');
    $outsider = assignmentNotificationMember($beta, 'Outsider');
    $team = Team::create(['organization_id' => $acme->id, 'name' => 'Support']);
    $team->members()->attach([$actor->id, $teammate->id, $removed->id]);
    $removed->delete();

    Sanctum::actingAs($actor->user);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/assign";
    $this->postJson($url, ['team_id' => $team->id, 'member_id' => null])->assertOk();
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');

    Sanctum::actingAs($teammate->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'assignment_changed');
    Sanctum::actingAs($other->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    Sanctum::actingAs($outsider->user);
    $this->getJson('http://beta.localhost/api/notifications')->assertJsonCount(0, 'data');

    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['team_id' => null, 'member_id' => null])->assertOk();
    Sanctum::actingAs($other->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'assignment_changed');
    Sanctum::actingAs($teammate->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data');
    Sanctum::actingAs($outsider->user);
    $this->getJson('http://beta.localhost/api/notifications')->assertJsonCount(0, 'data');
});

test('repeated Assignment activity updates one unread item and later activity preserves read history', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $ticket = assignmentNotificationTicket($organization);
    $actor = assignmentNotificationMember($organization, 'Actor');
    $recipient = assignmentNotificationMember($organization, 'Recipient');
    Sanctum::actingAs($actor->user);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/assign";
    $this->postJson($url, ['member_id' => $recipient->id])->assertOk();

    Sanctum::actingAs($recipient->user);
    $first = $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')->json('data.0.id');
    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['member_id' => $recipient->id])->assertOk();
    Sanctum::actingAs($recipient->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $first);
    $this->postJson("http://acme.localhost/api/notifications/{$first}/mark-read")->assertOk();

    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['member_id' => $recipient->id])->assertOk();
    Sanctum::actingAs($recipient->user);
    $inbox = $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(2, 'data')->json('data');
    expect(collect($inbox)->whereNull('read_at')->count())->toBe(1)
        ->and(collect($inbox)->pluck('id')->contains($first))->toBeTrue();
    $this->getJson('http://acme.localhost/api/notifications/unread-count')->assertJsonPath('unread_count', 1);
});

test('claim with a Ticket Status transition does not create duplicate Assignment Notifications', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $ticket = assignmentNotificationTicket($organization);
    $claimant = assignmentNotificationMember($organization, 'Claimant');
    $other = assignmentNotificationMember($organization, 'Other');

    Sanctum::actingAs($claimant->user);
    $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/claim")->assertOk()
        ->assertJsonPath('data.status', 'open');
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    Sanctum::actingAs($other->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
});

test('Assignment Notifications roll back with the Ticket and remain stored during live delivery outage', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $ticket = assignmentNotificationTicket($organization);
    $actor = assignmentNotificationMember($organization, 'Actor');
    $recipient = assignmentNotificationMember($organization, 'Recipient');
    $url = "http://acme.localhost/api/tickets/{$ticket->id}/assign";

    Sanctum::actingAs($actor->user);
    try {
        DB::transaction(function () use ($url, $recipient) {
            $this->postJson($url, ['member_id' => $recipient->id])->assertOk();
            throw new RuntimeException('abort Assignment');
        });
    } catch (RuntimeException $error) {
        expect($error->getMessage())->toBe('abort Assignment');
    }

    Sanctum::actingAs($recipient->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(0, 'data');
    $this->getJson("http://acme.localhost/api/tickets/{$ticket->id}")
        ->assertJsonPath('ticket.assigned_member_id', null);

    config(['broadcasting.connections.reverb.host' => '127.0.0.1', 'broadcasting.connections.reverb.port' => 1]);
    Sanctum::actingAs($actor->user);
    $this->postJson($url, ['member_id' => $recipient->id])->assertOk();
    Sanctum::actingAs($recipient->user);
    $this->getJson('http://acme.localhost/api/notifications')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.activity_type', 'assignment_changed');
});
