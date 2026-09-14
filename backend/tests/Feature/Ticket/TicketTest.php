<?php

use App\Context\OrganizationContext;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('organizations table has ticket_counter column defaulting to 0', function () {
    expect(Schema::hasColumn('organizations', 'ticket_counter'))->toBeTrue();

    $org = Organization::create([
        'name' => 'Gamma Corporation',
        'slug' => 'gamma',
    ]);

    $freshOrg = Organization::find($org->id);
    expect($freshOrg->ticket_counter)->toBe(0);
});

test('tickets table has uuid primary key and required schema attributes', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Cannot access billing page',
        'status' => TicketStatus::NEW,
        'priority' => TicketPriority::HIGH,
    ]);

    expect($ticket->id)->toBeString()
        ->and(Str::isUuid($ticket->id))->toBeTrue()
        ->and($ticket->ticket_number)->toBe(1)
        ->and($ticket->subject)->toBe('Cannot access billing page')
        ->and($ticket->status)->toBe(TicketStatus::NEW)
        ->and($ticket->priority)->toBe(TicketPriority::HIGH)
        ->and($ticket->assigned_team_id)->toBeNull()
        ->and($ticket->assigned_member_id)->toBeNull()
        ->and($ticket->first_replied_at)->toBeNull()
        ->and($ticket->resolved_at)->toBeNull()
        ->and($ticket->closed_at)->toBeNull()
        ->and($ticket->deleted_at)->toBeNull();

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'organization_id' => $this->acmeOrg->id,
        'ticket_number' => 1,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Cannot access billing page',
        'status' => 'new',
        'priority' => 'high',
    ]);
});

test('tickets table supports soft-deletes and preserves record with deleted_at timestamp', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Soft delete inquiry',
    ]);

    $ticketId = $ticket->id;
    $ticket->delete();

    expect(Ticket::find($ticketId))->toBeNull();
    expect(Ticket::withTrashed()->find($ticketId))->not->toBeNull();
    expect(Ticket::withTrashed()->find($ticketId)->deleted_at)->not->toBeNull();

    $this->assertSoftDeleted('tickets', [
        'id' => $ticketId,
    ]);
});

test('foreign key cascade deletes tickets when organization is deleted', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Cascade test ticket',
    ]);

    $ticketId = $ticket->id;
    $this->acmeOrg->delete();

    $this->assertDatabaseMissing('tickets', [
        'id' => $ticketId,
    ]);
});

test('foreign key cascade deletes tickets when customer is deleted', function () {
    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Customer cascade test ticket',
    ]);

    $ticketId = $ticket->id;
    $this->acmeCustomer->delete();

    $this->assertDatabaseMissing('tickets', [
        'id' => $ticketId,
    ]);
});

test('assigned_team_id and assigned_member_id are nullified when team or member is deleted', function () {
    $user = User::create([
        'name' => 'Support Agent',
        'email' => 'agent@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $member = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Support',
    ]);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Assignment test ticket',
        'assigned_team_id' => $team->id,
        'assigned_member_id' => $member->id,
    ]);

    expect($ticket->assigned_team_id)->toBe($team->id)
        ->and($ticket->assigned_member_id)->toBe($member->id);

    // Delete team and verify null on delete
    $team->delete();
    $ticket->refresh();
    expect($ticket->assigned_team_id)->toBeNull()
        ->and($ticket->assigned_member_id)->toBe($member->id);

    // Delete member and verify null on delete
    $member->delete();
    $ticket->refresh();
    expect($ticket->assigned_member_id)->toBeNull();
});

test('compound unique constraint prevents duplicate ticket_number within the same organization', function () {
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'ticket_number' => 42,
        'subject' => 'First ticket 42',
    ]);

    expect(function () {
        Ticket::create([
            'organization_id' => $this->acmeOrg->id,
            'customer_id' => $this->acmeCustomer->id,
            'ticket_number' => 42,
            'subject' => 'Duplicate ticket 42',
        ]);
    })->toThrow(QueryException::class);
});

test('same ticket_number can exist across different organizations without conflict', function () {
    $acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'ticket_number' => 100,
        'subject' => 'Acme ticket 100',
    ]);

    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'ticket_number' => 100,
        'subject' => 'Beta ticket 100',
    ]);

    expect($acmeTicket->id)->not->toBe($betaTicket->id)
        ->and($acmeTicket->ticket_number)->toBe(100)
        ->and($betaTicket->ticket_number)->toBe(100)
        ->and($acmeTicket->organization_id)->toBe($this->acmeOrg->id)
        ->and($betaTicket->organization_id)->toBe($this->betaOrg->id);
});

test('compound indexes exist on tickets table for queue filtering', function () {
    $indexes = DB::select("
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'tickets'
    ");

    $indexDefs = array_map(fn ($idx) => $idx->indexdef, $indexes);
    $combinedDefs = implode("\n", $indexDefs);

    // Organization + ticket_number unique compound
    expect($combinedDefs)->toMatch('/unique.*\(organization_id,\s*ticket_number\)/i');

    // Organization + status
    expect($combinedDefs)->toMatch('/\(organization_id,\s*status\)/i');

    // Organization + priority
    expect($combinedDefs)->toMatch('/\(organization_id,\s*priority\)/i');

    // Organization + customer_id
    expect($combinedDefs)->toMatch('/\(organization_id,\s*customer_id\)/i');

    // Organization + assigned_member_id
    expect($combinedDefs)->toMatch('/\(organization_id,\s*assigned_member_id\)/i');

    // Organization + assigned_team_id
    expect($combinedDefs)->toMatch('/\(organization_id,\s*assigned_team_id\)/i');
});

test('ticket model enforces tenant query scoping', function () {
    $acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Scope Ticket',
    ]);

    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Scope Ticket',
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);
    $acmeResults = Ticket::all();
    expect($acmeResults)->toHaveCount(1)
        ->and($acmeResults->first()->id)->toBe($acmeTicket->id);

    OrganizationContext::setCurrent($this->betaOrg);
    $betaResults = Ticket::all();
    expect($betaResults)->toHaveCount(1)
        ->and($betaResults->first()->id)->toBe($betaTicket->id);

    OrganizationContext::clear();
});

test('creating ticket in active organization context automatically assigns organization_id', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $ticket = Ticket::create([
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Context Inferred Ticket',
    ]);

    expect($ticket->organization_id)->toBe($this->acmeOrg->id);

    $this->assertDatabaseHas('tickets', [
        'id' => $ticket->id,
        'organization_id' => $this->acmeOrg->id,
        'subject' => 'Context Inferred Ticket',
    ]);
});

test('ticket relationships work bidirectionally for customer, team, member, and organization', function () {
    $user = User::create([
        'name' => 'Agent Bob',
        'email' => 'bob@acme.com',
        'password' => bcrypt('password123'),
    ]);

    $member = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $user->id,
        'role' => 'agent',
    ]);

    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Technical Support',
    ]);

    $ticket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Bidirectional relation test',
        'assigned_team_id' => $team->id,
        'assigned_member_id' => $member->id,
    ]);

    // Forward relationships
    expect($ticket->customer->id)->toBe($this->acmeCustomer->id)
        ->and($ticket->organization->id)->toBe($this->acmeOrg->id)
        ->and($ticket->assignedTeam->id)->toBe($team->id)
        ->and($ticket->assignedMember->id)->toBe($member->id);

    // Inverse relationships
    expect($this->acmeCustomer->tickets)->toHaveCount(1)
        ->and($this->acmeCustomer->tickets->first()->id)->toBe($ticket->id)
        ->and($this->acmeOrg->tickets)->toHaveCount(1)
        ->and($this->acmeOrg->tickets->first()->id)->toBe($ticket->id)
        ->and($team->assignedTickets)->toHaveCount(1)
        ->and($team->assignedTickets->first()->id)->toBe($ticket->id)
        ->and($member->assignedTickets)->toHaveCount(1)
        ->and($member->assignedTickets->first()->id)->toBe($ticket->id);
});

test('ticket factory generates valid ticket model instance', function () {
    $ticket = Ticket::factory()->create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
    ]);

    expect($ticket->id)->toBeString()
        ->and(Str::isUuid($ticket->id))->toBeTrue()
        ->and($ticket->organization_id)->toBe($this->acmeOrg->id)
        ->and($ticket->customer_id)->toBe($this->acmeCustomer->id)
        ->and($ticket->ticket_number)->toBeGreaterThanOrEqual(1)
        ->and($ticket->subject)->toBeString();
});

test('ticket factory defaults align customer to the same organization without tenant mismatch', function () {
    $ticket = Ticket::factory()->create();

    expect($ticket->organization_id)->toBe($ticket->customer->organization_id);
});
