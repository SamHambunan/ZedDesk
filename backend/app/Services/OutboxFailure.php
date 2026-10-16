<?php

namespace App\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDOException;
use Throwable;

class OutboxFailure
{
    public function record(object $signal, Throwable $error, bool $infrastructure): void
    {
        $count = ($infrastructure ? $signal->infrastructure_failures : $signal->failures) + 1;
        DB::table('delivery_outbox')->where('id', $signal->id)
            ->where('reservation_token', $signal->reservation_token)->update([
                'reservation_token' => null,
                'reserved_until' => null,
                $infrastructure ? 'infrastructure_failures' : 'failures' => $count,
                'available_at' => now()->addSeconds(min(2 ** min($count, 5), 30)),
                'quarantined_at' => ! $infrastructure && $count >= 5 ? now() : null,
                'last_error' => class_basename($error),
                'updated_at' => now(),
            ]);
    }

    public function isInfrastructure(Throwable $error): bool
    {
        for ($cause = $error; $cause !== null; $cause = $cause->getPrevious()) {
            if ($cause instanceof QueryException || $cause instanceof PDOException) {
                $state = (string) $cause->getCode();

                return str_starts_with($state, '08')
                    || in_array($state, ['40001', '40P01', '53300', '53400', '55P03', '57P01', '57P02', '57P03'], true);
            }
        }

        return false;
    }
}
