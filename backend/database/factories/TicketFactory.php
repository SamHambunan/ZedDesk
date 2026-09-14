<?php

namespace Database\Factories;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Ticket>
 */
class TicketFactory extends Factory
{
    protected $model = Ticket::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'customer_id' => function (array $attributes) {
                return Customer::factory()->create([
                    'organization_id' => $attributes['organization_id'],
                ])->id;
            },
            'subject' => fake()->sentence(),
            'status' => TicketStatus::NEW->value,
            'priority' => TicketPriority::MEDIUM->value,
            'assigned_team_id' => null,
            'assigned_member_id' => null,
        ];
    }
}
