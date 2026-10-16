<?php

namespace App\Jobs;

use App\Services\OutboxPublisher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class PublishOutboxSignal implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 20;

    public function __construct(public string $signalId, public string $reservationToken)
    {
        $this->onQueue('outbox');
    }

    public function handle(OutboxPublisher $publisher): void
    {
        $publisher->publish($this->signalId, $this->reservationToken);
    }
}
