<?php

use App\Context\OrganizationContext;
use App\Enums\TicketStatus;
use App\Events\TicketAssigned;
use App\Exceptions\InvalidAssignmentException;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use App\Models\User;
use App\Rules\MemberBelongsToTeam;
use App\Services\TicketAssignmentService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Validator;

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

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Issue with router',
        'status' => TicketStatus::NEW,
    ]);

    $this->user1 = User::create([
        'name' => 'Support Agent 1',
        'email' => 'agent1@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $this->user2 = User::create([
        'name' => 'Support Agent 2',
        'email' => 'agent2@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $this->otherOrgUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.com',
        'password' => bcrypt('password123'),
    ]);

    $this->acmeMember1 = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->user1->id,
        'role' => 'agent',
    ]);

    $this->acmeMember2 = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->user2->id,
        'role' => 'agent',
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->otherOrgUser->id,
        'role' => 'agent',
    ]);

    $this->billingTeam = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Team',
    ]);

    $this->techTeam = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Technical Support',
    ]);

    // Member 1 belongs only to Billing Team
    $this->billingTeam->members()->attach($this->acmeMember1->id);

    // Member 2 belongs only to Technical Support Team
    $this->techTeam->members()->attach($this->acmeMember2->id);

    $this->assignmentService = app(TicketAssignmentService::class);
});

afterEach(function () {
    OrganizationContext::clear();
    Carbon::setTestNow();
});

test('validation rule MemberBelongsToTeam passes when member belongs to the designated team', function () {
    $validator = Validator::make([
        'assigned_team_id' => $this->billingTeam->id,
        'assigned_member_id' => $this->acmeMember1->id,
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam($this->billingTeam->id)],
    ]);

    expect($validator->passes())->toBeTrue();
});

test('validation rule MemberBelongsToTeam fails when member is not in the designated team', function () {
    $validator = Validator::make([
        'assigned_team_id' => $this->billingTeam->id,
        'assigned_member_id' => $this->acmeMember2->id, // Member 2 is on techTeam, not billingTeam
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam($this->billingTeam->id)],
    ]);

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->first('assigned_member_id'))->toContain('not a member of the designated team');
});

test('validation rule MemberBelongsToTeam passes when member or team is null', function () {
    $validator1 = Validator::make([
        'assigned_team_id' => $this->billingTeam->id,
        'assigned_member_id' => null,
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam($this->billingTeam->id)],
    ]);
    expect($validator1->passes())->toBeTrue();

    $validator2 = Validator::make([
        'assigned_team_id' => null,
        'assigned_member_id' => $this->acmeMember1->id,
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam(null)],
    ]);
    expect($validator2->passes())->toBeTrue();
});

test('validation rule MemberBelongsToTeam resolves team from data when omitted in constructor', function () {
    $validator = Validator::make([
        'assigned_team_id' => $this->billingTeam->id,
        'assigned_member_id' => $this->acmeMember2->id,
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam],
    ]);

    expect($validator->fails())->toBeTrue();

    $validatorValid = Validator::make([
        'assigned_team_id' => $this->billingTeam->id,
        'assigned_member_id' => $this->acmeMember1->id,
    ], [
        'assigned_member_id' => [new MemberBelongsToTeam],
    ]);

    expect($validatorValid->passes())->toBeTrue();
});

test('assignment service assigns dual pointers, creates immutable audit record, and fires TicketAssigned event', function () {
    Event::fake([TicketAssigned::class]);

    $assignment = $this->assignmentService->assign(
        ticket: $this->acmeTicket,
        team: $this->billingTeam,
        member: $this->acmeMember1,
        assignedBy: $this->acmeMember2
    );

    expect($this->acmeTicket->fresh()->assigned_team_id)->toBe($this->billingTeam->id)
        ->and($this->acmeTicket->fresh()->assigned_member_id)->toBe($this->acmeMember1->id)
        ->and($assignment)->toBeInstanceOf(TicketAssignment::class)
        ->and($assignment->organization_id)->toBe($this->acmeOrg->id)
        ->and($assignment->ticket_id)->toBe($this->acmeTicket->id)
        ->and($assignment->team_id)->toBe($this->billingTeam->id)
        ->and($assignment->member_id)->toBe($this->acmeMember1->id)
        ->and($assignment->assigned_by_id)->toBe($this->acmeMember2->id);

    $this->assertDatabaseHas('ticket_assignments', [
        'id' => $assignment->id,
        'organization_id' => $this->acmeOrg->id,
        'ticket_id' => $this->acmeTicket->id,
        'team_id' => $this->billingTeam->id,
        'member_id' => $this->acmeMember1->id,
        'assigned_by_id' => $this->acmeMember2->id,
    ]);

    Event::assertDispatched(TicketAssigned::class, function (TicketAssigned $event) use ($assignment) {
        return $event->ticket->id === $this->acmeTicket->id
            && $event->assignment->id === $assignment->id;
    });
});

test('assignment service allows assigning team only with null member', function () {
    Event::fake([TicketAssigned::class]);

    $assignment = $this->assignmentService->assign(
        ticket: $this->acmeTicket,
        team: $this->billingTeam,
        member: null,
        assignedBy: $this->acmeMember1
    );

    expect($this->acmeTicket->fresh()->assigned_team_id)->toBe($this->billingTeam->id)
        ->and($this->acmeTicket->fresh()->assigned_member_id)->toBeNull()
        ->and($assignment->team_id)->toBe($this->billingTeam->id)
        ->and($assignment->member_id)->toBeNull();

    Event::assertDispatched(TicketAssigned::class);
});

test('assignment service rejects assigning agent who is not in designated team', function () {
    Event::fake([TicketAssigned::class]);

    expect(function () {
        $this->assignmentService->assign(
            ticket: $this->acmeTicket,
            team: $this->billingTeam,
            member: $this->acmeMember2 // Member 2 is on techTeam, not billingTeam
        );
    })->toThrow(InvalidAssignmentException::class);

    $this->assertDatabaseEmpty('ticket_assignments');
    Event::assertNotDispatched(TicketAssigned::class);
});

test('assignment service rejects cross-tenant team or member assignment', function () {
    expect(function () {
        $this->assignmentService->assign(
            ticket: $this->acmeTicket,
            team: Team::create(['organization_id' => $this->betaOrg->id, 'name' => 'Beta Team']),
            member: null
        );
    })->toThrow(DomainException::class);

    expect(function () {
        $this->assignmentService->assign(
            ticket: $this->acmeTicket,
            team: null,
            member: $this->betaMember
        );
    })->toThrow(DomainException::class);
});

test('reassigning ticket updates pointers, appends new audit record, and dispatches event', function () {
    Event::fake([TicketAssigned::class]);

    // Initial assignment to Billing Team & Member 1
    $firstAssignment = $this->assignmentService->assign(
        ticket: $this->acmeTicket,
        team: $this->billingTeam,
        member: $this->acmeMember1,
        assignedBy: $this->acmeMember1
    );

    // Reassignment to Technical Support & Member 2
    $secondAssignment = $this->assignmentService->assign(
        ticket: $this->acmeTicket,
        team: $this->techTeam,
        member: $this->acmeMember2,
        assignedBy: $this->acmeMember1
    );

    expect($this->acmeTicket->fresh()->assigned_team_id)->toBe($this->techTeam->id)
        ->and($this->acmeTicket->fresh()->assigned_member_id)->toBe($this->acmeMember2->id);

    $assignments = $this->acmeTicket->assignments()->get();
    expect($assignments)->toHaveCount(2)
        ->and($assignments[0]->id)->toBe($firstAssignment->id)
        ->and($assignments[0]->team_id)->toBe($this->billingTeam->id)
        ->and($assignments[1]->id)->toBe($secondAssignment->id)
        ->and($assignments[1]->team_id)->toBe($this->techTeam->id);

    Event::assertDispatched(TicketAssigned::class, 2);
});

test('agent can claim unassigned ticket, populating assigned_member_id and auto-advancing new to open', function () {
    Event::fake([TicketAssigned::class]);

    $now = Carbon::parse('2026-09-14 14:00:00');
    Carbon::setTestNow($now);

    expect($this->acmeTicket->status)->toBe(TicketStatus::NEW)
        ->and($this->acmeTicket->assigned_member_id)->toBeNull();

    $assignment = $this->assignmentService->claim($this->acmeTicket, $this->acmeMember1);

    $freshTicket = $this->acmeTicket->fresh();
    expect($freshTicket->assigned_member_id)->toBe($this->acmeMember1->id)
        ->and($freshTicket->status)->toBe(TicketStatus::OPEN)
        ->and($freshTicket->first_replied_at->toDateTimeString())->toBe('2026-09-14 14:00:00')
        ->and($assignment->member_id)->toBe($this->acmeMember1->id)
        ->and($assignment->assigned_by_id)->toBe($this->acmeMember1->id);

    $this->assertDatabaseHas('tickets', [
        'id' => $this->acmeTicket->id,
        'status' => 'open',
        'assigned_member_id' => $this->acmeMember1->id,
    ]);

    $this->assertDatabaseHas('ticket_assignments', [
        'id' => $assignment->id,
        'ticket_id' => $this->acmeTicket->id,
        'member_id' => $this->acmeMember1->id,
        'assigned_by_id' => $this->acmeMember1->id,
    ]);

    Event::assertDispatched(TicketAssigned::class, function (TicketAssigned $event) use ($assignment) {
        return $event->ticket->id === $this->acmeTicket->id
            && $event->assignment->id === $assignment->id;
    });
});

test('claiming an open ticket preserves open status and updates member', function () {
    $this->acmeTicket->update(['status' => TicketStatus::OPEN]);

    $assignment = $this->assignmentService->claim($this->acmeTicket, $this->acmeMember1);

    expect($this->acmeTicket->fresh()->status)->toBe(TicketStatus::OPEN)
        ->and($this->acmeTicket->fresh()->assigned_member_id)->toBe($this->acmeMember1->id);
});

test('claiming ticket already assigned to a team requires agent to be a member of that team', function () {
    // Ticket pre-assigned to Billing Team
    $this->acmeTicket->update(['assigned_team_id' => $this->billingTeam->id]);

    // Member 2 is on techTeam, not billingTeam
    expect(function () {
        $this->assignmentService->claim($this->acmeTicket, $this->acmeMember2);
    })->toThrow(InvalidAssignmentException::class);

    // Member 1 is on billingTeam -> succeeds
    $assignment = $this->assignmentService->claim($this->acmeTicket, $this->acmeMember1);
    expect($this->acmeTicket->fresh()->assigned_member_id)->toBe($this->acmeMember1->id);
});

test('claiming an already assigned ticket is rejected', function () {
    $this->acmeTicket->update(['assigned_member_id' => $this->acmeMember1->id]);

    expect(function () {
        $this->assignmentService->claim($this->acmeTicket, $this->acmeMember2);
    })->toThrow(InvalidAssignmentException::class);
});

test('claiming or assigning closed ticket is rejected', function () {
    $closedTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed ticket',
        'status' => TicketStatus::CLOSED,
        'closed_at' => now(),
    ]);

    expect(function () use ($closedTicket) {
        $this->assignmentService->claim($closedTicket, $this->acmeMember1);
    })->toThrow(InvalidTicketTransitionException::class);

    expect(function () use ($closedTicket) {
        $this->assignmentService->assign($closedTicket, $this->billingTeam, $this->acmeMember1);
    })->toThrow(InvalidTicketTransitionException::class);
});

test('claiming ticket across organizations is rejected', function () {
    expect(function () {
        $this->assignmentService->claim($this->acmeTicket, $this->betaMember);
    })->toThrow(DomainException::class);
});

test('ticket model convenience assign and claim methods delegate to service', function () {
    Event::fake([TicketAssigned::class]);

    $assignment = $this->acmeTicket->assign($this->billingTeam, $this->acmeMember1);

    expect($this->acmeTicket->fresh()->assigned_member_id)->toBe($this->acmeMember1->id)
        ->and($assignment)->toBeInstanceOf(TicketAssignment::class);

    $newTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Model claim test',
    ]);

    $claimAssignment = $newTicket->claim($this->acmeMember1);

    expect($newTicket->fresh()->assigned_member_id)->toBe($this->acmeMember1->id)
        ->and($newTicket->fresh()->status)->toBe(TicketStatus::OPEN)
        ->and($claimAssignment)->toBeInstanceOf(TicketAssignment::class);
});
