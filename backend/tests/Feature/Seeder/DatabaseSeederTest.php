<?php

use App\Enums\Role;
use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

test('database seeder populates acme and beta organizations with users, teams, customers, tags, and tickets', function () {
    Artisan::call('db:seed');

    // 1. Verify Acme Organization
    $acmeOrg = Organization::where('slug', 'acme')->first();
    expect($acmeOrg)->not->toBeNull()
        ->and($acmeOrg->name)->toBe('Acme Corporation');

    // 2. Verify Acme Users & Passwords
    $acmeAdmin = User::where('email', 'admin@acme.test')->first();
    expect($acmeAdmin)->not->toBeNull()
        ->and($acmeAdmin->name)->toBe('Acme Admin')
        ->and(Hash::check('password', $acmeAdmin->password))->toBeTrue();

    $acmeAgent = User::where('email', 'agent@acme.test')->first();
    expect($acmeAgent)->not->toBeNull()
        ->and($acmeAgent->name)->toBe('Acme Agent')
        ->and(Hash::check('password', $acmeAgent->password))->toBeTrue();

    // 3. Verify Acme Organization Members & Roles
    $acmeAdminMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('user_id', $acmeAdmin->id)
        ->first();
    expect($acmeAdminMember)->not->toBeNull()
        ->and($acmeAdminMember->role)->toBe(Role::ADMIN);

    $acmeAgentMember = OrganizationMember::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('user_id', $acmeAgent->id)
        ->first();
    expect($acmeAgentMember)->not->toBeNull()
        ->and($acmeAgentMember->role)->toBe(Role::AGENT);

    // 4. Verify Acme Teams and Member Assignments
    $supportTier1 = Team::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('name', 'Support Tier 1')
        ->first();
    expect($supportTier1)->not->toBeNull()
        ->and($supportTier1->members->pluck('id')->all())->toContain($acmeAgentMember->id);

    $billingSupport = Team::withoutGlobalScopes()
        ->where('organization_id', $acmeOrg->id)
        ->where('name', 'Billing Support')
        ->first();
    expect($billingSupport)->not->toBeNull()
        ->and($billingSupport->members->pluck('id')->all())->toContain($acmeAdminMember->id)
        ->and($billingSupport->members->pluck('id')->all())->toContain($acmeAgentMember->id);

    // 5. Verify Acme Customers
    $acmeCustomers = Customer::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->get();
    expect($acmeCustomers)->toHaveCount(4);
    $customerEmails = $acmeCustomers->pluck('email')->all();
    expect($customerEmails)->toContain('alice.freeman@example.com')
        ->and($customerEmails)->toContain('bob.smith@example.com')
        ->and($customerEmails)->toContain('charlie.brown@example.com')
        ->and($customerEmails)->toContain('diana.prince@example.com');

    // 6. Verify Acme Normalized Tags
    $acmeTags = Tag::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->get();
    expect($acmeTags)->toHaveCount(4);
    $tagSlugs = $acmeTags->pluck('slug')->all();
    expect($tagSlugs)->toContain('bug')
        ->and($tagSlugs)->toContain('billing')
        ->and($tagSlugs)->toContain('feature-request')
        ->and($tagSlugs)->toContain('security');

    // 7. Verify Acme Tickets Spanning all 5 Statuses & 4 Priorities
    $acmeTickets = Ticket::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->get();
    expect($acmeTickets)->toHaveCount(5);

    $statuses = $acmeTickets->map(fn (Ticket $t) => $t->status instanceof TicketStatus ? $t->status->value : (string) $t->status)->unique()->values()->all();
    expect($statuses)->toContain(TicketStatus::NEW->value)
        ->and($statuses)->toContain(TicketStatus::OPEN->value)
        ->and($statuses)->toContain(TicketStatus::PENDING->value)
        ->and($statuses)->toContain(TicketStatus::RESOLVED->value)
        ->and($statuses)->toContain(TicketStatus::CLOSED->value);

    $priorities = $acmeTickets->map(fn (Ticket $t) => $t->priority instanceof TicketPriority ? $t->priority->value : (string) $t->priority)->unique()->values()->all();
    expect($priorities)->toContain(TicketPriority::URGENT->value)
        ->and($priorities)->toContain(TicketPriority::HIGH->value)
        ->and($priorities)->toContain(TicketPriority::MEDIUM->value)
        ->and($priorities)->toContain(TicketPriority::LOW->value);

    // Verify Unassigned Queue Ticket
    $unassignedTicket = $acmeTickets->firstWhere('assigned_member_id', null);
    expect($unassignedTicket)->not->toBeNull()
        ->and($unassignedTicket->assigned_team_id)->toBeNull()
        ->and($unassignedTicket->status)->toBe(TicketStatus::NEW);

    // Verify Conversation Thread Types (Customer Public Reply, Agent Public Reply, Internal Note)
    $allAcmeMessages = TicketMessage::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->get();
    expect($allAcmeMessages->where('message_type', TicketMessageType::PUBLIC_REPLY)->count())->toBeGreaterThan(0)
        ->and($allAcmeMessages->where('message_type', TicketMessageType::INTERNAL_NOTE)->count())->toBeGreaterThan(0);

    $hasCustomerAuthor = $allAcmeMessages->contains(fn ($m) => $m->author_type === Customer::class);
    $hasStaffAuthor = $allAcmeMessages->contains(fn ($m) => $m->author_type === OrganizationMember::class);
    expect($hasCustomerAuthor)->toBeTrue()
        ->and($hasStaffAuthor)->toBeTrue();

    // Verify Sample Attachment
    $attachment = TicketAttachment::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->first();
    expect($attachment)->not->toBeNull()
        ->and($attachment->file_name)->toBe('sso_security_audit.pdf')
        ->and($attachment->mime_type)->toBe('application/pdf');

    $disk = config('filesystems.attachments_disk', 'private');
    expect(Storage::disk($disk)->exists($attachment->file_path))->toBeTrue();

    // Verify Assignment Audit Log in ticket_assignments
    $assignments = TicketAssignment::withoutGlobalScopes()->where('organization_id', $acmeOrg->id)->get();
    expect($assignments->count())->toBeGreaterThanOrEqual(5);

    // 8. Verify Beta Organization & Baseline
    $betaOrg = Organization::where('slug', 'beta')->first();
    expect($betaOrg)->not->toBeNull()
        ->and($betaOrg->name)->toBe('Beta Corporation');

    $betaCustomers = Customer::withoutGlobalScopes()->where('organization_id', $betaOrg->id)->get();
    expect($betaCustomers)->toHaveCount(2);

    $betaTags = Tag::withoutGlobalScopes()->where('organization_id', $betaOrg->id)->get();
    expect($betaTags)->toHaveCount(4);

    $betaTickets = Ticket::withoutGlobalScopes()->where('organization_id', $betaOrg->id)->get();
    expect($betaTickets)->toHaveCount(4);
});

test('database seeder runs idempotently without duplicating records', function () {
    // First run
    Artisan::call('db:seed');

    $orgCount1 = Organization::count();
    $userCount1 = User::count();
    $memberCount1 = OrganizationMember::withoutGlobalScopes()->count();
    $teamCount1 = Team::withoutGlobalScopes()->count();
    $teamMemberCount1 = DB::table('team_members')->count();
    $customerCount1 = Customer::withoutGlobalScopes()->count();
    $tagCount1 = Tag::withoutGlobalScopes()->count();
    $ticketCount1 = Ticket::withoutGlobalScopes()->count();
    $messageCount1 = TicketMessage::withoutGlobalScopes()->count();
    $assignmentCount1 = TicketAssignment::withoutGlobalScopes()->count();
    $attachmentCount1 = TicketAttachment::withoutGlobalScopes()->count();
    $ticketTagCount1 = DB::table('ticket_tags')->count();

    expect($orgCount1)->toBe(2)
        ->and($userCount1)->toBe(4)
        ->and($memberCount1)->toBe(4)
        ->and($teamCount1)->toBe(4)
        ->and($teamMemberCount1)->toBe(5)
        ->and($customerCount1)->toBe(6)
        ->and($tagCount1)->toBe(8)
        ->and($ticketCount1)->toBe(9);

    // Second run
    Artisan::call('db:seed');

    expect(Organization::count())->toBe($orgCount1)
        ->and(User::count())->toBe($userCount1)
        ->and(OrganizationMember::withoutGlobalScopes()->count())->toBe($memberCount1)
        ->and(Team::withoutGlobalScopes()->count())->toBe($teamCount1)
        ->and(DB::table('team_members')->count())->toBe($teamMemberCount1)
        ->and(Customer::withoutGlobalScopes()->count())->toBe($customerCount1)
        ->and(Tag::withoutGlobalScopes()->count())->toBe($tagCount1)
        ->and(Ticket::withoutGlobalScopes()->count())->toBe($ticketCount1)
        ->and(TicketMessage::withoutGlobalScopes()->count())->toBe($messageCount1)
        ->and(TicketAssignment::withoutGlobalScopes()->count())->toBe($assignmentCount1)
        ->and(TicketAttachment::withoutGlobalScopes()->count())->toBe($attachmentCount1)
        ->and(DB::table('ticket_tags')->count())->toBe($ticketTagCount1);
});
