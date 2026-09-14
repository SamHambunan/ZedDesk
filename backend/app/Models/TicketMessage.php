<?php

namespace App\Models;

use App\Builders\TicketMessageBuilder;
use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketStatus;
use App\Exceptions\ImmutableMessageException;
use App\Services\TicketStateMachine;
use App\Traits\BelongsToOrganization;
use DomainException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class TicketMessage extends Model
{
    use BelongsToOrganization;
    use HasFactory;
    use HasUuids;

    protected $fillable = [
        'organization_id',
        'ticket_id',
        'message_type',
        'author_type',
        'author_id',
        'body',
        'status',
        'target_status',
    ];

    /**
     * The model's default attribute values.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'message_type' => 'public_reply',
    ];

    /**
     * Target status override extracted from payload.
     */
    protected ?TicketStatus $targetStatusOverride = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'message_type' => TicketMessageType::class,
        ];
    }

    /**
     * Model boot lifecycle hooks enforcing tenant resolution, reply preconditions,
     * status machine triggers, and append-only immutability.
     */
    protected static function booted(): void
    {
        static::creating(function (TicketMessage $message) {
            // 1. Automatic tenant scoping resolution
            if (empty($message->organization_id)) {
                if (! empty($message->ticket_id)) {
                    $ticket = $message->relationLoaded('ticket')
                        ? $message->ticket
                        : Ticket::withoutGlobalScopes()->find($message->ticket_id);

                    if ($ticket) {
                        $message->organization_id = $ticket->organization_id;
                    }
                }

                if (empty($message->organization_id) && OrganizationContext::hasCurrent()) {
                    $message->organization_id = OrganizationContext::getCurrentId();
                }
            }

            // 2. Validate ticket existence and tenant consistency
            $ticket = $message->relationLoaded('ticket')
                ? $message->ticket
                : Ticket::withoutGlobalScopes()->find($message->ticket_id);

            if (! $ticket) {
                throw new DomainException('Ticket message must belong to a valid ticket.');
            }

            if (! empty($message->organization_id) && $message->organization_id !== $ticket->organization_id) {
                throw new DomainException('Cross-tenant ticket message creation is rejected.');
            }

            // 3. Reject replies on closed tickets
            app(TicketStateMachine::class)->assertCanReply($ticket);

            // 4. Privacy: Customers cannot create internal notes
            if ($message->isCustomerAuthor() && $message->isInternalNote()) {
                throw new DomainException('Customers cannot create internal notes.');
            }
        });

        static::created(function (TicketMessage $message) {
            // Trigger lifecycle state machine transitions
            app(TicketStateMachine::class)->handleMessageCreated(
                $message,
                $message->getTargetStatusOverride()
            );
        });

        static::updating(function (TicketMessage $message) {
            throw new ImmutableMessageException(
                'Ticket messages are append-only and strictly immutable. Updates are rejected.'
            );
        });

        static::deleting(function (TicketMessage $message) {
            throw new ImmutableMessageException(
                'Ticket messages are append-only and strictly immutable. Deletions are rejected.'
            );
        });
    }

    /**
     * Create a new Eloquent query builder for the model.
     *
     * @param  \Illuminate\Database\Query\Builder  $query
     * @return TicketMessageBuilder<TicketMessage>
     */
    public function newEloquentBuilder($query): TicketMessageBuilder
    {
        return new TicketMessageBuilder($query);
    }

    /**
     * Get the parent ticket that owns the message.
     */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /**
     * Get the polymorphic author (Customer, OrganizationMember, or User).
     */
    public function author(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Scope query to messages visible to customers (public replies only).
     */
    public function scopeCustomerVisible(Builder $query): Builder
    {
        return $query->where('message_type', TicketMessageType::PUBLIC_REPLY->value);
    }

    /**
     * Alias for customer-visible scope.
     */
    public function scopeForCustomer(Builder $query): Builder
    {
        return $this->scopeCustomerVisible($query);
    }

    /**
     * Scope query to messages visible to staff (public replies and internal notes).
     */
    public function scopeStaffVisible(Builder $query): Builder
    {
        return $query->whereIn('message_type', [
            TicketMessageType::PUBLIC_REPLY->value,
            TicketMessageType::INTERNAL_NOTE->value,
        ]);
    }

    /**
     * Alias for staff-visible scope.
     */
    public function scopeForStaff(Builder $query): Builder
    {
        return $this->scopeStaffVisible($query);
    }

    /**
     * Scope query to internal notes only.
     */
    public function scopeInternalNotes(Builder $query): Builder
    {
        return $query->where('message_type', TicketMessageType::INTERNAL_NOTE->value);
    }

    /**
     * Scope query to public replies only.
     */
    public function scopePublicReplies(Builder $query): Builder
    {
        return $query->where('message_type', TicketMessageType::PUBLIC_REPLY->value);
    }

    /**
     * Determine whether the message is a public reply.
     */
    public function isPublicReply(): bool
    {
        $type = $this->message_type instanceof TicketMessageType
            ? $this->message_type->value
            : (string) $this->message_type;

        return $type === TicketMessageType::PUBLIC_REPLY->value;
    }

    /**
     * Determine whether the message is an internal note.
     */
    public function isInternalNote(): bool
    {
        $type = $this->message_type instanceof TicketMessageType
            ? $this->message_type->value
            : (string) $this->message_type;

        return $type === TicketMessageType::INTERNAL_NOTE->value;
    }

    /**
     * Determine whether the message author is an external customer.
     */
    public function isCustomerAuthor(): bool
    {
        if ($this->relationLoaded('author') && $this->author instanceof Customer) {
            return true;
        }

        return $this->author_type === Customer::class || $this->author_type === 'customer';
    }

    /**
     * Determine whether the message author is an internal staff member (User or OrganizationMember).
     */
    public function isStaffAuthor(): bool
    {
        return ! $this->isCustomerAuthor();
    }

    /**
     * Intercept status override attribute from creation payloads without persisting to DB.
     */
    public function setStatusAttribute(mixed $value): void
    {
        if (! empty($value)) {
            $this->targetStatusOverride = $value instanceof TicketStatus
                ? $value
                : TicketStatus::tryFrom((string) $value);
        }
    }

    /**
     * Intercept target_status override attribute from creation payloads without persisting to DB.
     */
    public function setTargetStatusAttribute(mixed $value): void
    {
        if (! empty($value)) {
            $this->targetStatusOverride = $value instanceof TicketStatus
                ? $value
                : TicketStatus::tryFrom((string) $value);
        }
    }

    /**
     * Get the parsed target status override, if provided.
     */
    public function getTargetStatusOverride(): ?TicketStatus
    {
        return $this->targetStatusOverride;
    }
}
