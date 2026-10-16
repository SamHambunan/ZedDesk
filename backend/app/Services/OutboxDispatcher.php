<?php

namespace App\Services;

use App\Jobs\PublishOutboxSignal;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class OutboxDispatcher
{
    public function dispatch(int $limit = 100): int
    {
        $dispatched = 0;
        for ($i = 0; $i < $limit; $i++) {
            $signal = DB::transaction(function () {
                $signal = DB::table('delivery_outbox')
                    ->whereNull('delivered_at')->whereNull('quarantined_at')
                    ->where('available_at', '<=', now())
                    ->where(fn ($query) => $query->whereNull('reserved_until')->orWhere('reserved_until', '<=', now()))
                    ->orderBy('available_at')->orderBy('created_at')
                    ->lock('for update skip locked')->first();
                if (! $signal) {
                    return null;
                }

                $signal->reservation_token = (string) Str::uuid();
                DB::table('delivery_outbox')->where('id', $signal->id)->update([
                    'reservation_token' => $signal->reservation_token,
                    'reserved_until' => now()->addSeconds(45),
                    'updated_at' => now(),
                ]);

                return $signal;
            });
            if (! $signal) {
                break;
            }

            try {
                PublishOutboxSignal::dispatch($signal->id, $signal->reservation_token);
                $dispatched++;
            } catch (Throwable $error) {
                app(OutboxFailure::class)->record($signal, $error, true);
                break;
            }
        }

        return $dispatched;
    }
}
