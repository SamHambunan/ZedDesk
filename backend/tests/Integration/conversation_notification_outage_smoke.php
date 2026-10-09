<?php

// Run with Reverb stopped: docker compose stop reverb; docker compose exec -T backend php tests/Integration/conversation_notification_outage_smoke.php

use App\Models\OrganizationMember;
use App\Models\Ticket;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/live_socket_helpers.php';
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$connection = @fsockopen('reverb', 8080, $errorCode, $errorMessage, 1);
required($connection === false, 'Reverb must be stopped for the outage smoke test.');

$suffix = bin2hex(random_bytes(5));
[$status, $registered] = api('POST', 'localhost', '/api/register', [
    'name' => 'Handler',
    'email' => "conversation-handler-{$suffix}@example.test",
    'password' => 'smoke-password',
    'password_confirmation' => 'smoke-password',
]);
required($status === 201, "Registration failed: {$status}");
$memberToken = $registered['token'];

[$status, $createdOrganization] = api('POST', 'localhost', '/api/organizations', [
    'name' => 'Conversation Notification Smoke',
    'slug' => "conversation-{$suffix}",
], $memberToken);
required($status === 201, "Organization creation failed: {$status}");
$organizationId = $createdOrganization['organization']['id'];
$host = "conversation-{$suffix}.localhost";
$memberId = OrganizationMember::withoutGlobalScopes()
    ->where('organization_id', $organizationId)->firstOrFail()->id;

[$status, $createdTicket] = api('POST', $host, '/api/portal/tickets', [
    'name' => 'Customer',
    'email' => "conversation-customer-{$suffix}@example.test",
    'subject' => 'Outage follow up',
    'message' => 'Please help',
]);
required($status === 201, "Ticket creation failed: {$status}");
$ticketId = $createdTicket['ticket']['id'];
$customerToken = $createdTicket['token'];
Ticket::withoutGlobalScopes()->findOrFail($ticketId)->update(['assigned_member_id' => $memberId]);

[$status, $marked] = api('POST', $host, '/api/notifications/mark-all-read', token: $memberToken);
required($status === 200 && $marked['marked_read'] === 1, 'Initial Ticket Notification was not marked read.');

[$status, $reply] = apiRequest('POST', $host, "/api/portal/tickets/{$ticketId}/reply",
    json_encode(['message' => 'Reply during outage'], JSON_THROW_ON_ERROR),
    "Content-Type: application/json\r\nX-Customer-Token: {$customerToken}\r\n");
required($status === 201, "Customer Public Reply failed during Reverb outage: {$status}");

[$status, $inbox] = api('GET', $host, '/api/notifications', token: $memberToken);
required($status === 200 && count($inbox['data']) === 2
    && $inbox['data'][0]['activity_type'] === 'customer_public_reply'
    && $inbox['data'][0]['read_at'] === null
    && $inbox['data'][0]['ticket_id'] === $ticketId,
    'Customer Public Reply Notification was not stored during Reverb outage.');
[$status, $ticket] = api('GET', $host, "/api/tickets/{$ticketId}", token: $memberToken);
required($status === 200 && str_contains(json_encode($ticket, JSON_THROW_ON_ERROR), 'Reply during outage'),
    'Customer Public Reply was not stored during Reverb outage.');

echo "Conversation Notification outage smoke passed.\n";
