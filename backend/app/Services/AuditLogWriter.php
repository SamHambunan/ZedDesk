<?php

namespace App\Services;

use App\Context\OrganizationContext;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\OrganizationMember;
use App\Models\Tag;
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
        $organizationId = OrganizationContext::getCurrentId();
        if ($organizationId === null || (int) $ticket->organization_id !== $organizationId) {
            throw new LogicException('Audit Organization must match the verified Ticket Organization.');
        }

        DB::table('audit_logs')->insert([
            'id' => (string) Str::uuid(),
            'occurred_at' => now(),
            'classification' => 'business',
            'action' => 'ticket.priority_changed',
            'outcome' => 'success',
            'organization_id' => $organizationId,
            'actor_type' => 'user',
            'actor_id' => (string) $actor->id,
            'target_type' => 'ticket',
            'target_id' => $ticket->id,
            'changes' => json_encode(['priority' => ['old' => $old->value, 'new' => $new->value]], JSON_THROW_ON_ERROR),
            'request_location' => '/api/tickets/{ticket}/priority',
        ]);
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
        $statusValue = $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.deleted',
            changes: ['status' => $statusValue],
            requestLocation: '/api/tickets/{ticket}',
        );
    }

    public function recordRestore(Ticket $ticket, User|OrganizationMember|null $actor): void
    {
        $statusValue = $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status;

        $this->record(
            ticket: $ticket,
            actor: $actor,
            action: 'ticket.restored',
            changes: ['status' => $statusValue],
            requestLocation: '/api/tickets/{ticket}/restore',
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
        $organizationId = OrganizationContext::getCurrentId() ?? (int) $ticket->organization_id;
        if ($organizationId === null || (int) $ticket->organization_id !== $organizationId) {
            throw new LogicException('Audit Organization must match the verified Ticket Organization.');
        }

        [$actorType, $actorId] = $this->resolveActor($actor);

        DB::table('audit_logs')->insert([
            'id' => (string) Str::uuid(),
            'occurred_at' => now(),
            'classification' => $classification,
            'action' => $action,
            'outcome' => $outcome,
            'organization_id' => $organizationId,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'target_type' => $targetType,
            'target_id' => $targetId ?? $ticket->id,
            'changes' => json_encode($changes, JSON_THROW_ON_ERROR),
            'request_location' => $requestLocation,
        ]);
    }

    /**
     * Resolve actor identity from user, customer, or organization member.
     *
     * @return array{string, string|null} [actor_type, actor_id]
     */
    private function resolveActor(User|Customer|OrganizationMember|null $actor): array
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

        $user = auth()->user();
        if ($user instanceof User) {
            return ['user', (string) $user->id];
        }

        return ['system', null];
    }
}
