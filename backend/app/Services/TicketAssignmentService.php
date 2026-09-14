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
     * Assign or route a ticket to a team, an organization member, or both.
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

        $teamModel = $team instanceof Team
            ? $team
            : (! empty($team) ? Team::withoutGlobalScopes()->find($team) : null);

        $memberModel = $member instanceof OrganizationMember
            ? $member
            : (! empty($member) ? OrganizationMember::withoutGlobalScopes()->find($member) : null);

        $assignedByModel = $assignedBy instanceof OrganizationMember
            ? $assignedBy
            : (! empty($assignedBy) ? OrganizationMember::withoutGlobalScopes()->find($assignedBy) : null);

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

        // Dual-tier routing constraint: if both team and member are designated, member must belong to team
        $targetTeamId = $team !== null ? $teamModel?->id : $ticket->assigned_team_id;
        $targetMemberId = $member !== null ? $memberModel?->id : $ticket->assigned_member_id;

        if ($targetTeamId && $targetMemberId) {
            $isMemberInTeam = DB::table('team_members')
                ->where('team_id', $targetTeamId)
                ->where('organization_member_id', $targetMemberId)
                ->exists();

            if (! $isMemberInTeam) {
                throw new InvalidAssignmentException(
                    'The assigned member does not belong to the designated team.'
                );
            }
        }

        return DB::transaction(function () use ($ticket, $teamModel, $memberModel, $assignedByModel, $team, $member) {
            if ($team !== null) {
                $ticket->assigned_team_id = $teamModel?->id;
            }

            if ($member !== null) {
                $ticket->assigned_member_id = $memberModel?->id;
            }

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
     * Claim an unassigned ticket for the given organization member.
     * Auto-advances ticket status from 'new' to 'open' and records first_replied_at.
     *
     * @throws InvalidAssignmentException
     * @throws InvalidTicketTransitionException
     * @throws DomainException
     */
    public function claim(Ticket $ticket, OrganizationMember|int|string $agent): TicketAssignment
    {
        if ($ticket->isClosed()) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$ticket->ticket_number} is closed and immutable. Ticket claiming is rejected."
            );
        }

        $agentModel = $agent instanceof OrganizationMember
            ? $agent
            : OrganizationMember::withoutGlobalScopes()->findOrFail($agent);

        if ($agentModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization ticket claiming is rejected.');
        }

        if ($ticket->assigned_member_id !== null) {
            throw new InvalidAssignmentException(
                "Ticket #{$ticket->ticket_number} is already assigned to a member."
            );
        }

        if ($ticket->assigned_team_id !== null) {
            $isMemberInTeam = DB::table('team_members')
                ->where('team_id', $ticket->assigned_team_id)
                ->where('organization_member_id', $agentModel->id)
                ->exists();

            if (! $isMemberInTeam) {
                throw new InvalidAssignmentException(
                    'Agent is not a member of the designated team.'
                );
            }
        }

        return DB::transaction(function () use ($ticket, $agentModel) {
            $ticket->assigned_member_id = $agentModel->id;

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
                'member_id' => $agentModel->id,
                'assigned_by_id' => $agentModel->id,
            ]);

            TicketAssigned::dispatch($ticket, $assignment);

            return $assignment;
        });
    }
}
