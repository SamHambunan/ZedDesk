<?php

use App\Events\CustomerTicketChanged;
use App\Models\Ticket;
use Illuminate\Contracts\Console\Kernel;
use Tests\Integration\RetryCustomerStatusChange;

// Run with the Compose stack: docker compose exec -T backend php tests/Integration/live_customer_ticket_access_smoke.php
require __DIR__.'/live_socket_helpers.php';

function portal(string $method, string $host, string $path, string $token, ?array $body = null): array
{
    $headers = "X-Customer-Token: {$token}\r\n";
    if ($body !== null) {
        $headers .= "Content-Type: application/json\r\n";
    }

    return apiRequest($method, $host, $path, $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR), $headers);
}

function receiveCustomerSignal($socket, string $channel, string $type, string $ticketId, int $minimumRevision = 0): array
{
    while (($signal = frame($socket)) !== null) {
        if (! in_array($signal['event'] ?? null, ['ticket.changed', 'ticket.unavailable'], true)) {
            continue;
        }

        required(($signal['channel'] ?? null) === $channel, 'Customer received an event on an old or foreign channel.');
        required($signal['event'] === $type, 'Customer received the wrong event type.');
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        if ($type === 'ticket.unavailable') {
            required($payload === [], 'Deletion signal exposed Ticket details.');
        } else {
            required(($payload['ticket_id'] ?? null) === $ticketId, 'Customer received another Ticket signal.');
            required(array_keys($payload) === ['event_id', 'organization_id', 'ticket_id', 'change_type', 'revision'], 'Customer signal exposed content.');
            if ($payload['revision'] <= $minimumRevision) {
                continue;
            }
        }

        return $payload;
    }

    throw new RuntimeException('Timed out waiting for Customer signal.');
}

function noCustomerSignal($socket): void
{
    stream_set_timeout($socket, 2);
    while (($signal = frame($socket)) !== null) {
        required(! in_array($signal['event'] ?? null, ['ticket.changed', 'ticket.unavailable'], true), 'Customer received a private Ticket signal.');
    }
    stream_set_timeout($socket, 10);
}

$suffix = bin2hex(random_bytes(5));
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "customer-live-agent-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Agent registration failed for {$name}.");
    $agents[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Customer Live Smoke',
        'slug' => "customer-live-{$name}-{$suffix}",
    ], $agents[$name]);
    required($status === 201, "Organization creation failed for {$name}.");
    $hosts[$name] = "customer-live-{$name}-{$suffix}.localhost";
    [$status, $created] = api('POST', $hosts[$name], '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "customer-live-{$name}-{$suffix}@example.test",
        'subject' => 'Live Customer Ticket',
        'message' => 'Initial request',
    ]);
    required($status === 201, "Ticket intake failed for {$name}.");
    $tickets[$name] = $created['ticket'];
    $tokens[$name] = $created['token'];
    [$sockets[$name], $socketIds[$name]] = connect($hosts[$name]);
    [$status, $discovery] = portal('GET', $hosts[$name], '/api/portal/tickets/'.$tickets[$name]['id'].'/live-channel', $tokens[$name]);
    required($status === 200, "Customer channel discovery failed for {$name}.");
    $channels[$name] = $discovery['channel'];
}

$ticketId = $tickets['acme']['id'];
$portalPath = '/api/portal/tickets/'.$ticketId;
$authPath = $portalPath.'/broadcasting/auth';
[$status, $other] = api('POST', $hosts['acme'], '/api/portal/tickets', [
    'name' => 'Another Customer',
    'email' => "another-customer-{$suffix}@example.test",
    'subject' => 'Different Ticket',
    'message' => 'Other request',
]);
required($status === 201, 'Second Customer intake failed.');
foreach ([$tokens['beta'], $other['token'], $tokens['acme'].'tampered'] as $badToken) {
    [$status] = portal('POST', $hosts['acme'], $authPath, $badToken, [
        'socket_id' => $socketIds['acme'], 'channel_name' => $channels['acme'],
    ]);
    required($status !== 200, 'Invalid Customer subscription was authorized.');
}
[$status] = portal('POST', $hosts['beta'], $authPath, $tokens['acme'], [
    'socket_id' => $socketIds['beta'], 'channel_name' => $channels['acme'],
]);
required($status !== 200, 'Cross-Organization Customer subscription was authorized.');
foreach (['acme', 'beta'] as $name) {
    [$status, $authorized] = portal('POST', $hosts[$name], '/api/portal/tickets/'.$tickets[$name]['id'].'/broadcasting/auth', $tokens[$name], [
        'socket_id' => $socketIds[$name], 'channel_name' => $channels[$name],
    ]);
    required($status === 200, "Customer channel authorization failed for {$name}.");
    subscribe($sockets[$name], $channels[$name], $authorized['auth']);
}

$staffPath = '/api/tickets/'.$ticketId;
[$status] = api('POST', $hosts['acme'], $staffPath.'/messages', [
    'message_type' => 'public_reply', 'body' => 'Public response',
], $agents['acme']);
required($status === 201, 'Staff Public Reply failed.');
$statusRevisions = [];
$messageRevision = null;
for ($i = 0; $i < 5 && $messageRevision === null; $i++) {
    $change = receiveCustomerSignal($sockets['acme'], $channels['acme'], 'ticket.changed', $ticketId);
    if ($change['change_type'] === 'status_changed') {
        $statusRevisions[] = $change['revision'];
    } elseif ($change['change_type'] === 'message_created') {
        $messageRevision = $change['revision'];
    }
}
required($messageRevision !== null && max($statusRevisions ?: [0]) >= $messageRevision - 1, 'Public Reply and Status did not both signal.');
[$status, $current] = portal('GET', $hosts['acme'], $portalPath, $tokens['acme']);
required($status === 200 && $current['ticket']['status'] === 'pending' && count($current['messages']) === 2, 'Customer REST refresh missed the Public Reply.');

[$status] = api('POST', $hosts['acme'], $staffPath.'/messages', [
    'message_type' => 'internal_note', 'body' => 'Private staff note',
], $agents['acme']);
required($status === 201, 'Staff Internal Note failed.');
noCustomerSignal($sockets['acme']);
noCustomerSignal($sockets['beta']);

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
dispatch(new RetryCustomerStatusChange($ticketId));
$retried = receiveCustomerSignal($sockets['acme'], $channels['acme'], 'ticket.changed', $ticketId);
required($retried['change_type'] === 'status_changed', 'Retried worker did not deliver Ticket Status.');
[$status, $current] = portal('GET', $hosts['acme'], $portalPath, $tokens['acme']);
required($status === 200 && $current['ticket']['status'] === 'resolved', 'Retried worker did not persist Ticket Status.');
noCustomerSignal($sockets['beta']);

$secondsToRenewal = 300 - (time() % 300) + 1;
echo "Waiting {$secondsToRenewal}s for the live channel generation to rotate.\n";
sleep($secondsToRenewal);
[$status] = portal('POST', $hosts['acme'], $authPath, $tokens['acme'], [
    'socket_id' => $socketIds['acme'], 'channel_name' => $channels['acme'],
]);
required($status === 403, 'Expired channel generation still authorizes.');
$oldSocket = $sockets['acme'];
[$sockets['acme'], $socketIds['acme']] = connect($hosts['acme']);
[$status, $discovery] = portal('GET', $hosts['acme'], $portalPath.'/live-channel', $tokens['acme']);
required($status === 200 && $discovery['channel'] !== $channels['acme'], 'Fresh generation was not discovered.');
$channels['acme'] = $discovery['channel'];
[$status, $authorized] = portal('POST', $hosts['acme'], $authPath, $tokens['acme'], [
    'socket_id' => $socketIds['acme'], 'channel_name' => $channels['acme'],
]);
required($status === 200, 'Fresh Customer generation was not authorized.');
subscribe($sockets['acme'], $channels['acme'], $authorized['auth']);
[$status] = portal('POST', $hosts['acme'], $portalPath.'/reply', $tokens['acme'], ['message' => 'Renewed Customer reply']);
required($status === 201, 'Customer reply after renewal failed.');
receiveCustomerSignal($sockets['acme'], $channels['acme'], 'ticket.changed', $ticketId);
receiveCustomerSignal($sockets['acme'], $channels['acme'], 'ticket.changed', $ticketId);
noCustomerSignal($oldSocket);

[$status] = api('DELETE', $hosts['acme'], $staffPath, token: $agents['acme']);
required($status === 200, 'Ticket soft deletion failed.');
receiveCustomerSignal($sockets['acme'], $channels['acme'], 'ticket.unavailable', $ticketId);
[$status] = portal('GET', $hosts['acme'], $portalPath, $tokens['acme']);
required($status === 404, 'Deleted Ticket remained accessible through REST.');
[$status] = portal('POST', $hosts['acme'], $authPath, $tokens['acme'], [
    'socket_id' => $socketIds['acme'], 'channel_name' => $channels['acme'],
]);
required($status !== 200, 'Deleted Ticket still accepted subscriptions.');
$deleted = Ticket::withoutGlobalScopes()->withTrashed()->findOrFail($ticketId);
CustomerTicketChanged::dispatch($deleted, CustomerTicketChanged::MESSAGE_CREATED);
noCustomerSignal($sockets['acme']);
noCustomerSignal($sockets['beta']);

fclose($sockets['acme']);
fclose($sockets['beta']);
fclose($oldSocket);
echo "Live Customer Ticket access smoke passed.\n";
