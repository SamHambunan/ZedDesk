<?php

namespace Database\Seeders;

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
use App\Models\TicketAttachment;
use App\Models\User;
use App\Services\TicketAssignmentService;
use App\Services\TicketStateMachine;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $defaultPassword = Hash::make('password');

        // 1. Provision Acme Organization & Users
        $acmeData = $this->provisionOrganization(
            slug: 'acme',
            name: 'Acme Corporation',
            adminEmail: 'admin@acme.test',
            adminName: 'Acme Admin',
            agentEmail: 'agent@acme.test',
            agentName: 'Acme Agent',
            defaultPassword: $defaultPassword,
            teams: [
                [
                    'name' => 'Support Tier 1',
                    'description' => 'First-tier technical support and ticket triaging',
                    'assign_roles' => [Role::AGENT],
                ],
                [
                    'name' => 'Billing Support',
                    'description' => 'Customer billing, subscription, and invoicing support',
                    'assign_roles' => [Role::ADMIN, Role::AGENT],
                ],
            ]
        );

        // 2. Provision Beta Organization & Users
        $betaData = $this->provisionOrganization(
            slug: 'beta',
            name: 'Beta Corporation',
            adminEmail: 'admin@beta.test',
            adminName: 'Beta Admin',
            agentEmail: 'agent@beta.test',
            agentName: 'Beta Agent',
            defaultPassword: $defaultPassword,
            teams: [
                [
                    'name' => 'Beta Support',
                    'description' => 'Customer success and onboarding',
                    'assign_roles' => [Role::AGENT],
                ],
                [
                    'name' => 'Beta Escalations',
                    'description' => 'Critical escalations and priority support',
                    'assign_roles' => [Role::ADMIN],
                ],
            ]
        );

        // 3. Provision Normalized Tags for Acme and Beta
        $acmeTags = $this->provisionTags($acmeData['org']);
        $betaTags = $this->provisionTags($betaData['org']);

        // 4. Provision Realistic Customer Records
        $acmeCustomers = $this->provisionCustomers($acmeData['org'], [
            [
                'name' => 'Alice Freeman',
                'email' => 'alice.freeman@example.com',
                'phone' => '+1-555-0101',
                'metadata' => ['tier' => 'enterprise', 'industry' => 'Fintech'],
            ],
            [
                'name' => 'Bob Smith',
                'email' => 'bob.smith@example.com',
                'phone' => '+1-555-0102',
                'metadata' => ['tier' => 'pro', 'industry' => 'SaaS'],
            ],
            [
                'name' => 'Charlie Brown',
                'email' => 'charlie.brown@example.com',
                'phone' => '+1-555-0103',
                'metadata' => ['tier' => 'standard', 'industry' => 'Retail'],
            ],
            [
                'name' => 'Diana Prince',
                'email' => 'diana.prince@example.com',
                'phone' => '+1-555-0104',
                'metadata' => ['tier' => 'enterprise', 'industry' => 'Healthcare'],
            ],
        ]);

        $betaCustomers = $this->provisionCustomers($betaData['org'], [
            [
                'name' => 'Evan Wright',
                'email' => 'evan.wright@example.com',
                'phone' => '+1-555-0201',
                'metadata' => ['tier' => 'standard', 'industry' => 'Logistics'],
            ],
            [
                'name' => 'Fiona Gallagher',
                'email' => 'fiona.gallagher@example.com',
                'phone' => '+1-555-0202',
                'metadata' => ['tier' => 'pro', 'industry' => 'Media'],
            ],
        ]);

        // 5. Provision Tickets, Conversation Threads, Assignments & Attachments
        $this->seedAcmeTickets(
            org: $acmeData['org'],
            adminMember: $acmeData['adminMember'],
            agentMember: $acmeData['agentMember'],
            teams: $acmeData['teams'],
            customers: $acmeCustomers,
            tags: $acmeTags
        );

        $this->seedBetaTickets(
            org: $betaData['org'],
            adminMember: $betaData['adminMember'],
            agentMember: $betaData['agentMember'],
            teams: $betaData['teams'],
            customers: $betaCustomers,
            tags: $betaTags
        );
    }

    /**
     * Provision an organization baseline with admin/agent users and sample teams.
     *
     * @param  array<int, array{name: string, description: string, assign_roles: array<int, Role>}>  $teams
     * @return array{org: Organization, adminMember: OrganizationMember, agentMember: OrganizationMember, teams: array<string, Team>}
     */
    private function provisionOrganization(
        string $slug,
        string $name,
        string $adminEmail,
        string $adminName,
        string $agentEmail,
        string $agentName,
        string $defaultPassword,
        array $teams
    ): array {
        $org = Organization::firstOrCreate(
            ['slug' => $slug],
            ['name' => $name]
        );

        $admin = User::firstOrCreate(
            ['email' => $adminEmail],
            [
                'name' => $adminName,
                'password' => $defaultPassword,
            ]
        );

        $agent = User::firstOrCreate(
            ['email' => $agentEmail],
            [
                'name' => $agentName,
                'password' => $defaultPassword,
            ]
        );

        $adminMember = OrganizationMember::withoutGlobalScopes()->firstOrCreate(
            [
                'organization_id' => $org->id,
                'user_id' => $admin->id,
            ],
            [
                'role' => Role::ADMIN,
            ]
        );

        $agentMember = OrganizationMember::withoutGlobalScopes()->firstOrCreate(
            [
                'organization_id' => $org->id,
                'user_id' => $agent->id,
            ],
            [
                'role' => Role::AGENT,
            ]
        );

        $membersByRole = [
            Role::ADMIN->value => $adminMember->id,
            Role::AGENT->value => $agentMember->id,
        ];

        $createdTeams = [];
        foreach ($teams as $teamData) {
            $team = Team::withoutGlobalScopes()->firstOrCreate(
                [
                    'organization_id' => $org->id,
                    'name' => $teamData['name'],
                ],
                [
                    'description' => $teamData['description'],
                ]
            );

            $memberIdsToSync = [];
            foreach ($teamData['assign_roles'] as $role) {
                $roleValue = $role instanceof Role ? $role->value : (string) $role;
                if (isset($membersByRole[$roleValue])) {
                    $memberIdsToSync[] = $membersByRole[$roleValue];
                }
            }

            if (! empty($memberIdsToSync)) {
                $team->members()->syncWithoutDetaching($memberIdsToSync);
            }

            $createdTeams[$team->name] = $team;
        }

        return [
            'org' => $org,
            'adminMember' => $adminMember,
            'agentMember' => $agentMember,
            'teams' => $createdTeams,
        ];
    }

    /**
     * Provision canonical normalized tags for an organization.
     *
     * @return array<string, Tag>
     */
    private function provisionTags(Organization $org): array
    {
        $tagsData = [
            'bug' => 'Bug',
            'billing' => 'Billing',
            'feature-request' => 'Feature Request',
            'security' => 'Security',
        ];

        $tags = [];
        foreach ($tagsData as $slug => $name) {
            $tags[$slug] = Tag::withoutGlobalScopes()->firstOrCreate(
                [
                    'organization_id' => $org->id,
                    'slug' => $slug,
                ],
                [
                    'name' => $name,
                ]
            );
        }

        return $tags;
    }

    /**
     * Provision realistic customer records for an organization.
     *
     * @param  array<int, array{name: string, email: string, phone: string, metadata: array<string, mixed>}>  $customersData
     * @return array<string, Customer>
     */
    private function provisionCustomers(Organization $org, array $customersData): array
    {
        $customers = [];
        foreach ($customersData as $data) {
            $customer = Customer::withoutGlobalScopes()->firstOrCreate(
                [
                    'organization_id' => $org->id,
                    'email' => $data['email'],
                ],
                [
                    'name' => $data['name'],
                    'phone' => $data['phone'],
                    'metadata' => $data['metadata'],
                ]
            );

            $customers[$customer->email] = $customer;
        }

        return $customers;
    }

    /**
     * Seed comprehensive sample tickets for Acme Corporation across all statuses,
     * priorities, conversation thread types, assignments, and attachments.
     *
     * @param  array<string, Team>  $teams
     * @param  array<string, Customer>  $customers
     * @param  array<string, Tag>  $tags
     */
    private function seedAcmeTickets(
        Organization $org,
        OrganizationMember $adminMember,
        OrganizationMember $agentMember,
        array $teams,
        array $customers,
        array $tags
    ): void {
        $assignmentService = app(TicketAssignmentService::class);
        $stateMachine = app(TicketStateMachine::class);
        $disk = config('filesystems.attachments_disk', 'private');

        // ---------------------------------------------------------------------
        // Ticket 1: Urgent Security Report (Status: NEW, Priority: URGENT)
        // Unassigned queue ticket with customer PDF attachment
        // ---------------------------------------------------------------------
        $subject1 = 'Urgent: Vulnerability report on SSO authentication flow';
        $ticket1 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject1)
            ->first();

        if (! $ticket1) {
            $ticket1 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['alice.freeman@example.com']->id,
                'subject' => $subject1,
                'priority' => TicketPriority::URGENT,
                'status' => TicketStatus::NEW,
            ]);

            $ticket1->tags()->syncWithoutDetaching([$tags['security']->id]);

            // Customer initial message with vulnerability report
            $msg1 = $ticket1->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['alice.freeman@example.com']->id,
                'body' => 'We discovered a critical vulnerability during our annual security audit where the SSO OAuth callback lacks state parameter validation. See attached report for details.',
            ]);

            // Sample PDF Attachment
            $attachmentId = (string) Str::uuid();
            $filePath = "tenants/{$org->id}/tickets/{$ticket1->id}/attachments/{$attachmentId}.pdf";
            $pdfContent = "%PDF-1.4\n%ZedDesk Security Audit Report\nAcme Corporation SSO Security Analysis.\n%%EOF";
            Storage::disk($disk)->put($filePath, $pdfContent);

            TicketAttachment::create([
                'id' => $attachmentId,
                'organization_id' => $org->id,
                'ticket_message_id' => $msg1->id,
                'file_name' => 'sso_security_audit.pdf',
                'file_path' => $filePath,
                'mime_type' => 'application/pdf',
                'file_size' => strlen($pdfContent),
            ]);
        }

        // ---------------------------------------------------------------------
        // Ticket 2: High Priority Bug (Status: OPEN, Priority: HIGH)
        // Team and Agent assigned, rich conversation with internal notes
        // ---------------------------------------------------------------------
        $subject2 = 'Database query timeout on batch report export';
        $ticket2 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject2)
            ->first();

        if (! $ticket2) {
            $ticket2 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['bob.smith@example.com']->id,
                'subject' => $subject2,
                'priority' => TicketPriority::HIGH,
                'status' => TicketStatus::NEW,
            ]);

            $ticket2->tags()->syncWithoutDetaching([$tags['bug']->id]);

            // 1. Initial customer inquiry
            $ticket2->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['bob.smith@example.com']->id,
                'body' => 'When attempting to export more than 50,000 transaction records, the job times out after 60 seconds with a 504 Gateway Error.',
            ]);

            // 2. Chronological Assignment History:
            // First assigned to Support Tier 1 by Admin
            $assignmentService->assign(
                ticket: $ticket2,
                team: $teams['Support Tier 1'],
                member: null,
                assignedBy: $adminMember
            );

            // Then assigned directly to Acme Agent
            $assignmentService->assign(
                ticket: $ticket2,
                team: $teams['Support Tier 1'],
                member: $agentMember,
                assignedBy: $adminMember
            );

            // 3. Agent public reply transitioning status to OPEN
            $ticket2->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => "Hello Bob, thank you for reporting this. We're actively investigating the query optimizer plan on the transaction index.",
                'target_status' => TicketStatus::OPEN,
            ]);

            // 4. Agent internal note
            $ticket2->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Postgres slow query log shows seq scan on tickets partition during date range filters. Adding composite index (organization_id, created_at).',
            ]);

            // 5. Customer follow-up reply
            $ticket2->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['bob.smith@example.com']->id,
                'body' => 'Thanks for the prompt response! Please let us know once the index deployment is complete so we can re-run our month-end reports.',
            ]);
        }

        // ---------------------------------------------------------------------
        // Ticket 3: Billing Discrepancy (Status: PENDING, Priority: MEDIUM)
        // Assigned to Billing Support + Acme Admin
        // ---------------------------------------------------------------------
        $subject3 = 'Invoice discrepancy for September seat licensing';
        $ticket3 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject3)
            ->first();

        if (! $ticket3) {
            $ticket3 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['charlie.brown@example.com']->id,
                'subject' => $subject3,
                'priority' => TicketPriority::MEDIUM,
                'status' => TicketStatus::NEW,
            ]);

            $ticket3->tags()->syncWithoutDetaching([$tags['billing']->id]);

            // Customer message
            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['charlie.brown@example.com']->id,
                'body' => 'Our September invoice charges us for 25 active agent seats, but our organization only has 15 active seats configured.',
            ]);

            // Assignment to Billing Support
            $assignmentService->assign(
                ticket: $ticket3,
                team: $teams['Billing Support'],
                member: $adminMember,
                assignedBy: $adminMember
            );

            // Admin public reply requesting information (transitions to PENDING)
            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'Hi Charlie, I am reviewing our Stripe billing meter records. Could you confirm if any seats were provisioned and de-provisioned mid-cycle?',
                'target_status' => TicketStatus::PENDING,
            ]);

            // Admin internal note
            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'Stripe proration calculated 10 temporary seats from the automated migration script. Will issue prorated credit note after confirmation.',
            ]);
        }

        // ---------------------------------------------------------------------
        // Ticket 4: Feature Request (Status: RESOLVED, Priority: LOW)
        // Completed lifecycle thread ending in resolved
        // ---------------------------------------------------------------------
        $subject4 = 'Dark mode support for customer portal';
        $ticket4 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject4)
            ->first();

        if (! $ticket4) {
            $ticket4 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['diana.prince@example.com']->id,
                'subject' => $subject4,
                'priority' => TicketPriority::LOW,
                'status' => TicketStatus::NEW,
            ]);

            $ticket4->tags()->syncWithoutDetaching([$tags['feature-request']->id]);

            // Assignment to Support Tier 1
            $assignmentService->assign(
                ticket: $ticket4,
                team: $teams['Support Tier 1'],
                member: $agentMember,
                assignedBy: $agentMember
            );

            // 1. Customer initial inquiry
            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['diana.prince@example.com']->id,
                'body' => 'Would love to see dark mode theme support added to the customer portal interface for low-light environments.',
            ]);

            // 2. Agent response (transitions to OPEN)
            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Hi Diana! Great timing—dark mode support was recently released in v2.4.0. You can toggle it under portal user preferences.',
                'target_status' => TicketStatus::OPEN,
            ]);

            // 3. Customer confirms
            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['diana.prince@example.com']->id,
                'body' => 'Found the toggle in preferences! It works great, thank you so much for the quick help!',
            ]);

            // 4. Agent resolves ticket
            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Awesome! Glad you like it. Marking this ticket as resolved. Feel free to reach back out anytime if you need anything else.',
                'target_status' => TicketStatus::RESOLVED,
            ]);
        }

        // ---------------------------------------------------------------------
        // Ticket 5: Closed Administrative Ticket (Status: CLOSED, Priority: MEDIUM)
        // Fully resolved and closed immutable ticket
        // ---------------------------------------------------------------------
        $subject5 = 'Update company VAT number on receipt';
        $ticket5 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject5)
            ->first();

        if (! $ticket5) {
            $ticket5 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['alice.freeman@example.com']->id,
                'subject' => $subject5,
                'priority' => TicketPriority::MEDIUM,
                'status' => TicketStatus::NEW,
            ]);

            $ticket5->tags()->syncWithoutDetaching([$tags['billing']->id]);

            // Assignment
            $assignmentService->assign(
                ticket: $ticket5,
                team: $teams['Billing Support'],
                member: $adminMember,
                assignedBy: $adminMember
            );

            // Customer inquiry
            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['alice.freeman@example.com']->id,
                'body' => 'Please update our company VAT registration number to GB123456789 on invoice INV-2026-08.',
            ]);

            // Admin response resolving
            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'We have updated your VAT registration number in our billing ledger and re-issued invoice INV-2026-08.',
                'target_status' => TicketStatus::RESOLVED,
            ]);

            // Admin internal note
            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'Verified VAT registration number in HMRC registry.',
            ]);

            // Refresh in-memory status before transitioning to CLOSED
            $ticket5->refresh();
            $stateMachine->transitionTo($ticket5, TicketStatus::CLOSED);
        }
    }

    /**
     * Seed sample tickets for secondary organization Beta Corporation.
     *
     * @param  array<string, Team>  $teams
     * @param  array<string, Customer>  $customers
     * @param  array<string, Tag>  $tags
     */
    private function seedBetaTickets(
        Organization $org,
        OrganizationMember $adminMember,
        OrganizationMember $agentMember,
        array $teams,
        array $customers,
        array $tags
    ): void {
        $assignmentService = app(TicketAssignmentService::class);
        $stateMachine = app(TicketStateMachine::class);
        $disk = config('filesystems.attachments_disk', 'private');

        // 1. Beta Ticket: Urgent Gateway Timeout (Status: OPEN, Priority: URGENT)
        $subject1 = 'Critical: Payment gateway webhook timeout';
        $ticket1 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject1)
            ->first();

        if (! $ticket1) {
            $ticket1 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['evan.wright@example.com']->id,
                'subject' => $subject1,
                'priority' => TicketPriority::URGENT,
                'status' => TicketStatus::NEW,
            ]);

            $ticket1->tags()->syncWithoutDetaching([$tags['bug']->id]);

            $assignmentService->assign(
                ticket: $ticket1,
                team: $teams['Beta Escalations'],
                member: $adminMember,
                assignedBy: $adminMember
            );

            $ticket1->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['evan.wright@example.com']->id,
                'body' => 'Our payment gateway webhooks are failing with connection timeouts since 08:00 UTC.',
            ]);

            $ticket1->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'We are escalating to upstream gateway engineering immediately.',
                'target_status' => TicketStatus::OPEN,
            ]);

            $ticket1->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $adminMember->id,
                'body' => 'Escalated incident to upstream gateway provider with priority pager.',
            ]);
        }

        // 2. Beta Ticket: New Webhook Integration Request (Status: NEW, Priority: LOW)
        // Unassigned queue ticket with sample attachment
        $subject2 = 'Webhook integration request for Slack alerts';
        $ticket2 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject2)
            ->first();

        if (! $ticket2) {
            $ticket2 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['fiona.gallagher@example.com']->id,
                'subject' => $subject2,
                'priority' => TicketPriority::LOW,
                'status' => TicketStatus::NEW,
            ]);

            $ticket2->tags()->syncWithoutDetaching([$tags['feature-request']->id]);

            $msg2 = $ticket2->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['fiona.gallagher@example.com']->id,
                'body' => 'Could you provide documentation on configuring outbound webhooks to Slack channels for ticket events? Specification attached.',
            ]);

            $betaAttachmentId = (string) Str::uuid();
            $betaFilePath = "tenants/{$org->id}/tickets/{$ticket2->id}/attachments/{$betaAttachmentId}.pdf";
            $betaPdfContent = "%PDF-1.4\n%Beta Slack Webhook Specification\nOutbound Webhook Format.\n%%EOF";
            Storage::disk($disk)->put($betaFilePath, $betaPdfContent);

            TicketAttachment::create([
                'id' => $betaAttachmentId,
                'organization_id' => $org->id,
                'ticket_message_id' => $msg2->id,
                'file_name' => 'slack_webhook_spec.pdf',
                'file_path' => $betaFilePath,
                'mime_type' => 'application/pdf',
                'file_size' => strlen($betaPdfContent),
            ]);
        }

        // 3. Beta Ticket: Billing Allocation Review (Status: PENDING, Priority: MEDIUM)
        $subject3 = 'Enterprise seat allocation and billing review';
        $ticket3 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject3)
            ->first();

        if (! $ticket3) {
            $ticket3 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['evan.wright@example.com']->id,
                'subject' => $subject3,
                'priority' => TicketPriority::MEDIUM,
                'status' => TicketStatus::NEW,
            ]);

            $ticket3->tags()->syncWithoutDetaching([$tags['billing']->id]);

            $assignmentService->assign(
                ticket: $ticket3,
                team: $teams['Beta Support'],
                member: $agentMember,
                assignedBy: $agentMember
            );

            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['evan.wright@example.com']->id,
                'body' => 'Can we review our team tier license limits for Q4?',
            ]);

            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'I have pulled your seat usage report. Could you confirm the expected headcount addition?',
                'target_status' => TicketStatus::PENDING,
            ]);

            $ticket3->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Reviewing subscription plan pricing matrix for volume discount tier.',
            ]);
        }

        // 4. Beta Ticket: TLS Warning (Status: RESOLVED, Priority: HIGH)
        $subject4 = 'TLS certificate expiration warning on custom domain';
        $ticket4 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject4)
            ->first();

        if (! $ticket4) {
            $ticket4 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['evan.wright@example.com']->id,
                'subject' => $subject4,
                'priority' => TicketPriority::HIGH,
                'status' => TicketStatus::NEW,
            ]);

            $ticket4->tags()->syncWithoutDetaching([$tags['security']->id]);

            $assignmentService->assign(
                ticket: $ticket4,
                team: $teams['Beta Support'],
                member: $agentMember,
                assignedBy: $agentMember
            );

            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['evan.wright@example.com']->id,
                'body' => 'Our monitoring reports our custom domain TLS certificate expires in 3 days.',
            ]);

            $ticket4->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Automated Let’s Encrypt renewal has completed and the certificate is renewed for another 90 days.',
                'target_status' => TicketStatus::RESOLVED,
            ]);
        }

        // 5. Beta Ticket: Annual Contract (Status: CLOSED, Priority: LOW)
        $subject5 = 'Annual contract renewal documentation';
        $ticket5 = Ticket::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('subject', $subject5)
            ->first();

        if (! $ticket5) {
            $ticket5 = Ticket::create([
                'organization_id' => $org->id,
                'customer_id' => $customers['fiona.gallagher@example.com']->id,
                'subject' => $subject5,
                'priority' => TicketPriority::LOW,
                'status' => TicketStatus::NEW,
            ]);

            $ticket5->tags()->syncWithoutDetaching([$tags['billing']->id]);

            $assignmentService->assign(
                ticket: $ticket5,
                team: $teams['Beta Support'],
                member: $agentMember,
                assignedBy: $agentMember
            );

            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customers['fiona.gallagher@example.com']->id,
                'body' => 'Please email the signed enterprise service agreement copy for fiscal year 2026.',
            ]);

            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Executed agreement has been sent to your primary contact email.',
                'target_status' => TicketStatus::RESOLVED,
            ]);

            $ticket5->messages()->create([
                'organization_id' => $org->id,
                'message_type' => TicketMessageType::INTERNAL_NOTE,
                'author_type' => OrganizationMember::class,
                'author_id' => $agentMember->id,
                'body' => 'Archived countersigned PDF in legal repository.',
            ]);

            $ticket5->refresh();
            $stateMachine->transitionTo($ticket5, TicketStatus::CLOSED);
        }
    }
}
