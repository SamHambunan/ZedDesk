<?php

namespace App\Services;

use App\Enums\AssignmentField;
use App\Enums\TicketStatus;
use App\Events\TicketAssigned;
use App\Events\TicketChanged;
use App\Exceptions\AssignmentConflictException;
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
        protected TicketStateMachine $stateMachine,
        protected TicketNotificationService $notifications,
        protected ?AuditLogWriter $auditLogWriter = null
    ) {
        $this->auditLogWriter = $auditLogWriter ?? app(AuditLogWriter::class);
    }

    /**
     * Assign a ticket to a team, an organization member, or both.
     *
     * @throws InvalidAssignmentException
     * @throws InvalidTicketTransitionException
     * @throws DomainException
     */
    public function assign(
        Ticket $ticket,
        Team|int|string|AssignmentField|null $team = null,
        OrganizationMember|int|string|AssignmentField|null $member = null,
        OrganizationMember|int|string|null $assignedBy = null,
        ?int $expectedRevision = null
    ): TicketAssignment {
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

        return DB::transaction(fn () => app(DurableDelivery::class)->capture(function () use ($ticket, $team, $member, $teamModel, $memberModel, $assignedByModel, $expectedRevision) {
            $current = Ticket::whereKey($ticket->id)->lockForUpdate()->firstOrFail();
            $this->assertCurrentRevision($current, $expectedRevision);
            $this->assertOpen($current, 'Assignment updates are rejected.');

            $teamId = $team === AssignmentField::UNCHANGED ? $current->assigned_team_id : $teamModel?->id;
            $memberId = $member === AssignmentField::UNCHANGED ? $current->assigned_member_id : $memberModel?->id;
            if ($teamId !== null && $memberId !== null
                && ! Team::withoutGlobalScopes()->findOrFail($teamId)->hasMember(
                    OrganizationMember::withoutGlobalScopes()->findOrFail($memberId))) {
                throw new InvalidAssignmentException('The assigned organization member does not belong to the designated team.');
            }

            $previousTeamId = $current->assigned_team_id;
            $previousMemberId = $current->assigned_member_id;
            $current->assigned_team_id = $teamId;
            $current->assigned_member_id = $memberId;
            $current->save();

            /** @var TicketAssignment $assignment */
            $assignment = $current->assignments()->create([
                'organization_id' => $current->organization_id,
                'team_id' => $current->assigned_team_id,
                'member_id' => $current->assigned_member_id,
                'assigned_by_id' => $assignedByModel?->id,
            ]);

            if ($previousTeamId !== $current->assigned_team_id || $previousMemberId !== $current->assigned_member_id) {
                $this->notifications->assignmentChanged($current, $previousTeamId, $previousMemberId, $assignedByModel?->id);
                $this->auditLogWriter->recordAssignment(
                    $current,
                    $assignedByModel ?? auth()->user(),
                    $previousTeamId,
                    $current->assigned_team_id,
                    $previousMemberId,
                    $current->assigned_member_id
                );
            }

            TicketAssigned::dispatch($current, $assignment);
            app(DurableDelivery::class)->signal(new TicketChanged($current, TicketChanged::ASSIGNMENT_CHANGED));

            return $assignment;
        }));
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
    public function claim(Ticket $ticket, OrganizationMember|int|string $member, ?int $expectedRevision = null): TicketAssignment
    {
        $memberModel = $member instanceof OrganizationMember
            ? $member
            : OrganizationMember::withoutGlobalScopes()->findOrFail($member);

        if ($memberModel->organization_id !== $ticket->organization_id) {
            throw new DomainException('Cross-organization ticket claiming is rejected.');
        }

        return DB::transaction(fn () => app(DurableDelivery::class)->capture(function () use ($ticket, $memberModel, $expectedRevision) {
            $current = Ticket::whereKey($ticket->id)->lockForUpdate()->firstOrFail();
            $this->assertCurrentRevision($current, $expectedRevision);
            $this->assertOpen($current, 'Ticket claiming is rejected.');
            if ($current->assigned_member_id !== null) {
                throw new InvalidAssignmentException("Ticket #{$current->ticket_number} is already assigned to a member.");
            }
            if ($current->assigned_team_id !== null) {
                $team = Team::withoutGlobalScopes()->find($current->assigned_team_id);
                if ($team && ! $team->hasMember($memberModel)) {
                    throw new InvalidAssignmentException('Organization member is not a member of the designated team.');
                }
            }

            $previousTeamId = $current->assigned_team_id;
            $current->assigned_member_id = $memberModel->id;

            $currentStatus = $current->status instanceof TicketStatus
                ? $current->status
                : TicketStatus::from((string) $current->status);

            if ($currentStatus === TicketStatus::NEW) {
                $this->stateMachine->transitionTo($current, TicketStatus::OPEN);
            } else {
                $current->save();
            }

            /** @var TicketAssignment $assignment */
            $assignment = $current->assignments()->create([
                'organization_id' => $current->organization_id,
                'team_id' => $current->assigned_team_id,
                'member_id' => $memberModel->id,
                'assigned_by_id' => $memberModel->id,
            ]);

            $this->notifications->assignmentChanged($current, $previousTeamId, null, $memberModel->id);
            $this->auditLogWriter->recordClaim(
                $current,
                $memberModel,
                $previousTeamId,
                $current->assigned_team_id,
                $memberModel->id
            );

            TicketAssigned::dispatch($current, $assignment);
            app(DurableDelivery::class)->signal(new TicketChanged($current, TicketChanged::ASSIGNMENT_CHANGED));

            return $assignment;
        }));
    }

    private function assertCurrentRevision(Ticket $ticket, ?int $expectedRevision): void
    {
        if ($expectedRevision !== null && $expectedRevision !== $ticket->assignment_revision) {
            throw new AssignmentConflictException([
                'assigned_team_id' => $ticket->assigned_team_id,
                'assigned_member_id' => $ticket->assigned_member_id,
                'assignment_revision' => $ticket->assignment_revision,
                'revision' => $ticket->revision,
            ]);
        }
    }

    private function assertOpen(Ticket $ticket, string $message): void
    {
        if ($ticket->isClosed()) {
            throw new InvalidTicketTransitionException("Ticket #{$ticket->ticket_number} is closed and immutable. {$message}");
        }
    }
}
