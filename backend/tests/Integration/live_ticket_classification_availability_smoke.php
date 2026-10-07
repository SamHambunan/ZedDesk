<?php

use App\Models\Ticket;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Run against Docker Compose: docker compose exec -T backend php tests/Integration/live_ticket_classification_availability_smoke.php
require __DIR__.'/live_socket_helpers.php';

function receiveMetadataChange($socket, array $channels, string $ticketId, string $changeType, int $previousRevision): int
{
    $received = [];
    while (count($received) < count($channels)) {
        $signal = frame($socket);
        required(($signal['event'] ?? null) === 'ticket.changed', 'Missing Ticket change signal.');
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        $channel = $signal['channel'] ?? '';
        required(in_array($channel, $channels, true) && ! isset($received[$channel]), 'Unexpected or duplicate signal channel.');
        required($payload['ticket_id'] === $ticketId && $payload['change_type'] === $changeType, 'Wrong Ticket change signal.');
        required($payload['revision'] === $previousRevision + 1, 'Ticket revision did not advance once.');
        required(
            array_keys($payload) === ['event_id', 'organization_id', 'ticket_id', 'change_type', 'revision'],
            'Signal exposed Ticket content.'
        );
        $received[$channel] = true;
    }

    return $previousRevision + 1;
}

function noMetadataChange($socket, string $ticketId, int $revision): void
{
    stream_set_timeout($socket, 2);
    while (($signal = frame($socket)) !== null) {
        if (($signal['event'] ?? null) !== 'ticket.changed') {
            continue;
        }
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        required(
            ($payload['ticket_id'] ?? null) !== $ticketId || ($payload['revision'] ?? 0) <= $revision,
            'Rejected, rolled-back, or cross-Organization change reached this socket.'
        );
    }
}

$suffix = bin2hex(random_bytes(5));
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Admin',
        'email' => "classification-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}.");
    $agents[$name] = $registered['token'];
    [$status, $created] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Classification Smoke',
        'slug' => "classification-{$name}-{$suffix}",
    ], $agents[$name]);
    required($status === 201, "Organization creation failed for {$name}.");
    $hosts[$name] = "classification-{$name}-{$suffix}.localhost";
    [$status, $created] = api('POST', $hosts[$name], '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "classification-customer-{$name}-{$suffix}@example.test",
        'subject' => 'Classification delivery',
        'message' => 'Initial request',
    ]);
    required($status === 201, "Ticket creation failed for {$name}.");
    $tickets[$name] = $created['ticket'];
    $customerTokens[$name] = $created['token'];
}

$ticketId = $tickets['acme']['id'];
$path = '/api/tickets/'.$ticketId;
foreach (['acme', 'beta'] as $name) {
    [$sockets[$name], $socketIds[$name]] = connect($hosts[$name]);
    [$status, $organizationChannel] = api('GET', $hosts[$name], '/api/live/organization-channel', token: $agents[$name]);
    required($status === 200, "Organization channel discovery failed for {$name}.");
    [$status, $ticketChannel] = api('GET', $hosts[$name], '/api/tickets/'.$tickets[$name]['id'].'/live-channel', token: $agents[$name]);
    required($status === 200, "Ticket channel discovery failed for {$name}.");
    $channels[$name] = [$organizationChannel['channel'], $ticketChannel['channel']];
    foreach ($channels[$name] as $channel) {
        [$status, $authorized] = api('POST', $hosts[$name], '/api/broadcasting/auth', [
            'socket_id' => $socketIds[$name],
            'channel_name' => $channel,
        ], $agents[$name]);
        required($status === 200, "Staff channel authorization failed for {$name}.");
        subscribe($sockets[$name], $channel, $authorized['auth']);
    }
}

foreach ($channels['acme'] as $channel) {
    [$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
        'socket_id' => $socketIds['beta'], 'channel_name' => $channel,
    ], $agents['beta']);
    required($status === 403, 'Another Organization joined a staff channel.');
    [$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
        'socket_id' => $socketIds['acme'], 'channel_name' => $channel,
    ], $customerTokens['acme']);
    required($status !== 200, 'Customer joined a staff channel.');
}

$revision = $tickets['acme']['revision'];
[$status] = api('PATCH', $hosts['acme'], $path.'/priority', ['priority' => 'high'], $agents['acme']);
required($status === 200, 'Priority update failed.');
$revision = receiveMetadataChange($sockets['acme'], $channels['acme'], $ticketId, 'priority_changed', $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['priority'] === 'high' && $current['ticket']['revision'] === $revision, 'Priority read is stale.');

[$status, $tag] = api('POST', $hosts['acme'], '/api/tags', ['name' => 'Urgent'], $agents['acme']);
required($status === 201, 'Tag creation failed.');
$tagId = $tag['data']['id'];
[$status] = api('POST', $hosts['acme'], $path.'/tags', ['tag_id' => $tagId], $agents['acme']);
required($status === 200, 'Tag attachment failed.');
$revision = receiveMetadataChange($sockets['acme'], $channels['acme'], $ticketId, 'tags_changed', $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision && count($current['tags']) === 1, 'Attached Tag read is stale.');

[$status] = api('DELETE', $hosts['acme'], $path.'/tags/'.$tagId, token: $agents['acme']);
required($status === 200, 'Tag detachment failed.');
$revision = receiveMetadataChange($sockets['acme'], $channels['acme'], $ticketId, 'tags_changed', $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision && count($current['tags']) === 0, 'Detached Tag read is stale.');

[$status] = api('DELETE', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200, 'Ticket deletion failed.');
$revision = receiveMetadataChange($sockets['acme'], $channels['acme'], $ticketId, 'deleted', $revision);
[$status] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 404, 'Deleted Ticket is still readable.');
[$status] = api('GET', $hosts['acme'], $path.'/live-channel', token: $agents['acme']);
required($status === 404, 'Deleted Ticket channel is still discoverable.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $socketIds['acme'], 'channel_name' => $channels['acme'][1],
], $agents['acme']);
required($status === 403, 'Deleted Ticket channel still accepts new subscriptions.');

[$status] = api('POST', $hosts['acme'], $path.'/restore', token: $agents['acme']);
required($status === 200, 'Ticket restoration failed.');
$revision = receiveMetadataChange($sockets['acme'], $channels['acme'], $ticketId, 'restored', $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision, 'Restored Ticket read is stale.');

[$status] = api('PATCH', $hosts['acme'], $path.'/priority', ['priority' => 'invalid'], $agents['acme']);
required($status === 422, 'Invalid Priority was accepted.');
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
try {
    DB::transaction(function () use ($ticketId) {
        Ticket::withoutGlobalScopes()->findOrFail($ticketId)->updatePriority('urgent');
        throw new RuntimeException('Simulated rollback');
    });
} catch (RuntimeException $error) {
    required($error->getMessage() === 'Simulated rollback', 'Unexpected transaction error.');
}
noMetadataChange($sockets['acme'], $ticketId, $revision);
noMetadataChange($sockets['beta'], $ticketId, 0);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision && $current['ticket']['priority'] === 'high', 'Rollback changed durable state.');

fclose($sockets['acme']);
fclose($sockets['beta']);
echo "Live Ticket classification and availability smoke passed.\n";
