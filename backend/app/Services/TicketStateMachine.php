<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Events\TicketStatusChanged;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Ticket;
use App\Models\TicketMessage;

class TicketStateMachine
{
    /**
     * Map of valid canonical status transitions.
     */
    private const array ALLOWED_TRANSITIONS = [
        TicketStatus::NEW->value => [
            TicketStatus::OPEN->value,
        ],
        TicketStatus::OPEN->value => [
            TicketStatus::PENDING->value,
            TicketStatus::RESOLVED->value,
        ],
        TicketStatus::PENDING->value => [
            TicketStatus::OPEN->value,
            TicketStatus::RESOLVED->value,
        ],
        TicketStatus::RESOLVED->value => [
            TicketStatus::OPEN->value,
            TicketStatus::CLOSED->value,
        ],
        TicketStatus::CLOSED->value => [],
    ];

    /**
     * Determine whether a ticket can transition to the given target status.
     */
    public function canTransitionTo(Ticket $ticket, TicketStatus|string $targetStatus): bool
    {
        $targetValue = $targetStatus instanceof TicketStatus ? $targetStatus->value : $targetStatus;
        $currentValue = $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status;

        if ($currentValue === TicketStatus::CLOSED->value) {
            return false;
        }

        $allowed = self::ALLOWED_TRANSITIONS[$currentValue] ?? [];

        return in_array($targetValue, $allowed, true);
    }

    /**
     * Transition a ticket to the target status, updating lifecycle timestamps.
     *
     * @throws InvalidTicketTransitionException
     */
    public function transitionTo(Ticket $ticket, TicketStatus|string $targetStatus): Ticket
    {
        $targetValue = $targetStatus instanceof TicketStatus ? $targetStatus->value : $targetStatus;
        $currentValue = $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status;

        if ($currentValue === TicketStatus::CLOSED->value) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$ticket->ticket_number} is closed and immutable. Status cannot be changed."
            );
        }

        if (! $this->canTransitionTo($ticket, $targetValue)) {
            throw new InvalidTicketTransitionException(
                "Invalid ticket transition from '{$currentValue}' to '{$targetValue}'."
            );
        }

        // Apply lifecycle timestamp rules
        if ($targetValue === TicketStatus::OPEN->value) {
            if ($ticket->first_replied_at === null) {
                $ticket->first_replied_at = now();
            }

            // If reopening from resolved, clear resolved_at
            if ($currentValue === TicketStatus::RESOLVED->value) {
                $ticket->resolved_at = null;
            }
        } elseif ($targetValue === TicketStatus::RESOLVED->value) {
            $ticket->resolved_at = now();
        } elseif ($targetValue === TicketStatus::CLOSED->value) {
            $ticket->closed_at = now();
        }

        $ticket->status = TicketStatus::from($targetValue);
        $ticket->save();

        TicketStatusChanged::dispatch(
            $ticket,
            TicketStatus::from($currentValue),
            TicketStatus::from($targetValue)
        );

        return $ticket;
    }

    /**
     * Determine whether a ticket can accept conversation replies.
     */
    public function canReply(Ticket $ticket): bool
    {
        return $ticket->canReply();
    }

    /**
     * Assert that a ticket can accept conversation replies.
     *
     * @throws InvalidTicketTransitionException
     */
    public function assertCanReply(Ticket $ticket): void
    {
        if (! $this->canReply($ticket)) {
            throw new InvalidTicketTransitionException(
                "Ticket #{$ticket->ticket_number} is closed. New conversation replies are rejected."
            );
        }
    }

    /**
     * Handle lifecycle transitions and triggers upon message creation.
     *
     * @throws InvalidTicketTransitionException
     */
    public function handleMessageCreated(TicketMessage $message, TicketStatus|string|null $overrideStatus = null): Ticket
    {
        $ticket = $message->relationLoaded('ticket')
            ? $message->ticket
            : Ticket::withoutGlobalScopes()->findOrFail($message->ticket_id);

        $this->assertCanReply($ticket);

        // Internal notes never alter ticket status
        if ($message->isInternalNote()) {
            return $ticket;
        }

        // Public replies by customer
        if ($message->isCustomerAuthor()) {
            $currentStatus = $ticket->status instanceof TicketStatus
                ? $ticket->status
                : TicketStatus::from((string) $ticket->status);

            // Customer reply to pending or resolved tickets reopens status to open
            if (in_array($currentStatus, [TicketStatus::PENDING, TicketStatus::RESOLVED], true)) {
                return $this->transitionTo($ticket, TicketStatus::OPEN);
            }

            return $ticket;
        }

        // Public replies by staff/agent
        // Record first agent reply timestamp if not already recorded
        if ($ticket->first_replied_at === null) {
            $ticket->first_replied_at = now();
            $ticket->save();
        }

        // Agent public reply defaults status to pending, with payload override option
        $target = $overrideStatus ?? TicketStatus::PENDING;
        $targetStatus = $target instanceof TicketStatus ? $target : TicketStatus::from((string) $target);

        $currentStatus = $ticket->status instanceof TicketStatus
            ? $ticket->status
            : TicketStatus::from((string) $ticket->status);

        if ($currentStatus === $targetStatus) {
            return $ticket;
        }

        // When ticket is NEW, it must transition to OPEN first before target status
        if ($currentStatus === TicketStatus::NEW) {
            $this->transitionTo($ticket, TicketStatus::OPEN);
            if ($targetStatus !== TicketStatus::OPEN) {
                $this->transitionTo($ticket, $targetStatus);
            }

            return $ticket->refresh();
        }

        // When ticket is RESOLVED, it must reopen to OPEN first before transitioning to target status
        if ($currentStatus === TicketStatus::RESOLVED) {
            $this->transitionTo($ticket, TicketStatus::OPEN);
            if ($targetStatus !== TicketStatus::OPEN) {
                $this->transitionTo($ticket, $targetStatus);
            }

            return $ticket->refresh();
        }

        return $this->transitionTo($ticket, $targetStatus);
    }
}
