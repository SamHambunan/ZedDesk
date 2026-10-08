<?php

namespace App\Providers;

use App\Models\Customer;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Policies\TicketMessagePolicy;
use App\Policies\TicketPolicy;
use App\Services\CustomerTicketLiveChannel;
use App\Services\MemberNotificationChannel;
use App\Services\OrganizationLiveChannel;
use App\Services\TicketLiveChannel;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Ticket::class, TicketPolicy::class);
        Gate::policy(TicketMessage::class, TicketMessagePolicy::class);

        Broadcast::channel('organization.{organizationId}.{generation}',
            fn ($user, $organizationId, $generation) => app(OrganizationLiveChannel::class)
                ->mayJoin($user, $organizationId, $generation),
            ['guards' => ['sanctum']]
        );
        Broadcast::channel('ticket.{ticketId}.{generation}',
            fn ($user, $ticketId, $generation) => app(TicketLiveChannel::class)
                ->mayJoin($user, $ticketId, $generation),
            ['guards' => ['sanctum']]
        );
        Broadcast::channel('customer.ticket.{ticketId}.{generation}',
            fn ($customer, $ticketId, $generation) => $customer instanceof Customer
                && app(CustomerTicketLiveChannel::class)->mayJoin($customer, $ticketId, $generation)
        );
        Broadcast::channel('organization.{organizationId}.member.{memberId}.notifications.{generation}',
            fn ($user, $organizationId, $memberId, $generation) => app(MemberNotificationChannel::class)
                ->mayJoin($user, $organizationId, $memberId, $generation),
            ['guards' => ['sanctum']]
        );
    }
}
