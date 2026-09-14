<?php

namespace App\Builders;

use App\Exceptions\ImmutableMessageException;
use Illuminate\Database\Eloquent\Builder;

class TicketMessageBuilder extends Builder
{
    /**
     * Reject bulk update operations on ticket messages.
     *
     * @throws ImmutableMessageException
     */
    public function update(array $values): int
    {
        throw new ImmutableMessageException(
            'Ticket messages are append-only and strictly immutable. Updates are rejected.'
        );
    }

    /**
     * Reject bulk delete operations on ticket messages.
     *
     * @throws ImmutableMessageException
     */
    public function delete(): mixed
    {
        throw new ImmutableMessageException(
            'Ticket messages are append-only and strictly immutable. Deletions are rejected.'
        );
    }
}
