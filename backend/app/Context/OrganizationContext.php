<?php

namespace App\Context;

use App\Models\Organization;

class OrganizationContext
{
    private static ?Organization $current = null;

    public static function setCurrent(?Organization $organization): void
    {
        self::$current = $organization;
    }

    public static function getCurrent(): ?Organization
    {
        return self::$current;
    }

    public static function getCurrentId(): ?int
    {
        return self::$current?->id;
    }

    public static function hasCurrent(): bool
    {
        return self::$current !== null;
    }

    public static function clear(): void
    {
        self::$current = null;
    }
}
