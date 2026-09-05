<?php

namespace App\Enums;

enum Role: string
{
    case ADMIN = 'admin';
    case AGENT = 'agent';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
