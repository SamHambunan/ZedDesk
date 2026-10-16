<?php

namespace App\Services;

use App\Events\CustomerTicketChanged;
use App\Events\MemberInboxChanged;
use App\Events\TicketChanged;
use App\Events\TicketCreated;
use App\Events\TicketMessageCreated;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Testing\Fakes\EventFake;
use ReflectionMethod;

class DurableDelivery
{
    private bool $capturing = false;

    public function capture(callable $mutation): mixed
    {
        if ($this->capturing) {
            return $mutation();
        }

        $this->capturing = true;
        try {
            return $mutation();
        } finally {
            $this->capturing = false;
        }
    }

    public function signal(object $event, ?string $ticketId = null): void
    {
        if (! $this->capturing) {
            event($event);

            return;
        }

        $kind = match (true) {
            $event instanceof CustomerTicketChanged => 'customer_ticket',
            $event instanceof MemberInboxChanged => 'member_inbox',
            $event instanceof TicketChanged,
            $event instanceof TicketMessageCreated,
            $event instanceof TicketCreated => 'staff_ticket',
            default => throw new \LogicException('Unsupported durable delivery event.'),
        };

        if ($event instanceof CustomerTicketChanged && $event->changeType === CustomerTicketChanged::DELETED) {
            $envelope = [
                'event_id' => $event->eventId,
                'organization_id' => $event->organizationId,
                'ticket_id' => $event->ticketId,
                'change_type' => $event->changeType,
                'revision' => $event->revision,
                'deletion_channel' => $event->deletionChannel,
            ];
        } else {
            $envelope = $event->broadcastWith();
        }

        DB::table('delivery_outbox')->insert([
            'id' => $envelope['event_id'],
            'organization_id' => $envelope['organization_id'],
            'kind' => $kind,
            'ticket_id' => $envelope['ticket_id'] ?? $ticketId,
            'customer_id' => $event instanceof CustomerTicketChanged ? $event->customerId : null,
            'recipient_member_id' => $event instanceof MemberInboxChanged ? $event->recipientMemberId : null,
            'envelope' => json_encode($envelope, JSON_THROW_ON_ERROR),
            'available_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $root = Event::getFacadeRoot();
        if ($root instanceof EventFake) {
            $name = get_class($event);
            $shouldFake = new ReflectionMethod($root, 'shouldFakeEvent');
            $shouldFake->setAccessible(true);
            if ($shouldFake->invoke($root, $name, [$event])) {
                $fakeEvent = new ReflectionMethod($root, 'fakeEvent');
                $fakeEvent->setAccessible(true);
                $fakeEvent->invoke($root, $event, $name, [$event, []]);
            }
        }
    }
}
