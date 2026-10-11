<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Assignment conflict',
    ]);
    $this->team = Team::create(['organization_id' => $organization->id, 'name' => 'Support']);
    $this->otherTeam = Team::create(['organization_id' => $organization->id, 'name' => 'Escalation']);
    $this->members = collect(['Ada', 'Ben'])->map(function ($name) use ($organization) {
        $user = User::create([
            'name' => $name,
            'email' => strtolower($name).'@acme.test',
            'password' => bcrypt('password'),
        ]);
        $member = OrganizationMember::create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'agent',
        ]);

        return [$user, $member];
    });
    $this->url = "http://acme.localhost/api/tickets/{$this->ticket->id}";
    Event::fake([TicketChanged::class]);
});

afterEach(fn () => OrganizationContext::clear());

test('a stale Assignment edit returns the current pair and does not write or signal', function () {
    Sanctum::actingAs($this->members[0][0]);
    $read = $this->getJson($this->url)->assertOk()->json('ticket');
    expect($read['assignment_revision'])->toBe(1);

    $this->postJson($this->url.'/assign', [
        'team_id' => $this->team->id,
        'expected_assignment_revision' => $read['assignment_revision'],
    ])->assertOk();

    Sanctum::actingAs($this->members[1][0]);
    $this->postJson($this->url.'/assign', [
        'member_id' => $this->members[1][1]->id,
        'expected_assignment_revision' => $read['assignment_revision'],
    ])->assertStatus(409)
        ->assertJsonPath('current.assigned_team_id', $this->team->id)
        ->assertJsonPath('current.assigned_member_id', null)
        ->assertJsonPath('current.assignment_revision', 2)
        ->assertJsonPath('current.revision', 2);

    expect($this->ticket->fresh()->assigned_member_id)->toBeNull();
    $this->assertDatabaseCount('ticket_assignments', 1);
    Event::assertDispatchedTimes(TicketChanged::class, 1);
});

test('a stale claim conflicts when only the Team changed and can recover using current state', function () {
    Sanctum::actingAs($this->members[0][0]);
    $revision = $this->getJson($this->url)->assertOk()->json('ticket.assignment_revision');
    $this->postJson($this->url.'/assign', ['team_id' => $this->team->id])->assertOk();

    $this->postJson($this->url.'/claim', [
        'expected_assignment_revision' => $revision,
    ])->assertStatus(409)
        ->assertJsonPath('current.assigned_team_id', $this->team->id)
        ->assertJsonPath('current.assigned_member_id', null)
        ->assertJsonPath('current.assignment_revision', 2);

    $this->team->members()->attach($this->members[0][1]->id);
    $this->postJson($this->url.'/claim', [
        'expected_assignment_revision' => 2,
    ])->assertOk()
        ->assertJsonPath('data.assigned_team_id', $this->team->id)
        ->assertJsonPath('data.assigned_member_id', $this->members[0][1]->id)
        ->assertJsonPath('data.assignment_revision', 3);
});

test('Status and Priority changes do not invalidate an Assignment edit', function () {
    Sanctum::actingAs($this->members[0][0]);
    $revision = $this->getJson($this->url)->assertOk()->json('ticket.assignment_revision');
    $this->patchJson($this->url.'/status', ['status' => 'open'])->assertOk();
    $this->patchJson($this->url.'/priority', ['priority' => 'high'])->assertOk();

    $this->postJson($this->url.'/assign', [
        'team_id' => $this->team->id,
        'expected_assignment_revision' => $revision,
    ])->assertOk()
        ->assertJsonPath('data.assignment_revision', 2)
        ->assertJsonPath('data.status', 'open')
        ->assertJsonPath('data.priority', 'high');
});

test('the Assignment revision covers both fields and rejects an earlier read after the pair returns to its old values', function () {
    Sanctum::actingAs($this->members[0][0]);
    $read = $this->getJson($this->url)->assertOk()->json('ticket');
    $this->team->members()->attach($this->members[0][1]->id);

    $this->postJson($this->url.'/assign', [
        'team_id' => $this->team->id,
        'member_id' => $this->members[0][1]->id,
        'expected_assignment_revision' => $read['assignment_revision'],
    ])->assertOk()->assertJsonPath('data.assignment_revision', 2);

    $this->postJson($this->url.'/assign', [
        'team_id' => null,
        'member_id' => null,
        'expected_assignment_revision' => 2,
    ])->assertOk()->assertJsonPath('data.assignment_revision', 3);

    $this->postJson($this->url.'/assign', [
        'team_id' => $this->otherTeam->id,
        'expected_assignment_revision' => $read['assignment_revision'],
    ])->assertStatus(409)
        ->assertJsonPath('current.assigned_team_id', null)
        ->assertJsonPath('current.assigned_member_id', null)
        ->assertJsonPath('current.assignment_revision', 3);

    $this->assertDatabaseCount('ticket_assignments', 2);
    Event::assertDispatchedTimes(TicketChanged::class, 2);
});

test('a partial Assignment edit preserves the Team selected by another member', function () {
    Sanctum::actingAs($this->members[0][0]);
    $this->team->members()->attach($this->members[0][1]->id);
    $this->postJson($this->url.'/assign', ['team_id' => $this->team->id])->assertOk();

    $this->postJson($this->url.'/assign', [
        'member_id' => $this->members[0][1]->id,
    ])->assertOk()
        ->assertJsonPath('data.assigned_team_id', $this->team->id)
        ->assertJsonPath('data.assigned_member_id', $this->members[0][1]->id);
});
