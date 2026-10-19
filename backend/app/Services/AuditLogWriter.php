<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

class AuditLogWriter
{
    public function recordPriorityChange(Ticket $ticket, User $actor, TicketPriority $old, TicketPriority $new): void
    {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.priority_changed',
            changes: ['priority' => ['old' => $old->value, 'new' => $new->value]],
            requestLocation: '/api/tickets/{ticket}/priority',
        );
    }

    public function recordStatusChange(Ticket $ticket, User|OrganizationMember|null $actor, TicketStatus|string $old, TicketStatus|string $new): void
    {
        $oldValue = $old instanceof TicketStatus ? $old->value : (string) $old;
        $newValue = $new instanceof TicketStatus ? $new->value : (string) $new;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.status_changed',
            changes: ['status' => ['old' => $oldValue, 'new' => $newValue]],
            requestLocation: '/api/tickets/{ticket}/status',
        );
    }

    public function recordTicketCreated(Ticket $ticket, User|Customer|OrganizationMember|null $actor = null): void
    {
        $statusValue = $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status;
        $priorityValue = $ticket->priority instanceof TicketPriority ? $ticket->priority->value : (string) $ticket->priority;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.created',
            changes: [
                'status' => $statusValue,
                'priority' => $priorityValue,
                'ticket_number' => $ticket->ticket_number,
            ],
            requestLocation: $actor instanceof Customer ? '/api/portal/tickets' : '/api/tickets',
        );
    }

    public function recordPublicReply(Ticket $ticket, User|Customer|OrganizationMember|null $actor, TicketMessage $message): void
    {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.public_reply_created',
            changes: [
                'message_id' => $message->id,
                'message_type' => 'public_reply',
            ],
            requestLocation: $actor instanceof Customer ? '/api/portal/tickets/{ticket}/reply' : '/api/tickets/{ticket}/messages',
        );
    }

    public function recordInternalNote(Ticket $ticket, User|OrganizationMember|null $actor, TicketMessage $message): void
    {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.internal_note_created',
            changes: [
                'message_id' => $message->id,
                'message_type' => 'internal_note',
            ],
            requestLocation: '/api/tickets/{ticket}/messages',
        );
    }

    public function recordAttachmentCreated(Ticket $ticket, User|Customer|OrganizationMember|null $actor, TicketAttachment $attachment, ?TicketMessage $message = null): void
    {
        $messageId = $attachment->ticket_message_id ?? $message?->id;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.attachment_created',
            changes: [
                'attachment_id' => $attachment->id,
                'message_id' => $messageId,
                'mime_type' => $attachment->mime_type,
                'file_size' => $attachment->file_size,
            ],
            requestLocation: '/api/tickets/{ticket}/messages/{message}/attachments',
        );
    }

    public function recordAssignment(
        Ticket $ticket,
        User|OrganizationMember|null $actor,
        ?int $oldTeamId,
        ?int $newTeamId,
        ?int $oldMemberId,
        ?int $newMemberId
    ): void {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.assigned',
            changes: [
                'team_id' => ['old' => $oldTeamId, 'new' => $newTeamId],
                'member_id' => ['old' => $oldMemberId, 'new' => $newMemberId],
            ],
            requestLocation: '/api/tickets/{ticket}/assign',
        );
    }

    public function recordClaim(
        Ticket $ticket,
        User|OrganizationMember|null $actor,
        ?int $oldTeamId,
        ?int $newTeamId,
        ?int $newMemberId
    ): void {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.claimed',
            changes: [
                'team_id' => ['old' => $oldTeamId, 'new' => $newTeamId],
                'member_id' => ['old' => null, 'new' => $newMemberId],
            ],
            requestLocation: '/api/tickets/{ticket}/claim',
        );
    }

    public function recordTagAttached(Ticket $ticket, User|OrganizationMember|null $actor, Tag|string $tag): void
    {
        $tagId = $tag instanceof Tag ? $tag->id : $tag;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.tag_attached',
            changes: ['tag_id' => $tagId],
            requestLocation: '/api/tickets/{ticket}/tags',
        );
    }

    public function recordTagDetached(Ticket $ticket, User|OrganizationMember|null $actor, Tag|string $tag): void
    {
        $tagId = $tag instanceof Tag ? $tag->id : $tag;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.tag_detached',
            changes: ['tag_id' => $tagId],
            requestLocation: '/api/tickets/{ticket}/tags/{tag}',
        );
    }

    public function recordSoftDelete(Ticket $ticket, User|OrganizationMember|null $actor): void
    {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.deleted',
            changes: ['deleted' => true],
            requestLocation: '/api/tickets/{ticket}',
        );
    }

    public function recordRestore(Ticket $ticket, User|OrganizationMember|null $actor): void
    {
        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.restored',
            changes: ['restored' => true],
            requestLocation: '/api/tickets/{ticket}/restore',
        );
    }

    public function recordOrganizationCreated(Organization $organization, User $actor): void
    {
        $this->recordAction(
            organizationId: (int) $organization->id,
            actor: $actor,
            action: 'organization.created',
            changes: ['organization_id' => (int) $organization->id],
            requestLocation: '/api/organizations',
            targetType: 'organization',
            targetId: (string) $organization->id,
        );
    }

    public function recordTeamCreated(Team $team, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $team->organization_id,
            actor: $actor,
            action: 'team.created',
            changes: ['team_id' => (int) $team->id],
            requestLocation: '/api/teams',
            targetType: 'team',
            targetId: (string) $team->id,
        );
    }

    public function recordTeamUpdated(Team $team, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $team->organization_id,
            actor: $actor,
            action: 'team.updated',
            changes: [
                'team_id' => (int) $team->id,
                'updated' => true,
            ],
            requestLocation: '/api/teams/{id}',
            targetType: 'team',
            targetId: (string) $team->id,
        );
    }

    public function recordTeamDeleted(Team $team, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $team->organization_id,
            actor: $actor,
            action: 'team.deleted',
            changes: [
                'team_id' => (int) $team->id,
                'deleted' => true,
            ],
            requestLocation: '/api/teams/{id}',
            targetType: 'team',
            targetId: (string) $team->id,
        );
    }

    public function recordTeamMemberAdded(Team $team, OrganizationMember $member, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $team->organization_id,
            actor: $actor,
            action: 'team.member_added',
            changes: [
                'team_id' => (int) $team->id,
                'member_id' => (int) $member->id,
                'user_id' => (int) $member->user_id,
            ],
            requestLocation: '/api/teams/{id}/members',
            targetType: 'team',
            targetId: (string) $team->id,
        );
    }

    public function recordTeamMemberRemoved(Team $team, OrganizationMember $member, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $team->organization_id,
            actor: $actor,
            action: 'team.member_removed',
            changes: [
                'team_id' => (int) $team->id,
                'member_id' => (int) $member->id,
                'user_id' => (int) $member->user_id,
            ],
            requestLocation: '/api/teams/{id}/members/{memberId}',
            targetType: 'team',
            targetId: (string) $team->id,
        );
    }

    public function recordInvitationCreated(Invitation $invitation, User|OrganizationMember|null $actor): void
    {
        $roleValue = $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role;

        $this->recordAction(
            organizationId: (int) $invitation->organization_id,
            actor: $actor,
            action: 'invitation.created',
            changes: [
                'invitation_id' => (int) $invitation->id,
                'role' => $roleValue,
            ],
            requestLocation: '/api/invitations',
            targetType: 'invitation',
            targetId: (string) $invitation->id,
        );
    }

    public function recordInvitationRevoked(Invitation $invitation, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $invitation->organization_id,
            actor: $actor,
            action: 'invitation.revoked',
            changes: [
                'invitation_id' => (int) $invitation->id,
                'revoked' => true,
            ],
            requestLocation: '/api/invitations/{id}',
            targetType: 'invitation',
            targetId: (string) $invitation->id,
        );
    }

    public function recordInvitationAccepted(Invitation $invitation, User|OrganizationMember|null $actor, ?OrganizationMember $member = null): void
    {
        $roleValue = $invitation->role instanceof Role ? $invitation->role->value : (string) $invitation->role;
        $memberId = $member?->id;
        $userId = $actor instanceof User ? $actor->id : ($actor instanceof OrganizationMember ? $actor->user_id : null);

        $changes = [
            'invitation_id' => (int) $invitation->id,
            'role' => $roleValue,
        ];
        if ($memberId !== null) {
            $changes['member_id'] = (int) $memberId;
        }
        if ($userId !== null) {
            $changes['user_id'] = (int) $userId;
        }

        $this->recordAction(
            organizationId: (int) $invitation->organization_id,
            actor: $actor,
            action: 'invitation.accepted',
            changes: $changes,
            requestLocation: '/api/invitations/{token}/accept',
            targetType: 'invitation',
            targetId: (string) $invitation->id,
        );
    }

    public function recordTagCreated(Tag $tag, User|OrganizationMember|null $actor): void
    {
        $this->recordAction(
            organizationId: (int) $tag->organization_id,
            actor: $actor,
            action: 'tag.created',
            changes: [
                'tag_id' => (string) $tag->id,
            ],
            requestLocation: '/api/tags',
            targetType: 'tag',
            targetId: (string) $tag->id,
        );
    }

    /**
     * Record a generalized business audit log entry.
     */
    public function record(
        Ticket $ticket,
        User|Customer|OrganizationMember|null $actor,
        string $action,
        array $changes,
        string $requestLocation,
        string $targetType = 'ticket',
        ?string $targetId = null,
        string $classification = 'business',
        string $outcome = 'success',
    ): void {
        $this->recordAction(
            organizationId: (int) $ticket->organization_id,
            actor: $actor,
            action: $action,
            changes: $changes,
            requestLocation: $requestLocation,
            targetType: $targetType,
            targetId: $targetId ?? (string) $ticket->id,
            classification: $classification,
            outcome: $outcome,
        );
    }

    public function recordRegistration(User $user, ?string $requestLocation = null): void
    {
        $this->recordAction(
            organizationId: null,
            actor: $user,
            action: 'auth.register',
            changes: ['user_id' => (string) $user->id],
            requestLocation: $requestLocation ?? '/api/register',
            targetType: 'user',
            targetId: (string) $user->id,
            classification: 'security',
            outcome: 'success',
        );
    }

    public function recordLoginSuccess(User $user, ?string $requestLocation = null): void
    {
        $this->recordAction(
            organizationId: null,
            actor: $user,
            action: 'auth.login',
            changes: ['user_id' => (string) $user->id],
            requestLocation: $requestLocation ?? '/api/login',
            targetType: 'user',
            targetId: (string) $user->id,
            classification: 'security',
            outcome: 'success',
        );
    }

    public function recordLoginDenied(?User $user = null, ?string $requestLocation = null): void
    {
        $this->recordAction(
            organizationId: null,
            actor: 'unresolved',
            action: 'auth.login',
            changes: ['reason' => 'invalid_credentials'],
            requestLocation: $requestLocation ?? '/api/login',
            targetType: 'user',
            targetId: $user ? (string) $user->id : null,
            classification: 'security',
            outcome: 'denied',
        );
    }

    public function recordLogout(User $user, ?string $tokenId = null, ?string $requestLocation = null): void
    {
        $changes = ['user_id' => (string) $user->id];
        if ($tokenId !== null) {
            $changes['token_id'] = (string) $tokenId;
        }

        $this->recordAction(
            organizationId: null,
            actor: $user,
            action: 'auth.logout',
            changes: $changes,
            requestLocation: $requestLocation ?? '/api/logout',
            targetType: 'user',
            targetId: (string) $user->id,
            classification: 'security',
            outcome: 'success',
        );
    }

    public function recordCredentialIssued(
        User|Customer $target,
        string $credentialType,
        ?int $organizationId = null,
        ?string $requestLocation = null
    ): void {
        $targetType = $target instanceof User ? 'user' : 'customer';

        $this->recordAction(
            organizationId: $organizationId,
            actor: $target,
            action: 'credential.issued',
            changes: ['credential_type' => $credentialType],
            requestLocation: $requestLocation ?? request()?->path() ?? '/api/credentials',
            targetType: $targetType,
            targetId: (string) $target->id,
            classification: 'security',
            outcome: 'success',
        );
    }

    public function recordAccessDenied(
        User|Customer|OrganizationMember|string|null $actor,
        string $action,
        string $targetType,
        ?string $targetId = null,
        ?string $reason = null,
        ?int $organizationId = null,
        ?string $requestLocation = null
    ): void {
        $changes = [];
        if ($reason !== null) {
            $changes['reason'] = $reason;
        }

        $this->recordAction(
            organizationId: $organizationId,
            actor: $actor,
            action: $action,
            changes: $changes,
            requestLocation: $requestLocation ?? request()?->path() ?? '/api',
            targetType: $targetType,
            targetId: $targetId,
            classification: 'security',
            outcome: 'denied',
        );
    }

    /**
     * Record an audit action across any target entity and verified organization.
     */
    public function recordAction(
        ?int $organizationId,
        User|Customer|OrganizationMember|string|null $actor,
        string $action,
        array $changes,
        string $requestLocation,
        string $targetType,
        ?string $targetId = null,
        string $classification = 'business',
        string $outcome = 'success',
    ): void {
        $contextOrgId = OrganizationContext::getCurrentId();
        if ($contextOrgId !== null && $organizationId !== null && $organizationId !== $contextOrgId) {
            throw new LogicException('Audit Organization must match the verified Organization context.');
        }

        $effectiveOrgId = $organizationId !== null ? ($contextOrgId ?? $organizationId) : null;

        [$actorType, $actorId] = $this->resolveActor($actor);

        $sanitizedChanges = AuditSanitizer::sanitizeMetadata($changes);
        $sanitizedLocation = AuditSanitizer::sanitizeRequestLocation($requestLocation);
        $ipAddress = request()?->ip();

        $insert = function () use (
            $classification,
            $action,
            $outcome,
            $effectiveOrgId,
            $actorType,
            $actorId,
            $targetType,
            $targetId,
            $sanitizedChanges,
            $ipAddress,
            $sanitizedLocation
        ) {
            DB::table('audit_logs')->insert([
                'id' => (string) Str::uuid(),
                'occurred_at' => now(),
                'classification' => $classification,
                'action' => $action,
                'outcome' => $outcome,
                'organization_id' => $effectiveOrgId,
                'actor_type' => $actorType,
                'actor_id' => $actorId,
                'target_type' => $targetType,
                'target_id' => $targetId,
                'changes' => json_encode($sanitizedChanges, JSON_THROW_ON_ERROR),
                'ip_address' => $ipAddress,
                'request_location' => $sanitizedLocation,
            ]);
        };

        if ($outcome === 'denied') {
            DB::transaction($insert);
        } else {
            $insert();
        }
    }

    /**
     * Resolve actor identity from user, customer, organization member, or unresolved.
     *
     * @return array{string, string|null} [actor_type, actor_id]
     */
    private function resolveActor(User|Customer|OrganizationMember|string|null $actor): array
    {
        if ($actor instanceof OrganizationMember) {
            return ['user', (string) $actor->user_id];
        }

        if ($actor instanceof Customer) {
            return ['customer', (string) $actor->id];
        }

        if ($actor instanceof User) {
            return ['user', (string) $actor->id];
        }

        if (is_string($actor) && in_array($actor, ['system', 'unresolved'], true)) {
            return [$actor, null];
        }

        $user = auth()->user();
        if ($user instanceof User) {
            return ['user', (string) $user->id];
        }

        return ['unresolved', null];
    }
}
