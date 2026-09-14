<?php

namespace App\Models;

use App\Builders\TicketAssignmentBuilder;
use App\Context\OrganizationContext;
use App\Exceptions\ImmutableAssignmentException;
use App\Traits\BelongsToOrganization;
use DomainException;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Query\Builder;

class TicketAssignment extends Model
{
    use BelongsToOrganization;
    use HasFactory;
    use HasUuids;

    /**
     * Disable updated_at timestamp since assignments are immutable audit logs.
     */
    public const UPDATED_AT = null;

    protected $fillable = [
        'organization_id',
        'ticket_id',
        'team_id',
        'member_id',
        'assigned_by_id',
        'created_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    /**
     * Model boot lifecycle events.
     */
    protected static function booted(): void
    {
        static::creating(function (TicketAssignment $assignment) {
            if (empty($assignment->organization_id)) {
                if ($assignment->relationLoaded('ticket') && $assignment->ticket) {
                    $assignment->organization_id = $assignment->ticket->organization_id;
                } elseif (! empty($assignment->ticket_id)) {
                    $ticket = Ticket::withoutGlobalScopes()->find($assignment->ticket_id);
                    if ($ticket) {
                        $assignment->organization_id = $ticket->organization_id;
                    }
                } elseif (OrganizationContext::hasCurrent()) {
                    $assignment->organization_id = OrganizationContext::getCurrentId();
                }
            }

            if (empty($assignment->organization_id)) {
                throw new DomainException('Ticket assignment must belong to a valid organization.');
            }
        });

        static::updating(function (TicketAssignment $assignment) {
            throw new ImmutableAssignmentException(
                'Ticket assignments are append-only and strictly immutable. Updates are rejected.'
            );
        });

        static::deleting(function (TicketAssignment $assignment) {
            throw new ImmutableAssignmentException(
                'Ticket assignments are append-only and strictly immutable. Deletions are rejected.'
            );
        });
    }

    /**
     * Create a new Eloquent query builder for the model.
     *
     * @param  Builder  $query
     * @return TicketAssignmentBuilder<TicketAssignment>
     */
    public function newEloquentBuilder($query): TicketAssignmentBuilder
    {
        return new TicketAssignmentBuilder($query);
    }

    /**
     * Get the ticket that this assignment record belongs to.
     */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /**
     * Get the assigned team.
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_id');
    }

    /**
     * Get the assigned organization member.
     */
    public function member(): BelongsTo
    {
        return $this->belongsTo(OrganizationMember::class, 'member_id');
    }

    /**
     * Get the organization member who performed the assignment.
     */
    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(OrganizationMember::class, 'assigned_by_id');
    }
}
