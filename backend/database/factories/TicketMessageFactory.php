<?php

namespace Database\Factories;

use App\Enums\TicketMessageType;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TicketMessage>
 */
class TicketMessageFactory extends Factory
{
    protected $model = TicketMessage::class;

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
            'message_type' => TicketMessageType::PUBLIC_REPLY,
            'author_type' => Customer::class,
            'author_id' => function (array $attributes) {
                return Customer::factory()->create([
                    'organization_id' => $attributes['organization_id'],
                ])->id;
            },
            'body' => fake()->paragraph(),
        ];
    }

    /**
     * Indicate that the message is an internal note.
     */
    public function internalNote(): static
    {
        return $this->state(fn (array $attributes) => [
            'message_type' => TicketMessageType::INTERNAL_NOTE,
        ]);
    }

    /**
     * Indicate that the message is a public reply.
     */
    public function publicReply(): static
    {
        return $this->state(fn (array $attributes) => [
            'message_type' => TicketMessageType::PUBLIC_REPLY,
        ]);
    }
}
