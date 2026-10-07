<?php

use App\Events\TicketMessageCreated;
use App\Models\Customer;
use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Run against Docker Compose: docker compose exec -T backend php tests/Integration/live_ticket_conversation_smoke.php
require __DIR__.'/live_socket_helpers.php';

function multipartReply(string $host, string $path, string $token, string $messageType, string $body): array
{
    $boundary = 'zeddesk-'.bin2hex(random_bytes(8));
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=');
    $content = "--{$boundary}\r\nContent-Disposition: form-data; name=\"message_type\"\r\n\r\n{$messageType}\r\n"
        ."--{$boundary}\r\nContent-Disposition: form-data; name=\"body\"\r\n\r\n{$body}\r\n"
        ."--{$boundary}\r\nContent-Disposition: form-data; name=\"attachments[]\"; filename=\"private.png\"\r\n"
        ."Content-Type: image/png\r\n\r\n{$png}\r\n--{$boundary}--\r\n";
    $headers = "Host: {$host}\r\nAccept: application/json\r\nAuthorization: Bearer {$token}\r\n"
        ."Content-Type: multipart/form-data; boundary={$boundary}\r\n";
    $context = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => $headers,
        'content' => $content,
        'ignore_errors' => true,
        'timeout' => 10,
    ]]);
    $response = file_get_contents('http://nginx'.$path, false, $context);
    $status = (int) (explode(' ', $http_response_header[0])[1] ?? 0);

    return [$status, json_decode($response ?: '{}', true, flags: JSON_THROW_ON_ERROR)];
}

function expectConversationSignal($socket, string $ticketId, int $previousRevision): int
{
    $signal = frame($socket);
    required(($signal['event'] ?? null) === 'ticket.changed', 'Missing Ticket conversation signal.');
    $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
    required(($signal['channel'] ?? null) !== null, 'Signal has no channel.');
    required(($payload['ticket_id'] ?? null) === $ticketId, 'Signal references the wrong Ticket.');
    required(($payload['change_type'] ?? null) === 'message_created', 'Signal has the wrong change type.');
    required(($payload['revision'] ?? 0) > $previousRevision, 'Signal revision did not advance.');
    required(
        array_keys($payload) === ['event_id', 'organization_id', 'ticket_id', 'change_type', 'revision'],
        'Signal exposed conversation or attachment data.'
    );

    return $payload['revision'];
}

function expectNoNewConversationSignal($socket, int $currentRevision): void
{
    stream_set_timeout($socket, 2);
    while (($signal = frame($socket)) !== null) {
        if (($signal['event'] ?? null) !== 'ticket.changed') {
            continue;
        }
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        required(($payload['revision'] ?? 0) <= $currentRevision, 'A rolled-back or rejected message emitted a new signal.');
    }
}

$suffix = bin2hex(random_bytes(5));
$agents = [];
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "conversation-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}: {$status}");
    $agents[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Conversation Smoke',
        'slug' => "conversation-{$name}-{$suffix}",
    ], $agents[$name]);
    required($status === 201, "Organization creation failed for {$name}: {$status}");
}

$hosts = [
    'acme' => "conversation-acme-{$suffix}.localhost",
    'beta' => "conversation-beta-{$suffix}.localhost",
];
foreach (['acme', 'beta'] as $name) {
    [$status, $created] = api('POST', $hosts[$name], '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "conversation-customer-{$name}-{$suffix}@example.test",
        'subject' => 'Conversation delivery',
        'message' => 'Initial request',
    ]);
    required($status === 201, "Ticket creation failed for {$name}: {$status}");
    $tickets[$name] = $created;
}

foreach (['acme', 'beta'] as $name) {
    [$sockets[$name], $socketIds[$name]] = connect($hosts[$name]);
    [$status, $discovery] = api('GET', $hosts[$name], '/api/tickets/'.$tickets[$name]['ticket']['id'].'/live-channel', token: $agents[$name]);
    required($status === 200, "Ticket channel discovery failed for {$name}: {$status}");
    $channels[$name] = $discovery['channel'];
}

[$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
    'socket_id' => $socketIds['beta'],
    'channel_name' => $channels['acme'],
], $agents['beta']);
required($status === 403, "Cross-Organization Ticket channel authorization returned {$status}.");
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $socketIds['acme'],
    'channel_name' => $channels['acme'],
]);
required($status === 401, "Customer access to staff Ticket channel returned {$status}.");

foreach (['acme', 'beta'] as $name) {
    [$status, $authorized] = api('POST', $hosts[$name], '/api/broadcasting/auth', [
        'socket_id' => $socketIds[$name],
        'channel_name' => $channels[$name],
    ], $agents[$name]);
    required($status === 200, "Ticket channel authorization failed for {$name}: {$status}");
    subscribe($sockets[$name], $channels[$name], $authorized['auth']);
}

$ticketId = $tickets['acme']['ticket']['id'];
$path = '/api/tickets/'.$ticketId;
$revision = $tickets['acme']['ticket']['revision'];
[$status, $reply] = api('POST', $hosts['acme'], $path.'/messages', [
    'message_type' => 'public_reply',
    'body' => 'Public response',
], $agents['acme']);
required($status === 201, "Staff Public Reply failed: {$status}");
$revision = expectConversationSignal($sockets['acme'], $ticketId, $revision);

[$status, $note] = multipartReply($hosts['acme'], $path.'/messages', $agents['acme'], 'internal_note', 'Private draft');
required($status === 201 && count($note['data']['attachments'] ?? []) === 1, "Internal Note attachment failed: {$status}");
$revision = expectConversationSignal($sockets['acme'], $ticketId, $revision);

[$status, $customerReply] = api('POST', $hosts['acme'], '/api/portal/tickets/'.$ticketId.'/reply?token='.urlencode($tickets['acme']['token']), [
    'message' => 'Customer follow-up',
]);
required($status === 201, "Customer Public Reply failed: {$status}");
$revision = expectConversationSignal($sockets['acme'], $ticketId, $revision);

stream_set_timeout($sockets['beta'], 2);
required(frame($sockets['beta']) === null, 'Another Organization received a Ticket conversation signal.');
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision, 'REST recovery returned a stale revision.');
required(count($current['messages']) === 4, 'REST recovery omitted conversation messages.');

// Simulate a missed event while disconnected, then recover from current REST state.
fclose($sockets['acme']);
[$status] = api('POST', $hosts['acme'], '/api/portal/tickets/'.$ticketId.'/reply?token='.urlencode($tickets['acme']['token']), [
    'message' => 'Missed while disconnected',
]);
required($status === 201, "Disconnected Customer reply failed: {$status}");
[$sockets['acme'], $socketIds['acme']] = connect($hosts['acme']);
[$status, $authorized] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $socketIds['acme'],
    'channel_name' => $channels['acme'],
], $agents['acme']);
required($status === 200, 'Reconnect authorization failed.');
subscribe($sockets['acme'], $channels['acme'], $authorized['auth']);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] > $revision, 'Reconnect REST read missed the new revision.');
required(count($current['messages']) === 5, 'Reconnect REST read missed the new message.');
$revision = $current['ticket']['revision'];

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$ticket = Ticket::withoutGlobalScopes()->findOrFail($ticketId);
$customer = Customer::withoutGlobalScopes()->findOrFail($ticket->customer_id);
try {
    DB::transaction(function () use ($ticket, $customer) {
        $message = TicketMessage::create([
            'organization_id' => $ticket->organization_id,
            'ticket_id' => $ticket->id,
            'message_type' => 'public_reply',
            'author_type' => Customer::class,
            'author_id' => $customer->id,
            'body' => 'Rolled-back draft',
        ]);
        TicketMessageCreated::dispatch($message, $ticket->recordConversationChange());
        throw new RuntimeException('Simulated rollback');
    });
} catch (RuntimeException $error) {
    required($error->getMessage() === 'Simulated rollback', 'Unexpected transaction error.');
}
expectNoNewConversationSignal($sockets['acme'], $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision, 'Rollback changed the durable revision.');

[$status] = api('PATCH', $hosts['acme'], $path.'/status', ['status' => 'resolved'], $agents['acme']);
required($status === 200, "Resolving Ticket failed: {$status}");
[$status] = api('PATCH', $hosts['acme'], $path.'/status', ['status' => 'closed'], $agents['acme']);
required($status === 200, "Closing Ticket failed: {$status}");
[$status] = api('POST', $hosts['acme'], $path.'/messages', [
    'message_type' => 'internal_note',
    'body' => 'Rejected after close',
], $agents['acme']);
required($status === 422, "Closed Ticket accepted a message: {$status}");
expectNoNewConversationSignal($sockets['acme'], $revision);

fclose($sockets['acme']);
fclose($sockets['beta']);
echo "Live Ticket conversation smoke passed.\n";
