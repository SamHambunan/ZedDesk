<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Ticket;

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
}
