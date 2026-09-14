<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class TicketNumberGenerator
{
    /**
     * Atomically generate the next sequential ticket number for the given organization.
     */
    public function generate(int|Organization|null $organization): int
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;

        if (empty($organizationId)) {
            throw new InvalidArgumentException('Organization ID is required to generate a ticket number.');
        }

        return DB::transaction(function () use ($organizationId) {
            $org = Organization::query()
                ->where('id', $organizationId)
                ->lockForUpdate()
                ->firstOrFail();

            $nextNumber = ((int) $org->ticket_counter) + 1;
            $org->ticket_counter = $nextNumber;
            $org->save();

            return $nextNumber;
        });
    }
}
