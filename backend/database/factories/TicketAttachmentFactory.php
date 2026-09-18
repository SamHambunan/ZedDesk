<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<TicketAttachment>
 */
class TicketAttachmentFactory extends Factory
{
    protected $model = TicketAttachment::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $id = (string) Str::uuid();

        return [
            'id' => $id,
            'organization_id' => Organization::factory(),
            'ticket_message_id' => TicketMessage::factory(),
            'file_name' => 'document.pdf',
            'file_path' => "attachments/{$id}.pdf",
            'mime_type' => 'application/pdf',
            'file_size' => fake()->numberBetween(1024, 1048576),
        ];
    }
}
