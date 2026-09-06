<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $defaultPassword = Hash::make('password');

        // 1. Provision Acme Organization & Users
        $this->provisionOrganization(
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
        $this->provisionOrganization(
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
    }

    /**
     * Provision an organization baseline with admin/agent users and sample teams.
     *
     * @param  array<int, array{name: string, description: string, assign_roles: array<int, Role>}>  $teams
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
    ): void {
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
        }
    }
}
