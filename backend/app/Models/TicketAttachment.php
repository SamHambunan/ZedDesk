<?php

namespace App\Models;

use App\Exceptions\ImmutableAttachmentException;
use App\Traits\BelongsToOrganization;
use DomainException;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;

class TicketAttachment extends Model
{
    use BelongsToOrganization;
    use HasFactory;
    use HasUuids;

    protected $fillable = [
        'id',
        'organization_id',
        'ticket_message_id',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
        ];
    }

    /**
     * Model boot lifecycle events enforcing tenant resolution and append-only immutability.
     */
    protected static function booted(): void
    {
        static::creating(function (TicketAttachment $attachment) {
            $message = $attachment->relationLoaded('ticketMessage')
                ? $attachment->ticketMessage
                : (! empty($attachment->ticket_message_id) ? TicketMessage::withoutGlobalScopes()->find($attachment->ticket_message_id) : null);

            if (! $message) {
                throw new DomainException('Ticket attachment must belong to a valid ticket message.');
            }

            if (empty($attachment->organization_id)) {
                $attachment->organization_id = $message->organization_id;
            }

            if ($attachment->organization_id !== $message->organization_id) {
                throw new DomainException('Cross-organization ticket attachment creation is rejected.');
            }
        });

        static::updating(function () {
            throw new ImmutableAttachmentException('Ticket attachments are append-only and immutable. Updates are rejected.');
        });

        static::deleting(function () {
            throw new ImmutableAttachmentException('Ticket attachments are append-only and immutable. Deletion is rejected.');
        });
    }

    /**
     * Get the ticket message that owns the attachment.
     */
    public function message(): BelongsTo
    {
        return $this->belongsTo(TicketMessage::class, 'ticket_message_id');
    }

    /**
     * Alias relationship for message.
     */
    public function ticketMessage(): BelongsTo
    {
        return $this->message();
    }

    /**
     * Get the ticket associated with this attachment through the message.
     */
    public function ticket(): HasOneThrough
    {
        return $this->hasOneThrough(
            Ticket::class,
            TicketMessage::class,
            'id',                // Foreign key on ticket_messages table...
            'id',                // Foreign key on tickets table...
            'ticket_message_id', // Local key on ticket_attachments table...
            'ticket_id'          // Local key on ticket_messages table...
        );
    }
}
