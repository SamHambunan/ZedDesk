<?php

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Services\TicketStateMachine;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Run against Docker Compose: docker compose exec -T backend php tests/Integration/live_ticket_status_assignment_smoke.php
require __DIR__.'/live_socket_helpers.php';

function receiveChanges($socket, string $ticketId, array $channels, array $types, int $previousRevision): int
{
    $expected = [];
    foreach ($types as $type) {
        foreach ($channels as $channel) {
            $expected[$channel.'|'.$type] = false;
        }
    }

    $revision = $previousRevision;
    while (in_array(false, $expected, true)) {
        $signal = frame($socket);
        required(($signal['event'] ?? null) === 'ticket.changed', 'Missing Ticket change signal.');
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        if (($payload['change_type'] ?? null) === 'created') {
            continue;
        }
        $key = ($signal['channel'] ?? '').'|'.($payload['change_type'] ?? '');
        required(array_key_exists($key, $expected), 'Signal reached an unexpected channel or has the wrong change type.');
        required($expected[$key] === false, 'Duplicate change signal on a channel.');
        required(($payload['ticket_id'] ?? null) === $ticketId, 'Signal references the wrong Ticket.');
        required(($payload['revision'] ?? 0) > $previousRevision, 'Signal revision did not advance.');
        required(
            array_keys($payload) === ['event_id', 'organization_id', 'ticket_id', 'change_type', 'revision'],
            'Signal exposed Ticket content.'
        );
        $expected[$key] = true;
        $revision = max($revision, $payload['revision']);
    }

    return $revision;
}

function assertNoNewChange($socket, string $ticketId, int $revision): void
{
    stream_set_timeout($socket, 2);
    while (($signal = frame($socket)) !== null) {
        if (($signal['event'] ?? null) !== 'ticket.changed') {
            continue;
        }
        $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
        required(
            ($payload['ticket_id'] ?? null) !== $ticketId || ($payload['revision'] ?? 0) <= $revision,
            'Rolled-back or cross-Organization change reached this socket.'
        );
    }
}

$suffix = bin2hex(random_bytes(5));
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "metadata-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}: {$status}");
    $agents[$name] = $registered['token'];
    [$status, $created] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Metadata Smoke',
        'slug' => "metadata-{$name}-{$suffix}",
    ], $agents[$name]);
    required($status === 201, "Organization creation failed for {$name}: {$status}");
    $organizations[$name] = $created['organization']['id'];
    $hosts[$name] = "metadata-{$name}-{$suffix}.localhost";
    [$status, $ticket] = api('POST', $hosts[$name], '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "metadata-customer-{$name}-{$suffix}@example.test",
        'subject' => 'Status and Assignment delivery',
        'message' => 'Initial request',
    ]);
    required($status === 201, "Ticket creation failed for {$name}: {$status}");
    $tickets[$name] = $ticket['ticket'];
}

$ticketId = $tickets['acme']['id'];
$path = '/api/tickets/'.$ticketId;
if (($argv[1] ?? null) === '--outage') {
    [$status] = api('PATCH', $hosts['acme'], $path.'/status', ['status' => 'open'], $agents['acme']);
    required($status === 200, "Ticket Status mutation failed during Reverb outage: {$status}");
    [$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
    required($status === 200 && $current['ticket']['revision'] === 2, 'REST state was stale during Reverb outage.');
    echo "Reverb outage Ticket Status mutation passed.\n";
    exit(0);
}

foreach (['acme', 'beta'] as $name) {
    [$sockets[$name], $socketIds[$name]] = connect($hosts[$name]);
    [$status, $organizationChannel] = api('GET', $hosts[$name], '/api/live/organization-channel', token: $agents[$name]);
    required($status === 200, "Organization channel discovery failed for {$name}: {$status}");
    [$status, $ticketChannel] = api('GET', $hosts[$name], '/api/tickets/'.$tickets[$name]['id'].'/live-channel', token: $agents[$name]);
    required($status === 200, "Ticket channel discovery failed for {$name}: {$status}");
    $channels[$name] = [$organizationChannel['channel'], $ticketChannel['channel']];
    foreach ($channels[$name] as $channel) {
        [$status, $authorized] = api('POST', $hosts[$name], '/api/broadcasting/auth', [
            'socket_id' => $socketIds[$name],
            'channel_name' => $channel,
        ], $agents[$name]);
        required($status === 200, "Channel authorization failed for {$name}: {$status}");
        subscribe($sockets[$name], $channel, $authorized['auth']);
    }
}

foreach ($channels['acme'] as $channel) {
    [$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
        'socket_id' => $socketIds['beta'],
        'channel_name' => $channel,
    ], $agents['beta']);
    required($status === 403, "Cross-Organization subscription to {$channel} returned {$status}.");
}

$revision = $tickets['acme']['revision'];
[$status, $claim] = api('POST', $hosts['acme'], $path.'/claim', token: $agents['acme']);
required($status === 200, "Claim failed: {$status}");
$memberId = $claim['assignment']['member_id'];
$revision = receiveChanges($sockets['acme'], $ticketId, $channels['acme'], ['status_changed', 'assignment_changed'], $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision, 'Claim REST revision differs from signal.');
required($current['ticket']['status'] === 'open' && $current['ticket']['assigned_member_id'] === $memberId, 'Claim REST state is incomplete.');

[$status] = api('POST', $hosts['acme'], $path.'/assign', ['team_id' => null, 'member_id' => null], $agents['acme']);
required($status === 200, "Unassignment failed: {$status}");
$revision = receiveChanges($sockets['acme'], $ticketId, $channels['acme'], ['assignment_changed'], $revision);
[$status] = api('POST', $hosts['acme'], $path.'/assign', ['member_id' => $memberId], $agents['acme']);
required($status === 200, "Assignment change failed: {$status}");
$revision = receiveChanges($sockets['acme'], $ticketId, $channels['acme'], ['assignment_changed'], $revision);
[$status] = api('PATCH', $hosts['acme'], $path.'/status', ['status' => 'pending'], $agents['acme']);
required($status === 200, "Direct Ticket Status change failed: {$status}");
$revision = receiveChanges($sockets['acme'], $ticketId, $channels['acme'], ['status_changed'], $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision, 'Current REST revision differs from last signal.');
required($current['ticket']['status'] === 'pending' && $current['ticket']['assigned_member_id'] === $memberId, 'Current REST state is incomplete.');
assertNoNewChange($sockets['beta'], $ticketId, 0);

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$ticket = Ticket::withoutGlobalScopes()->findOrFail($ticketId);
try {
    DB::transaction(function () use ($ticket) {
        app(TicketStateMachine::class)->transitionTo($ticket, TicketStatus::RESOLVED);
        throw new RuntimeException('Simulated rollback');
    });
} catch (RuntimeException $error) {
    required($error->getMessage() === 'Simulated rollback', 'Unexpected transaction error.');
}
assertNoNewChange($sockets['acme'], $ticketId, $revision);
[$status, $current] = api('GET', $hosts['acme'], $path, token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === $revision && $current['ticket']['status'] === 'pending', 'Rollback changed durable Ticket state.');

fclose($sockets['acme']);
fclose($sockets['beta']);
echo "Live Ticket Status and Assignment smoke passed.\n";
