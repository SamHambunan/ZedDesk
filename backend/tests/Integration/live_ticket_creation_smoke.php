<?php

use App\Models\Ticket;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

// Run against the Docker Compose stack: docker compose exec -T backend php tests/Integration/live_ticket_creation_smoke.php

require __DIR__.'/live_socket_helpers.php';

$suffix = bin2hex(random_bytes(5));
$agents = [];
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "live-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed: {$status}");
    $agents[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Live Smoke',
        'slug' => "live-{$name}-{$suffix}",
    ], $agents[$name]);
    required($status === 201, "Organization creation failed: {$status}");
}

if (($argv[1] ?? null) === '--outage') {
    [$status, $created] = api('POST', "live-acme-{$suffix}.localhost", '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "customer-{$suffix}@example.test",
        'subject' => 'Reverb outage must not block intake',
        'message' => 'Current state remains available through REST.',
    ]);
    required($status === 201, "Ticket creation failed during Reverb outage: {$status}");
    [$status, $current] = api('GET', "live-acme-{$suffix}.localhost", '/api/tickets/'.$created['ticket']['id'], token: $agents['acme']);
    required($status === 200 && $current['ticket']['revision'] === 1, 'REST read failed during Reverb outage.');
    echo "Reverb outage Ticket write passed.\n";
    exit(0);
}

$rejectedSocket = stream_socket_client('tcp://nginx:80', $errno, $error, 10);
required($rejectedSocket !== false, "Origin test connection failed: {$error}");
stream_set_timeout($rejectedSocket, 10);
$originTestKey = base64_encode(random_bytes(16));
fwrite($rejectedSocket,
    'GET /app/'.getenv('REVERB_APP_KEY')."?protocol=7&client=js&version=8.0&flash=false HTTP/1.1\r\n"
    ."Host: live-acme-{$suffix}.localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
    ."Origin: http://untrusted.example\r\nSec-WebSocket-Key: {$originTestKey}\r\nSec-WebSocket-Version: 13\r\n\r\n"
);
$rejectedStatus = fgets($rejectedSocket);
if (str_contains($rejectedStatus ?: '', '101')) {
    while (($line = fgets($rejectedSocket)) !== false && trim($line) !== '') {
    }
    $rejection = frame($rejectedSocket);
    required(($rejection['event'] ?? null) === 'pusher:error', 'Untrusted WebSocket origin was accepted.');
}
fclose($rejectedSocket);

[$acmeSocket, $acmeSocketId] = connect("live-acme-{$suffix}.localhost");
[$betaSocket, $betaSocketId] = connect("live-beta-{$suffix}.localhost");

foreach (['acme', 'beta'] as $name) {
    [$status, $discovery] = api('GET', "live-{$name}-{$suffix}.localhost", '/api/live/organization-channel', token: $agents[$name]);
    required($status === 200, "Channel discovery failed for {$name}: {$status}");
    $channels[$name] = $discovery['channel'];
}

[$status] = api('POST', "live-acme-{$suffix}.localhost", '/api/broadcasting/auth', [
    'socket_id' => $betaSocketId,
    'channel_name' => $channels['acme'],
], $agents['beta']);
required($status === 403, "Cross-Organization channel authorization returned {$status}.");

foreach (['acme', 'beta'] as $name) {
    [$status, $authorized] = api('POST', "live-{$name}-{$suffix}.localhost", '/api/broadcasting/auth', [
        'socket_id' => $name === 'acme' ? $acmeSocketId : $betaSocketId,
        'channel_name' => $channels[$name],
    ], $agents[$name]);
    required($status === 200, "Channel authorization failed for {$name}: {$status}");
    subscribe($name === 'acme' ? $acmeSocket : $betaSocket, $channels[$name], $authorized['auth']);
}

[$status, $created] = api('POST', "live-acme-{$suffix}.localhost", '/api/portal/tickets', [
    'name' => 'Smoke Customer',
    'email' => "customer-{$suffix}@example.test",
    'subject' => 'Live delivery smoke',
    'message' => 'Body must stay in REST.',
]);
required($status === 201, "Ticket creation failed: {$status}");

$signal = frame($acmeSocket);
required(($signal['event'] ?? null) === 'ticket.changed', 'Authorized socket missed the creation signal.');
$payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
required(($payload['ticket_id'] ?? null) === $created['ticket']['id'], 'Signal references the wrong Ticket.');
required(($payload['revision'] ?? null) === 1 && ($payload['change_type'] ?? null) === 'created', 'Signal has the wrong revision or type.');
required(isset($payload['event_id'], $payload['organization_id']), 'Signal is missing identifiers.');
required(! isset($payload['subject'], $payload['message'], $payload['body'], $payload['ticket']), 'Signal leaked Ticket content.');

stream_set_timeout($betaSocket, 2);
required(frame($betaSocket) === null, 'Cross-Organization socket received the signal.');

[$status, $current] = api('GET', "live-acme-{$suffix}.localhost", '/api/tickets/'.$created['ticket']['id'], token: $agents['acme']);
required($status === 200 && $current['ticket']['revision'] === 1, 'REST recovery did not expose the current revision.');

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config([
    'queue.default' => 'sync',
    'queue.connections.sync.after_commit' => true,
    'broadcasting.default' => 'log',
]);
$broadcastLogs = [];
Event::listen(MessageLogged::class, function ($event) use (&$broadcastLogs) {
    if (str_contains($event->message, 'Broadcasting [ticket.changed]')) {
        $broadcastLogs[] = $event->message;
    }
});
$rolledBackTicketId = null;
try {
    DB::transaction(function () use ($created, $payload, &$rolledBackTicketId) {
        $ticket = Ticket::create([
            'organization_id' => $payload['organization_id'],
            'customer_id' => $created['customer']['id'],
            'subject' => 'Must roll back before broadcast',
        ]);
        $rolledBackTicketId = $ticket->id;
        throw new RuntimeException('Simulated rollback');
    });
} catch (RuntimeException $error) {
    required($error->getMessage() === 'Simulated rollback', 'Unexpected transaction error.');
}
required(! Ticket::withoutGlobalScopes()->whereKey($rolledBackTicketId)->exists(), 'Rolled-back Ticket was persisted.');
required($broadcastLogs === [], 'Rolled-back Ticket emitted a signal.');

fclose($acmeSocket);
fclose($betaSocket);
echo "Live Ticket creation smoke passed.\n";
