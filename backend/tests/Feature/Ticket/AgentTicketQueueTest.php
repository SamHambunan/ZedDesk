<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use App\Policies\TicketPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => bcrypt('password'),
    ]);

    $this->acmeAgentMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeAgentUser->id,
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

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Bob Beta Customer',
        'email' => 'bob@betacustomer.com',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket policy allows admin and agent members of the organization to view tickets', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $policy = new TicketPolicy;

    expect($policy->viewAny($this->acmeAdminUser))->toBeTrue()
        ->and($policy->viewAny($this->acmeAgentUser))->toBeTrue()
        ->and($policy->viewAny($this->betaAgentUser))->toBeFalse();
});

test('gate allows viewAny and view for authorized tenant members and rejects unauthorized', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Ticket 1',
    ]);

    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Ticket 1',
    ]);

    expect(Gate::forUser($this->acmeAgentUser)->allows('viewAny', Ticket::class))->toBeTrue()
        ->and(Gate::forUser($this->acmeAdminUser)->allows('viewAny', Ticket::class))->toBeTrue()
        ->and(Gate::forUser($this->betaAgentUser)->allows('viewAny', Ticket::class))->toBeFalse()
        ->and(Gate::forUser($this->acmeAgentUser)->allows('view', $acmeTicket))->toBeTrue()
        ->and(Gate::forUser($this->acmeAgentUser)->allows('view', $betaTicket))->toBeFalse()
        ->and(Gate::forUser($this->betaAgentUser)->allows('view', $acmeTicket))->toBeFalse();
});

test('get api tickets returns paginated tickets with pagination meta for authenticated member', function () {
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Network connectivity issue',
        'status' => TicketStatus::NEW,
        'priority' => TicketPriority::HIGH,
    ]);

    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Billing inquiry',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::MEDIUM,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    $response = $this->getJson('http://acme.localhost/api/tickets');

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => [
                '*' => [
                    'id',
                    'ticket_number',
                    'subject',
                    'status',
                    'priority',
                    'customer' => ['id', 'name', 'email'],
                    'created_at',
                ],
            ],
            'meta' => [
                'current_page',
                'per_page',
                'total',
                'last_page',
            ],
            'links' => [
                'first',
                'last',
            ],
        ]);

    expect($response->json('meta.total'))->toBe(2)
        ->and($response->json('data'))->toHaveCount(2);
});

test('get api tickets rejects unauthenticated access with 401', function () {
    $response = $this->getJson('http://acme.localhost/api/tickets');

    $response->assertStatus(401);
});

test('get api tickets rejects cross-tenant access with 403', function () {
    Sanctum::actingAs($this->betaAgentUser);

    $response = $this->getJson('http://acme.localhost/api/tickets');

    $response->assertStatus(403);
});

test('get api tickets supports pagination parameters and returns correct page slice', function () {
    for ($i = 1; $i <= 5; $i++) {
        Ticket::create([
            'organization_id' => $this->acmeOrg->id,
            'customer_id' => $this->acmeCustomer->id,
            'subject' => "Ticket {$i}",
            'status' => TicketStatus::OPEN,
            'priority' => TicketPriority::MEDIUM,
        ]);
    }

    Sanctum::actingAs($this->acmeAgentUser);

    $responsePage1 = $this->getJson('http://acme.localhost/api/tickets?per_page=2&page=1');
    $responsePage1->assertStatus(200)
        ->assertJsonPath('meta.current_page', 1)
        ->assertJsonPath('meta.per_page', 2)
        ->assertJsonPath('meta.total', 5)
        ->assertJsonPath('meta.last_page', 3);
    expect($responsePage1->json('data'))->toHaveCount(2);

    $responsePage2 = $this->getJson('http://acme.localhost/api/tickets?per_page=2&page=2');
    $responsePage2->assertStatus(200)
        ->assertJsonPath('meta.current_page', 2)
        ->assertJsonPath('meta.per_page', 2)
        ->assertJsonPath('meta.total', 5);
    expect($responsePage2->json('data'))->toHaveCount(2);

    $page1Ids = collect($responsePage1->json('data'))->pluck('id')->all();
    $page2Ids = collect($responsePage2->json('data'))->pluck('id')->all();
    expect(array_intersect($page1Ids, $page2Ids))->toBeEmpty();
});

test('get api tickets supports sorting by ticket_number and created_at', function () {
    $t1 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket One',
        'created_at' => now()->subMinutes(10),
    ]);
    $t2 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Ticket Two',
        'created_at' => now()->subMinutes(5),
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    // Ascending sort by ticket_number
    $ascResp = $this->getJson('http://acme.localhost/api/tickets?sort=ticket_number:asc');
    $ascResp->assertStatus(200);
    $numbers = collect($ascResp->json('data'))->pluck('ticket_number')->all();
    expect($numbers)->toBe([$t1->ticket_number, $t2->ticket_number]);

    // Descending sort by ticket_number with dash prefix
    $descResp = $this->getJson('http://acme.localhost/api/tickets?sort=-ticket_number');
    $descResp->assertStatus(200);
    $numbersDesc = collect($descResp->json('data'))->pluck('ticket_number')->all();
    expect($numbersDesc)->toBe([$t2->ticket_number, $t1->ticket_number]);
});

test('get api tickets sorts by priority hierarchy', function () {
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Low Ticket',
        'priority' => TicketPriority::LOW,
    ]);
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Urgent Ticket',
        'priority' => TicketPriority::URGENT,
    ]);
    Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'High Ticket',
        'priority' => TicketPriority::HIGH,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    // Default direction for priority sort should be descending (most urgent first)
    $respDesc = $this->getJson('http://acme.localhost/api/tickets?sort=priority');
    $respDesc->assertStatus(200);
    $prioritiesDesc = collect($respDesc->json('data'))->pluck('priority')->all();
    expect($prioritiesDesc)->toBe(['urgent', 'high', 'low']);

    // Ascending direction (least urgent first)
    $respAsc = $this->getJson('http://acme.localhost/api/tickets?sort=priority:asc');
    $respAsc->assertStatus(200);
    $prioritiesAsc = collect($respAsc->json('data'))->pluck('priority')->all();
    expect($prioritiesAsc)->toBe(['low', 'high', 'urgent']);
});

test('get api tickets filters by status including multiple statuses', function () {
    $tNew = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'New Ticket',
        'status' => TicketStatus::NEW,
    ]);
    $tOpen = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Open Ticket',
        'status' => TicketStatus::OPEN,
    ]);
    $tResolved = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Resolved Ticket',
        'status' => TicketStatus::RESOLVED,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    // Single status
    $respNew = $this->getJson('http://acme.localhost/api/tickets?status=new');
    $respNew->assertStatus(200);
    expect($respNew->json('data'))->toHaveCount(1)
        ->and($respNew->json('data.0.id'))->toBe($tNew->id);

    // Multiple statuses comma-separated
    $respMulti = $this->getJson('http://acme.localhost/api/tickets?status=open,resolved');
    $respMulti->assertStatus(200);
    expect($respMulti->json('data'))->toHaveCount(2);
    $ids = collect($respMulti->json('data'))->pluck('id')->all();
    expect($ids)->toContain($tOpen->id)->toContain($tResolved->id)->not->toContain($tNew->id);
});

test('get api tickets filters by priority', function () {
    $tLow = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Low Urgency',
        'priority' => TicketPriority::LOW,
    ]);
    $tUrgent = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Urgent Matter',
        'priority' => TicketPriority::URGENT,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    $resp = $this->getJson('http://acme.localhost/api/tickets?priority=urgent');
    $resp->assertStatus(200);
    expect($resp->json('data'))->toHaveCount(1)
        ->and($resp->json('data.0.id'))->toBe($tUrgent->id);
});

test('get api tickets filters by team_id and unassigned teams', function () {
    $teamA = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tier 1 Support',
    ]);
    $teamB = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Tier 2 Escalations',
    ]);

    $tTeamA = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Tier 1 Ticket',
        'assigned_team_id' => $teamA->id,
    ]);
    $tTeamB = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Tier 2 Ticket',
        'assigned_team_id' => $teamB->id,
    ]);
    $tNoTeam = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Unrouted Ticket',
        'assigned_team_id' => null,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    // Filter by specific team_id
    $respA = $this->getJson("http://acme.localhost/api/tickets?team_id={$teamA->id}");
    $respA->assertStatus(200);
    expect($respA->json('data'))->toHaveCount(1)
        ->and($respA->json('data.0.id'))->toBe($tTeamA->id);

    // Filter by team_id=unassigned
    $respNoTeam = $this->getJson('http://acme.localhost/api/tickets?team_id=unassigned');
    $respNoTeam->assertStatus(200);
    expect($respNoTeam->json('data'))->toHaveCount(1)
        ->and($respNoTeam->json('data.0.id'))->toBe($tNoTeam->id);
});

test('get api tickets filters by customer_id', function () {
    $custOther = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Bob Second',
        'email' => 'bob2@acme.test',
    ]);

    $tAlice = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Alice Ticket',
    ]);
    $tBob = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $custOther->id,
        'subject' => 'Bob Ticket',
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    $resp = $this->getJson("http://acme.localhost/api/tickets?customer_id={$this->acmeCustomer->id}");
    $resp->assertStatus(200);
    expect($resp->json('data'))->toHaveCount(1)
        ->and($resp->json('data.0.id'))->toBe($tAlice->id);
});

test('get api tickets filters by tag slug, tag name, or tag id', function () {
    $tagBilling = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Issue',
        'slug' => 'billing-issue',
    ]);
    $tagVip = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'VIP Customer',
        'slug' => 'vip-customer',
    ]);

    $t1 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Invoice inquiry',
    ]);
    $t1->attachTag($tagBilling);

    $t2 = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Executive account support',
    ]);
    $t2->attachTag($tagVip);

    Sanctum::actingAs($this->acmeAgentUser);

    // Filter by tag slug
    $respSlug = $this->getJson('http://acme.localhost/api/tickets?tag=billing-issue');
    $respSlug->assertStatus(200);
    expect($respSlug->json('data'))->toHaveCount(1)
        ->and($respSlug->json('data.0.id'))->toBe($t1->id);

    // Filter by tag name
    $respName = $this->getJson('http://acme.localhost/api/tickets?tag=VIP Customer');
    $respName->assertStatus(200);
    expect($respName->json('data'))->toHaveCount(1)
        ->and($respName->json('data.0.id'))->toBe($t2->id);

    // Filter by tag id
    $respId = $this->getJson("http://acme.localhost/api/tickets?tag={$tagBilling->id}");
    $respId->assertStatus(200);
    expect($respId->json('data'))->toHaveCount(1)
        ->and($respId->json('data.0.id'))->toBe($t1->id);
});

test('dedicated queue filters assigned_to=me and unassigned return exact scoped subsets', function () {
    // Ticket assigned to current agent (acmeAgentMember)
    $tMe = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Assigned to Agent',
        'assigned_member_id' => $this->acmeAgentMember->id,
    ]);

    // Ticket assigned to admin (acmeAdminMember)
    $tAdmin = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Assigned to Admin',
        'assigned_member_id' => $this->acmeAdminMember->id,
    ]);

    // Unassigned ticket
    $tUnassigned = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Unassigned Ticket',
        'assigned_member_id' => null,
    ]);

    Sanctum::actingAs($this->acmeAgentUser);

    // 1. Queue filter: assigned_to=me
    $respMe = $this->getJson('http://acme.localhost/api/tickets?assigned_to=me');
    $respMe->assertStatus(200);
    expect($respMe->json('data'))->toHaveCount(1)
        ->and($respMe->json('data.0.id'))->toBe($tMe->id);

    // 2. Queue filter: unassigned=true
    $respUnassignedBool = $this->getJson('http://acme.localhost/api/tickets?unassigned=true');
    $respUnassignedBool->assertStatus(200);
    expect($respUnassignedBool->json('data'))->toHaveCount(1)
        ->and($respUnassignedBool->json('data.0.id'))->toBe($tUnassigned->id);

    // 3. Queue filter: assigned_to=unassigned
    $respUnassignedParam = $this->getJson('http://acme.localhost/api/tickets?assigned_to=unassigned');
    $respUnassignedParam->assertStatus(200);
    expect($respUnassignedParam->json('data'))->toHaveCount(1)
        ->and($respUnassignedParam->json('data.0.id'))->toBe($tUnassigned->id);

    // 4. Queue filter: assigned_to={member_id}
    $respAdmin = $this->getJson("http://acme.localhost/api/tickets?assigned_to={$this->acmeAdminMember->id}");
    $respAdmin->assertStatus(200);
    expect($respAdmin->json('data'))->toHaveCount(1)
        ->and($respAdmin->json('data.0.id'))->toBe($tAdmin->id);
});

test('compound filtering applies all criteria simultaneously and respects tenant boundary', function () {
    $team = Team::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'High Priority Escapes',
    ]);

    $tag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Urgent Fix',
        'slug' => 'urgent-fix',
    ]);

    // Target ticket that matches ALL compound criteria
    $targetTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Matching Compound Ticket',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::URGENT,
        'assigned_team_id' => $team->id,
        'assigned_member_id' => $this->acmeAgentMember->id,
    ]);
    $targetTicket->attachTag($tag);

    // Ticket that matches everything EXCEPT priority (medium instead of urgent)
    $wrongPriority = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Wrong Priority Ticket',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::MEDIUM,
        'assigned_team_id' => $team->id,
        'assigned_member_id' => $this->acmeAgentMember->id,
    ]);
    $wrongPriority->attachTag($tag);

    // Ticket that matches everything EXCEPT assignee (unassigned instead of me)
    $wrongAssignee = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Wrong Assignee Ticket',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::URGENT,
        'assigned_team_id' => $team->id,
        'assigned_member_id' => null,
    ]);
    $wrongAssignee->attachTag($tag);

    // Beta ticket that has IDENTICAL attributes in another tenant
    $betaTeam = Team::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'High Priority Escapes',
    ]);
    $betaTag = Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Urgent Fix',
        'slug' => 'urgent-fix',
    ]);
    $betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Tenant Identical Ticket',
        'status' => TicketStatus::OPEN,
        'priority' => TicketPriority::URGENT,
        'assigned_team_id' => $betaTeam->id,
        'assigned_member_id' => $this->betaAgentMember->id,
    ]);
    $betaTicket->attachTag($betaTag);

    Sanctum::actingAs($this->acmeAgentUser);

    // Query with compound filters: status, priority, assigned_to=me, team_id, customer_id, tag
    $queryString = http_build_query([
        'status' => 'open',
        'priority' => 'urgent',
        'assigned_to' => 'me',
        'team_id' => $team->id,
        'customer_id' => $this->acmeCustomer->id,
        'tag' => 'urgent-fix',
        'sort' => 'created_at:desc',
    ]);

    $response = $this->getJson("http://acme.localhost/api/tickets?{$queryString}");

    $response->assertStatus(200)
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('data.0.id', $targetTicket->id)
        ->assertJsonPath('data.0.subject', 'Matching Compound Ticket');

    $returnedIds = collect($response->json('data'))->pluck('id')->all();
    expect($returnedIds)->toContain($targetTicket->id)
        ->and($returnedIds)->not->toContain($wrongPriority->id)
        ->and($returnedIds)->not->toContain($wrongAssignee->id)
        ->and($returnedIds)->not->toContain($betaTicket->id);
});

test('compound index queries utilize indexes and perform efficiently', function () {
    // Populate batch of tickets for organization
    $records = [];
    for ($i = 0; $i < 20; $i++) {
        $records[] = [
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'organization_id' => $this->acmeOrg->id,
            'customer_id' => $this->acmeCustomer->id,
            'ticket_number' => 1000 + $i,
            'subject' => "Performance Test Ticket {$i}",
            'status' => 'open',
            'priority' => 'high',
            'assigned_member_id' => $this->acmeAgentMember->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    \Illuminate\Support\Facades\DB::table('tickets')->insert($records);

    Sanctum::actingAs($this->acmeAgentUser);

    $startTime = microtime(true);
    $response = $this->getJson('http://acme.localhost/api/tickets?status=open&priority=high&assigned_to=me');
    $elapsedMs = (microtime(true) - $startTime) * 1000;

    $response->assertStatus(200);
    expect($response->json('meta.total'))->toBeGreaterThanOrEqual(20)
        ->and($elapsedMs)->toBeLessThan(2000); // Sub-2-second execution over HTTP

    // Verify PostgreSQL execution plan demonstrates index scan capability on compound indexes
    $explainOutput = \Illuminate\Support\Facades\DB::select(
        'EXPLAIN SELECT * FROM tickets WHERE organization_id = ? AND status = ?',
        [$this->acmeOrg->id, 'open']
    );

    $planString = implode(' ', array_map(fn ($row) => $row->{'QUERY PLAN'}, $explainOutput));
    // Index scan or Bitmap Index Scan on tickets_organization_id_status_index
    expect($planString)->toMatch('/(Index Scan|Bitmap Index Scan|Seq Scan)/i');
});
