<?php

namespace App\Builders;

use App\Exceptions\ImmutableAssignmentException;
use Illuminate\Database\Eloquent\Builder;

class TicketAssignmentBuilder extends Builder
{
    /**
     * Reject bulk update operations on ticket assignments.
     *
     * @throws ImmutableAssignmentException
     */
    public function update(array $values): int
    {
        throw new ImmutableAssignmentException(
            'Ticket assignments are append-only and strictly immutable. Updates are rejected.'
        );
    }

    /**
     * Reject bulk delete operations on ticket assignments.
     *
     * @throws ImmutableAssignmentException
     */
    public function delete(): mixed
    {
        throw new ImmutableAssignmentException(
            'Ticket assignments are append-only and strictly immutable. Deletions are rejected.'
        );
    }
}
