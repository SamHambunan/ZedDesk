<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Events\TicketAssigned;
use App\Exceptions\InvalidAssignmentException;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAssignment;
use DomainException;
use Illuminate\Support\Facades\DB;

class TicketAssignmentService
{
    public function __construct(
        protected TicketStateMachine $stateMachine
    ) {}

    /**
     * Assign a ticket to a team, an organization member, or both.
     *
     * @throws InvalidAssignmentException
     * @throws InvalidTicketTransitionException
     * @throws DomainException
     */
    public function assign(
        Ticket $ticket,
        Team|int|string|null $team = null,
        OrganizationMember|int|string|null $member = null,
        OrganizationMember|int|string|null $assignedBy = null
    ): TicketAssignment {
        if ($ticket->isClosed()) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$ticket->ticket_number} is closed and immutable. Assignment updates are rejected."
            );
        }

        $teamModel = match (true) {
            $team instanceof Team => $team,
            is_int($team) || (is_string($team) && $team !== '') => Team::withoutGlobalScopes()->findOrFail($team),
            default => null,
        };

        $memberModel = match (true) {
            $member instanceof OrganizationMember => $member,
            is_int($member) || (is_string($member) && $member !== '') => OrganizationMember::withoutGlobalScopes()->findOrFail($member),
            default => null,
        };

        $assignedByModel = match (true) {
            $assignedBy instanceof OrganizationMember => $assignedBy,
            is_int($assignedBy) || (is_string($assignedBy) && $assignedBy !== '') => OrganizationMember::withoutGlobalScopes()->findOrFail($assignedBy),
            default => null,
        };

        // Strict cross-tenant boundary validation
        if ($teamModel && $teamModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization team assignment is rejected.');
        }

        if ($memberModel && $memberModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization member assignment is rejected.');
        }

        if ($assignedByModel && $assignedByModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization assignment author is rejected.');
        }

        // Dual-tier assignment constraint: if both team and member are designated, member must belong to team
        if ($teamModel && $memberModel && ! $teamModel->hasMember($memberModel)) {
            throw new InvalidAssignmentException(
                'The assigned organization member does not belong to the designated team.'
            );
        }

        return DB::transaction(function () use ($ticket, $teamModel, $memberModel, $assignedByModel) {
            $ticket->assigned_team_id = $teamModel?->id;
            $ticket->assigned_member_id = $memberModel?->id;
            $ticket->save();

            /** @var TicketAssignment $assignment */
            $assignment = $ticket->assignments()->create([
                'organization_id' => $ticket->organization_id,
                'team_id' => $ticket->assigned_team_id,
                'member_id' => $ticket->assigned_member_id,
                'assigned_by_id' => $assignedByModel?->id,
            ]);

            TicketAssigned::dispatch($ticket, $assignment);

            return $assignment;
        });
    }

    /**
     * Unassign a ticket from any team and organization member.
     *
     * @throws InvalidTicketTransitionException
     * @throws DomainException
     */
    public function unassign(
        Ticket $ticket,
        OrganizationMember|int|string|null $assignedBy = null
    ): TicketAssignment {
        return $this->assign($ticket, team: null, member: null, assignedBy: $assignedBy);
    }

    /**
     * Claim an unassigned ticket for the given organization member.
     * Auto-advances ticket status from 'new' to 'open' and records first_replied_at.
     *
     * @throws InvalidAssignmentException
     * @throws InvalidTicketTransitionException
     * @throws DomainException
     */
    public function claim(Ticket $ticket, OrganizationMember|int|string $member): TicketAssignment
    {
        if ($ticket->isClosed()) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$ticket->ticket_number} is closed and immutable. Ticket claiming is rejected."
            );
        }

        $memberModel = $member instanceof OrganizationMember
            ? $member
            : OrganizationMember::withoutGlobalScopes()->findOrFail($member);

        if ($memberModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization ticket claiming is rejected.');
        }

        if ($ticket->assigned_member_id !== null) {
            throw new InvalidAssignmentException(
                "Ticket #{$ticket->ticket_number} is already assigned to a member."
            );
        }

        if ($ticket->assigned_team_id !== null) {
            $team = Team::withoutGlobalScopes()->find($ticket->assigned_team_id);
            if ($team && ! $team->hasMember($memberModel)) {
                throw new InvalidAssignmentException(
                    'Organization member is not a member of the designated team.'
                );
            }
        }

        return DB::transaction(function () use ($ticket, $memberModel) {
            $ticket->assigned_member_id = $memberModel->id;

            $currentStatus = $ticket->status instanceof TicketStatus
                ? $ticket->status
                : TicketStatus::from((string) $ticket->status);

            if ($currentStatus === TicketStatus::NEW) {
                $this->stateMachine->transitionTo($ticket, TicketStatus::OPEN);
            } else {
                $ticket->save();
            }

            /** @var TicketAssignment $assignment */
            $assignment = $ticket->assignments()->create([
                'organization_id' => $ticket->organization_id,
                'team_id' => $ticket->assigned_team_id,
                'member_id' => $memberModel->id,
                'assigned_by_id' => $memberModel->id,
            ]);

            TicketAssigned::dispatch($ticket, $assignment);

            return $assignment;
        });
    }
}
