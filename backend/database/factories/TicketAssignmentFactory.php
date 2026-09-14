<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TicketAssignment>
 */
class TicketAssignmentFactory extends Factory
{
    protected $model = TicketAssignment::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'ticket_id' => function (array $attributes) {
                return Ticket::factory()->create([
                    'organization_id' => $attributes['organization_id'],
                ])->id;
            },
            'team_id' => function (array $attributes) {
                return Team::create([
                    'organization_id' => $attributes['organization_id'],
                    'name' => 'Team '.fake()->unique()->word(),
                ])->id;
            },
            'member_id' => function (array $attributes) {
                $user = User::factory()->create();

                $member = OrganizationMember::create([
                    'organization_id' => $attributes['organization_id'],
                    'user_id' => $user->id,
                    'role' => 'agent',
                ]);

                if (! empty($attributes['team_id'])) {
                    $team = Team::find($attributes['team_id']);
                    if ($team) {
                        $team->members()->attach($member->id);
                    }
                }

                return $member->id;
            },
            'assigned_by_id' => function (array $attributes) {
                return $attributes['member_id'];
            },
            'created_at' => now(),
        ];
    }
}
