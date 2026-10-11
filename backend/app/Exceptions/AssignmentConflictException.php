<?php

namespace App\Exceptions;

use RuntimeException;

class AssignmentConflictException extends RuntimeException
{
    public function __construct(public readonly array $current)
    {
        parent::__construct('Ticket assignment has changed since it was read.');
    }
}
