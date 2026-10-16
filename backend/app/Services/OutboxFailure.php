<?php

namespace App\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDOException;
use Throwable;

class OutboxFailure
{
    public function record(object $signal, Throwable $error, bool $infrastructure): void
    {
        $count = ($infrastructure ? $signal->infrastructure_failures : $signal->failures) + 1;
        $query = DB::table('delivery_outbox')->where('id', $signal->id);
        if (isset($signal->reservation_token) && $signal->reservation_token !== null) {
            $query->where('reservation_token', $signal->reservation_token);
        }

        $query->update([
            'reservation_token' => null,
            'reserved_until' => null,
            $infrastructure ? 'infrastructure_failures' : 'failures' => $count,
            'available_at' => now()->addSeconds(min(2 ** min($count, 6), 60)),
            'quarantined_at' => ! $infrastructure && $count >= 5 ? now() : null,
            'last_error' => $this->sanitizeError($error),
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

            $class = get_class($cause);
            if ($cause instanceof \RedisException
                || str_contains($class, 'Redis')
                || str_contains($class, 'ConnectionException')
                || str_contains($class, 'ConnectException')
                || str_contains($class, 'TransportException')) {
                return true;
            }
        }

        return false;
    }

    public function sanitizeError(Throwable|string $error): string
    {
        if (is_string($error)) {
            return mb_substr(Str::limit($this->sanitizeMessage($error), 252, '...'), 0, 255);
        }

        $class = class_basename($error);
        $message = trim($error->getMessage());
        if ($message === '' || $message === $class) {
            return mb_substr($class, 0, 255);
        }

        return mb_substr(Str::limit($class.': '.$this->sanitizeMessage($message), 252, '...'), 0, 255);
    }

    public function sanitizeMessage(string $message): string
    {
        $sanitized = preg_replace('/(password|secret|token|bearer|key)[=:\s]+[^\s,;&]+/i', '$1=[REDACTED]', $message);
        $sanitized = preg_replace('/[a-f0-9]{32,}/i', '[REDACTED]', $sanitized);

        return preg_replace('/\s+/', ' ', $sanitized);
    }
}
