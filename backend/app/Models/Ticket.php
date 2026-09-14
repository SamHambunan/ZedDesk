<?php

namespace App\Models;

use App\Context\OrganizationContext;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Services\TicketNumberGenerator;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
}
