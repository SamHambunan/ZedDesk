<?php

use App\Context\OrganizationContext;
use App\Exceptions\ImmutableAssignmentException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Help with routing',
    ]);

    $this->acmeUser = User::create([
        'name' => 'Agent One',
        'email' => 'agent1@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $this->acmeMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeUser->id,
        'role' => 'agent',
    ]);

    $this->acmeTeam = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tier 1 Support',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket_assignments table has expected schema and uuid primary key', function () {
    expect(Schema::hasTable('ticket_assignments'))->toBeTrue();

    expect(Schema::hasColumns('ticket_assignments', [
        'id',
        'organization_id',
        'ticket_id',
        'team_id',
        'member_id',
        'assigned_by_id',
        'created_at',
    ]))->toBeTrue();
});

test('foreign key cascade deletes ticket assignments when ticket is deleted', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    $assignmentId = $assignment->id;
    $this->acmeTicket->forceDelete();

    $this->assertDatabaseMissing('ticket_assignments', [
        'id' => $assignmentId,
    ]);
});

test('foreign key cascade deletes ticket assignments when organization is deleted', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    $assignmentId = $assignment->id;
    $this->acmeOrg->delete();

    $this->assertDatabaseMissing('ticket_assignments', [
        'id' => $assignmentId,
    ]);
});

test('foreign keys for team, member, and assigned_by nullify on delete', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    $this->acmeTeam->delete();
    $assignment->refresh();
    expect($assignment->team_id)->toBeNull()
        ->and($assignment->member_id)->toBe($this->acmeMember->id);

    $this->acmeMember->delete();
    $assignment->refresh();
    expect($assignment->member_id)->toBeNull()
        ->and($assignment->assigned_by_id)->toBeNull();
});

test('ticket assignment model has valid relationships and uuid key', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    expect($assignment->id)->toBeString()
        ->and(Str::isUuid($assignment->id))->toBeTrue()
        ->and($assignment->ticket->id)->toBe($this->acmeTicket->id)
        ->and($assignment->team->id)->toBe($this->acmeTeam->id)
        ->and($assignment->member->id)->toBe($this->acmeMember->id)
        ->and($assignment->assignedBy->id)->toBe($this->acmeMember->id)
        ->and($assignment->organization->id)->toBe($this->acmeOrg->id);

    // Ticket inverse relation
    expect($this->acmeTicket->assignments)->toHaveCount(1)
        ->and($this->acmeTicket->assignments->first()->id)->toBe($assignment->id);
});

test('existing ticket assignment strictly rejects update operations on model', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    expect(function () use ($assignment) {
        $assignment->update(['team_id' => null]);
    })->toThrow(ImmutableAssignmentException::class);
});

test('existing ticket assignment strictly rejects delete operations on model', function () {
    $assignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    expect(function () use ($assignment) {
        $assignment->delete();
    })->toThrow(ImmutableAssignmentException::class);
});

test('bulk update and delete queries on ticket assignments are strictly rejected', function () {
    TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    expect(function () {
        TicketAssignment::where('ticket_id', $this->acmeTicket->id)->update(['team_id' => null]);
    })->toThrow(ImmutableAssignmentException::class);

    expect(function () {
        TicketAssignment::where('ticket_id', $this->acmeTicket->id)->delete();
    })->toThrow(ImmutableAssignmentException::class);
});

test('ticket assignment audit trail can be queried chronologically', function () {
    $first = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => null,
        'assigned_by_id' => $this->acmeMember->id,
        'created_at' => now()->subMinutes(10),
    ]);

    $second = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
        'created_at' => now()->subMinutes(5),
    ]);

    $third = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => null,
        'member_id' => null,
        'assigned_by_id' => $this->acmeMember->id,
        'created_at' => now(),
    ]);

    $history = $this->acmeTicket->assignments()->get();

    expect($history)->toHaveCount(3)
        ->and($history[0]->id)->toBe($first->id)
        ->and($history[1]->id)->toBe($second->id)
        ->and($history[2]->id)->toBe($third->id);
});

test('ticket assignment enforces automatic tenant query scoping', function () {
    $acmeAssignment = TicketAssignment::create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->acmeTeam->id,
        'member_id' => $this->acmeMember->id,
        'assigned_by_id' => $this->acmeMember->id,
    ]);

    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => Customer::create([
            'organization_id' => $this->betaOrg->id,
            'email' => 'beta@customer.com',
            'name' => 'Beta Customer',
        ])->id,
        'subject' => 'Beta ticket',
    ]);

    $betaAssignment = TicketAssignment::create([
        'organization_id' => $this->betaOrg->id,
        'ticket_id' => $betaTicket->id,
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);
    $acmeResults = TicketAssignment::all();
    expect($acmeResults)->toHaveCount(1)
        ->and($acmeResults->first()->id)->toBe($acmeAssignment->id);

    OrganizationContext::setCurrent($this->betaOrg);
    $betaResults = TicketAssignment::all();
    expect($betaResults)->toHaveCount(1)
        ->and($betaResults->first()->id)->toBe($betaAssignment->id);
});

test('ticket assignment factory generates valid instance', function () {
    $assignment = TicketAssignment::factory()->create([
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
    ]);

    expect($assignment->id)->toBeString()
        ->and(Str::isUuid($assignment->id))->toBeTrue()
        ->and($assignment->organization_id)->toBe($this->acmeOrg->id)
        ->and($assignment->ticket_id)->toBe($this->acmeTicket->id);
});
