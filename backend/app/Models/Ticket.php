<?php

namespace App\Models;

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Events\TicketCreated;
use App\Exceptions\InvalidTicketTransitionException;
use App\Services\TicketNumberGenerator;
use App\Traits\BelongsToOrganization;
use DomainException;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;

class Ticket extends Model
{
    use BelongsToOrganization;
    use HasFactory;
    use HasUuids;
    use SoftDeletes;

    protected $fillable = [
        'organization_id',
        'customer_id',
        'ticket_number',
        'subject',
        'status',
        'priority',
        'assigned_team_id',
        'assigned_member_id',
        'first_replied_at',
        'resolved_at',
        'closed_at',
        'created_at',
    ];

    /**
     * The model's default attribute values.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'new',
        'priority' => 'medium',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'ticket_number' => 'integer',
            'status' => TicketStatus::class,
            'priority' => TicketPriority::class,
            'first_replied_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    /**
     * Model boot lifecycle events.
     */
    protected static function booted(): void
    {
        static::creating(function (Ticket $ticket) {
            if (empty($ticket->organization_id) && OrganizationContext::hasCurrent()) {
                $ticket->organization_id = OrganizationContext::getCurrentId();
            }

            if (empty($ticket->ticket_number) && ! empty($ticket->organization_id)) {
                $ticket->ticket_number = app(TicketNumberGenerator::class)->generate($ticket->organization_id);
            }
        });

        static::created(function (Ticket $ticket) {
            TicketCreated::dispatch($ticket);
        });

        static::updating(function (Ticket $ticket) {
            $originalStatus = $ticket->getOriginal('status');
            $originalStatusValue = $originalStatus instanceof TicketStatus ? $originalStatus->value : (string) $originalStatus;

            if ($originalStatusValue === TicketStatus::CLOSED->value) {
                throw new InvalidTicketTransitionException(
                    "Ticket #{$ticket->ticket_number} is closed and immutable. Attribute updates are rejected."
                );
            }
        });
    }

    /**
     * Get the customer that submitted the ticket.
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the team assigned to the ticket.
     */
    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'assigned_team_id');
    }

    /**
     * Get the organization member assigned to the ticket.
     */
    public function assignedMember(): BelongsTo
    {
        return $this->belongsTo(OrganizationMember::class, 'assigned_member_id');
    }

    /**
     * Determine whether the ticket is in closed status.
     */
    public function isClosed(): bool
    {
        $status = $this->status instanceof TicketStatus ? $this->status : TicketStatus::tryFrom((string) $this->status);

        return $status === TicketStatus::CLOSED;
    }

    /**
     * Determine whether the ticket can accept conversation replies.
     */
    public function canReply(): bool
    {
        return ! $this->isClosed();
    }

    /**
     * Get all assignment history records for this ticket ordered chronologically.
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(TicketAssignment::class)->oldest();
    }

    /**
     * Get all conversation messages for this ticket ordered chronologically.
     */
    public function messages(): HasMany
    {
        return $this->hasMany(TicketMessage::class)->oldest();
    }

    /**
     * Get only customer-visible messages (public replies) ordered chronologically.
     */
    public function customerVisibleMessages(): HasMany
    {
        return $this->hasMany(TicketMessage::class)
            ->where('message_type', TicketMessageType::PUBLIC_REPLY->value)
            ->oldest();
    }

    /**
     * Get only internal notes ordered chronologically.
     */
    public function internalNotes(): HasMany
    {
        return $this->hasMany(TicketMessage::class)
            ->where('message_type', TicketMessageType::INTERNAL_NOTE->value)
            ->oldest();
    }

    /**
     * Get all attachments for this ticket across all conversation messages.
     */
    public function attachments(): HasManyThrough
    {
        return $this->hasManyThrough(
            TicketAttachment::class,
            TicketMessage::class,
            'ticket_id',
            'ticket_message_id',
            'id',
            'id'
        );
    }

    /**
     * Add a public reply to this ticket.
     */
    public function addPublicReply(Model $author, string $body, TicketStatus|string|null $targetStatus = null): TicketMessage
    {
        return $this->messages()->create([
            'organization_id' => $this->organization_id,
            'message_type' => TicketMessageType::PUBLIC_REPLY,
            'author_type' => $author->getMorphClass(),
            'author_id' => (string) $author->getKey(),
            'body' => $body,
            'target_status' => $targetStatus,
        ]);
    }

    /**
     * Add an internal note to this ticket.
     */
    public function addInternalNote(Model $author, string $body): TicketMessage
    {
        return $this->messages()->create([
            'organization_id' => $this->organization_id,
            'message_type' => TicketMessageType::INTERNAL_NOTE,
            'author_type' => $author->getMorphClass(),
            'author_id' => (string) $author->getKey(),
            'body' => $body,
        ]);
    }

    /**
     * Ensure the ticket is not closed before mutating relationships or attributes.
     *
     * @throws InvalidTicketTransitionException
     */
    protected function ensureNotClosed(string $actionMessage): void
    {
        $status = $this->status instanceof TicketStatus ? $this->status->value : (string) $this->status;
        $originalStatus = $this->getOriginal('status');
        $originalStatusValue = $originalStatus instanceof TicketStatus ? $originalStatus->value : (string) $originalStatus;

        if ($status === TicketStatus::CLOSED->value || $originalStatusValue === TicketStatus::CLOSED->value) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$this->ticket_number} is closed and immutable. {$actionMessage}"
            );
        }
    }

    /**
     * Update the ticket's priority classification.
     *
     * @throws InvalidTicketTransitionException
     * @throws \ValueError
     */
    public function updatePriority(TicketPriority|string $priority): self
    {
        $this->ensureNotClosed('Priority updates are rejected.');

        $resolved = is_string($priority) ? TicketPriority::from($priority) : $priority;

        $this->update(['priority' => $resolved]);

        return $this;
    }

    /**
     * Get the tags associated with this ticket.
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'ticket_tags', 'ticket_id', 'tag_id')
            ->withTimestamps();
    }

    /**
     * Attach a tag to this ticket within the same organization.
     *
     * @throws DomainException
     * @throws InvalidTicketTransitionException
     */
    public function attachTag(Tag|string $tag): self
    {
        $this->ensureNotClosed('Tag changes are rejected.');

        $tagModel = $tag instanceof Tag ? $tag : Tag::withoutGlobalScopes()->findOrFail($tag);

        if ($tagModel->organization_id !== $this->organization_id) {
            throw new DomainException('Cross-organization tag assignment is rejected.');
        }

        $this->tags()->syncWithoutDetaching([$tagModel->id]);

        return $this;
    }

    /**
     * Detach a tag from this ticket within the same organization.
     *
     * @throws DomainException
     * @throws InvalidTicketTransitionException
     */
    public function detachTag(Tag|string $tag): self
    {
        $this->ensureNotClosed('Tag changes are rejected.');

        $tagModel = $tag instanceof Tag ? $tag : Tag::withoutGlobalScopes()->findOrFail($tag);

        if ($tagModel->organization_id !== $this->organization_id) {
            throw new DomainException('Cross-organization tag detachment is rejected.');
        }

        $this->tags()->detach($tagModel->id);

        return $this;
    }

    /**
     * Sync tags for this ticket within the same organization.
     *
     * @param  iterable<Tag|string>  $tags
     *
     * @throws DomainException
     * @throws InvalidTicketTransitionException
     */
    public function syncTags(iterable $tags): self
    {
        $this->ensureNotClosed('Tag changes are rejected.');

        $tagIds = [];
        foreach ($tags as $tag) {
            $tagModel = $tag instanceof Tag ? $tag : Tag::withoutGlobalScopes()->findOrFail($tag);

            if ($tagModel->organization_id !== $this->organization_id) {
                throw new DomainException('Cross-organization tag assignment is rejected.');
            }

            $tagIds[] = $tagModel->id;
        }

        $this->tags()->sync($tagIds);

        return $this;
    }
}
