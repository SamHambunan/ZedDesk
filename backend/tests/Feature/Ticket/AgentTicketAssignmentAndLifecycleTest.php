<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Events\TicketAssigned;
use App\Events\TicketCreated;
use App\Events\TicketStatusChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use App\Services\TicketStateMachine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Laravel\Sanctum\Sanctum;

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
        'name' => 'Acme Agent 1',
        'email' => 'agent1@acme.test',
        'password' => bcrypt('password'),
    ]);

    $this->acmeAgentMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeAgentUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeAgentUser2 = User::create([
        'name' => 'Acme Agent 2',
        'email' => 'agent2@acme.test',
        'password' => bcrypt('password'),
    ]);

    $this->acmeAgentMember2 = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeAgentUser2->id,
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

    $this->supportTeam = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Support Team',
    ]);

    $this->supportTeam->members()->attach($this->acmeAgentMember->id);

    $this->billingTeam = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Team',
    ]);

    $this->billingTeam->members()->attach($this->acmeAgentMember2->id);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket creation dispatches TicketCreated domain event', function () {
    Event::fake([TicketCreated::class]);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Event Dispatching Ticket',
        'status' => TicketStatus::NEW,
        'priority' => TicketPriority::MEDIUM,
    ]);

    Event::assertDispatched(TicketCreated::class, function (TicketCreated $event) use ($ticket) {
        return $event->ticket->id === $ticket->id;
    });
});

test('ticket status transition dispatches TicketStatusChanged domain event', function () {
    Event::fake([TicketStatusChanged::class]);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Status Change Event Ticket',
        'status' => TicketStatus::NEW,
        'priority' => TicketPriority::MEDIUM,
    ]);

    $stateMachine = app(TicketStateMachine::class);
    $stateMachine->transitionTo($ticket, TicketStatus::OPEN);

    Event::assertDispatched(TicketStatusChanged::class, function (TicketStatusChanged $event) use ($ticket) {
        return $event->ticket->id === $ticket->id
            && $event->previousStatus === TicketStatus::NEW
            && $event->newStatus === TicketStatus::OPEN;
    });
});

test('admin can delete and restore ticket under TicketPolicy', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Policy Admin Ticket',
    ]);

    expect(Gate::forUser($this->acmeAdminUser)->allows('delete', $ticket))->toBeTrue()
        ->and(Gate::forUser($this->acmeAdminUser)->allows('restore', $ticket))->toBeTrue();
});

test('agent cannot delete or restore ticket under TicketPolicy', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Policy Agent Ticket',
    ]);

    expect(Gate::forUser($this->acmeAgentUser)->allows('delete', $ticket))->toBeFalse()
        ->and(Gate::forUser($this->acmeAgentUser)->allows('restore', $ticket))->toBeFalse();
});

test('both admin and agent can update ticket under TicketPolicy', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Policy Update Ticket',
    ]);

    expect(Gate::forUser($this->acmeAdminUser)->allows('update', $ticket))->toBeTrue()
        ->and(Gate::forUser($this->acmeAgentUser)->allows('update', $ticket))->toBeTrue()
        ->and(Gate::forUser($this->betaAgentUser)->allows('update', $ticket))->toBeFalse();
});

test('agent can assign ticket to team and team member via api and records audit log in ticket_assignments', function () {
    Event::fake([TicketAssigned::class]);
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket for assignment',
        'status' => TicketStatus::OPEN,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'team_id' => $this->supportTeam->id,
        'member_id' => $this->acmeAgentMember->id,
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.assigned_team_id', $this->supportTeam->id)
        ->assertJsonPath('data.assigned_member_id', $this->acmeAgentMember->id);

    expect($ticket->fresh()->assigned_team_id)->toBe($this->supportTeam->id)
        ->and($ticket->fresh()->assigned_member_id)->toBe($this->acmeAgentMember->id);

    $this->assertDatabaseHas('ticket_assignments', [
        'ticket_id' => $ticket->id,
        'organization_id' => $this->acmeOrg->id,
        'team_id' => $this->supportTeam->id,
        'member_id' => $this->acmeAgentMember->id,
        'assigned_by_id' => $this->acmeAgentMember->id,
    ]);

    Event::assertDispatched(TicketAssigned::class);
});

test('assigning ticket enforces member belongs to designated team returning 422 if invalid', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Invalid team member test',
        'status' => TicketStatus::OPEN,
    ]);

    // acmeAgentMember belongs to supportTeam, not billingTeam
    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'team_id' => $this->billingTeam->id,
        'member_id' => $this->acmeAgentMember->id,
    ]);

    $response->assertStatus(422);
    expect($ticket->fresh()->assigned_team_id)->toBeNull();
});

test('assigning ticket rejects cross organization team or member with 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Cross org test',
        'status' => TicketStatus::OPEN,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'member_id' => $this->betaAgentMember->id,
    ]);

    $response->assertStatus(422);
});

test('assigning ticket on closed ticket returns 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed ticket assign test',
        'status' => TicketStatus::CLOSED,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'team_id' => $this->supportTeam->id,
    ]);

    $response->assertStatus(422);
});

test('agent can claim unassigned ticket transitioning status from new to open and dispatching events', function () {
    Event::fake([TicketAssigned::class, TicketStatusChanged::class]);
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Unassigned new ticket',
        'status' => TicketStatus::NEW,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/claim");

    $response->assertStatus(200)
        ->assertJsonPath('data.assigned_member_id', $this->acmeAgentMember->id)
        ->assertJsonPath('data.status', 'open');

    $freshTicket = $ticket->fresh();
    expect($freshTicket->assigned_member_id)->toBe($this->acmeAgentMember->id)
        ->and($freshTicket->status)->toBe(TicketStatus::OPEN)
        ->and($freshTicket->first_replied_at)->not->toBeNull();

    $this->assertDatabaseHas('ticket_assignments', [
        'ticket_id' => $ticket->id,
        'member_id' => $this->acmeAgentMember->id,
        'assigned_by_id' => $this->acmeAgentMember->id,
    ]);

    Event::assertDispatched(TicketAssigned::class);
    Event::assertDispatched(TicketStatusChanged::class);
});

test('claiming already assigned ticket returns 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Already assigned ticket',
        'status' => TicketStatus::OPEN,
        'assigned_member_id' => $this->acmeAgentMember2->id,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/claim");

    $response->assertStatus(422);
});

test('claiming ticket assigned to team requires agent to be member of that team returning 422 otherwise', function () {
    Sanctum::actingAs($this->acmeAgentUser); // member of supportTeam, not billingTeam

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Team assigned ticket',
        'status' => TicketStatus::NEW,
        'assigned_team_id' => $this->billingTeam->id,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/claim");

    $response->assertStatus(422);
});

test('claiming closed ticket returns 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed ticket claim test',
        'status' => TicketStatus::CLOSED,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/claim");

    $response->assertStatus(422);
});

test('agent can transition ticket status via api following state machine', function () {
    Event::fake([TicketStatusChanged::class]);
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'State machine status API test',
        'status' => TicketStatus::NEW,
    ]);

    // NEW -> OPEN
    $res1 = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'open',
    ]);
    $res1->assertStatus(200)
        ->assertJsonPath('data.status', 'open');
    expect($ticket->fresh()->status)->toBe(TicketStatus::OPEN)
        ->and($ticket->fresh()->first_replied_at)->not->toBeNull();

    // OPEN -> PENDING
    $res2 = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'pending',
    ]);
    $res2->assertStatus(200)
        ->assertJsonPath('data.status', 'pending');
    expect($ticket->fresh()->status)->toBe(TicketStatus::PENDING);

    // PENDING -> RESOLVED
    $res3 = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'resolved',
    ]);
    $res3->assertStatus(200)
        ->assertJsonPath('data.status', 'resolved');
    expect($ticket->fresh()->status)->toBe(TicketStatus::RESOLVED)
        ->and($ticket->fresh()->resolved_at)->not->toBeNull();

    // RESOLVED -> CLOSED
    $res4 = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'closed',
    ]);
    $res4->assertStatus(200)
        ->assertJsonPath('data.status', 'closed');
    expect($ticket->fresh()->status)->toBe(TicketStatus::CLOSED)
        ->and($ticket->fresh()->closed_at)->not->toBeNull();

    Event::assertDispatched(TicketStatusChanged::class, 4);
});

test('updating status with invalid state machine transition returns 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Invalid transition status API test',
        'status' => TicketStatus::NEW,
    ]);

    // NEW cannot jump directly to RESOLVED
    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'resolved',
    ]);

    $response->assertStatus(422)
        ->assertJsonStructure(['message']);
    expect($ticket->fresh()->status)->toBe(TicketStatus::NEW);
});

test('updating status on closed ticket returns 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Closed ticket status API test',
        'status' => TicketStatus::CLOSED,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'open',
    ]);

    $response->assertStatus(422);
    expect($ticket->fresh()->status)->toBe(TicketStatus::CLOSED);
});

test('updating status validates status enum returning 422', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Invalid enum status API test',
        'status' => TicketStatus::OPEN,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/status", [
        'status' => 'invalid_status_name',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['status']);
});

test('admin can soft delete a ticket via api', function () {
    Sanctum::actingAs($this->acmeAdminUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket to soft delete',
        'status' => TicketStatus::OPEN,
    ]);

    $response = $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}");

    $response->assertStatus(200)
        ->assertJsonPath('message', 'Ticket deleted successfully.');

    expect(Ticket::find($ticket->id))->toBeNull()
        ->and(Ticket::withTrashed()->find($ticket->id)->deleted_at)->not->toBeNull();
});

test('agent receives 403 Forbidden when attempting to soft delete a ticket', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Agent forbidden delete ticket',
        'status' => TicketStatus::OPEN,
    ]);

    $response = $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}");

    $response->assertStatus(403);
    expect(Ticket::find($ticket->id))->not->toBeNull();
});

test('admin can restore a soft deleted ticket via api', function () {
    Sanctum::actingAs($this->acmeAdminUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket to restore',
        'status' => TicketStatus::OPEN,
    ]);
    $ticket->delete();

    expect(Ticket::find($ticket->id))->toBeNull();

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/restore");

    $response->assertStatus(200)
        ->assertJsonPath('message', 'Ticket restored successfully.')
        ->assertJsonPath('data.id', $ticket->id);

    expect(Ticket::find($ticket->id))->not->toBeNull()
        ->and(Ticket::find($ticket->id)->deleted_at)->toBeNull();
});

test('agent receives 403 Forbidden when attempting to restore a soft deleted ticket', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Agent forbidden restore ticket',
        'status' => TicketStatus::OPEN,
    ]);
    $ticket->delete();

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/restore");

    $response->assertStatus(403);
    expect(Ticket::find($ticket->id))->toBeNull();
});

test('agent can unassign ticket by passing null team and member via api', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket to unassign',
        'status' => TicketStatus::OPEN,
        'assigned_team_id' => $this->supportTeam->id,
        'assigned_member_id' => $this->acmeAgentMember->id,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'team_id' => null,
        'member_id' => null,
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.assigned_team_id', null)
        ->assertJsonPath('data.assigned_member_id', null);

    expect($ticket->fresh()->assigned_team_id)->toBeNull()
        ->and($ticket->fresh()->assigned_member_id)->toBeNull();

    $this->assertDatabaseHas('ticket_assignments', [
        'ticket_id' => $ticket->id,
        'team_id' => null,
        'member_id' => null,
        'assigned_by_id' => $this->acmeAgentMember->id,
    ]);
});

test('tags can be attached and detached within the same organization only', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket for tags assignment test',
        'status' => TicketStatus::OPEN,
    ]);

    $acmeTag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Priority One',
        'slug' => 'priority-one',
    ]);

    $betaTag = Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Only',
        'slug' => 'beta-only',
    ]);

    // Attach same org tag succeeds
    $attachRes = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/tags", [
        'tag_id' => $acmeTag->id,
    ]);
    $attachRes->assertStatus(200);
    expect($ticket->fresh()->tags->pluck('id'))->toContain($acmeTag->id);

    // Attach cross org tag fails
    $crossRes = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/tags", [
        'tag_id' => $betaTag->id,
    ]);
    $crossRes->assertStatus(422);

    // Detach same org tag succeeds
    $detachRes = $this->deleteJson("http://acme.localhost/api/tickets/{$ticket->id}/tags/{$acmeTag->id}");
    $detachRes->assertStatus(200);
    expect($ticket->fresh()->tags->pluck('id'))->not->toContain($acmeTag->id);
});

test('assigning member only preserves existing assigned team', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Preserve team assignment test',
        'status' => TicketStatus::OPEN,
        'assigned_team_id' => $this->supportTeam->id,
    ]);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$ticket->id}/assign", [
        'member_id' => $this->acmeAgentMember->id,
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.assigned_team_id', $this->supportTeam->id)
        ->assertJsonPath('data.assigned_member_id', $this->acmeAgentMember->id);

    expect($ticket->fresh()->assigned_team_id)->toBe($this->supportTeam->id)
        ->and($ticket->fresh()->assigned_member_id)->toBe($this->acmeAgentMember->id);
});

test('agent can update ticket priority via api conforming to policy', function () {
    Sanctum::actingAs($this->acmeAgentUser);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Priority update test',
        'priority' => TicketPriority::LOW,
    ]);

    $response = $this->patchJson("http://acme.localhost/api/tickets/{$ticket->id}/priority", [
        'priority' => 'urgent',
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.priority', 'urgent');

    expect($ticket->fresh()->priority)->toBe(TicketPriority::URGENT);
});

test('customer portal intake dispatches TicketCreated domain event', function () {
    Event::fake([TicketCreated::class]);

    $response = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Portal Customer',
        'email' => 'portal@customer.com',
        'subject' => 'Intake Ticket via Portal',
        'message' => 'Hello, I have an issue with my login credentials.',
    ]);

    $response->assertStatus(201);
    Event::assertDispatched(TicketCreated::class);
});
