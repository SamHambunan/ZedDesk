<?php

namespace App\Enums;

enum TicketPriority: string
{
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';
    case URGENT = 'urgent';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
