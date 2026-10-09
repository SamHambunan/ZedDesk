<?php

// Run with Docker Compose: docker compose exec -T backend php tests/Integration/live_ticket_typing_presence_smoke.php

use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/live_socket_helpers.php';
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $error): never {
    fwrite(STDERR, $error->getMessage()."\n");
    exit(1);
});

$suffix = bin2hex(random_bytes(5));
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Typist',
        'email' => "typing-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "{$name} registration failed.");
    $tokens[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Typing Smoke', 'slug' => "typing-{$name}-{$suffix}",
    ], $tokens[$name]);
    required($status === 201, "{$name} Organization creation failed.");
    $hosts[$name] = "typing-{$name}-{$suffix}.localhost";
}
[$status, $observer] = api('POST', 'localhost', '/api/register', [
    'name' => 'Typing Observer',
    'email' => "typing-observer-{$suffix}@example.test",
    'password' => 'smoke-password',
    'password_confirmation' => 'smoke-password',
]);
required($status === 201, 'Observer registration failed.');
$organization = Organization::where('slug', "typing-acme-{$suffix}")->firstOrFail();
$agent = User::where('email', "typing-acme-{$suffix}@example.test")->firstOrFail();
$member = OrganizationMember::where('organization_id', $organization->id)->where('user_id', $agent->id)->firstOrFail();
OrganizationMember::create([
    'organization_id' => $organization->id,
    'user_id' => User::where('email', "typing-observer-{$suffix}@example.test")->firstOrFail()->id,
    'role' => 'agent',
]);
[$status, $created] = api('POST', $hosts['acme'], '/api/portal/tickets', [
    'name' => 'Typing Customer',
    'email' => "typing-customer-{$suffix}@example.test",
    'subject' => 'Typing Presence',
    'message' => 'Draft text stays private.',
]);
required($status === 201, 'Ticket creation failed.');
$ticketId = $created['ticket']['id'];
$notificationCount = DB::table('notifications')->where('ticket_id', $ticketId)->count();
[$status, $discovery] = api('GET', $hosts['acme'], "/api/tickets/{$ticketId}/viewing-channel", token: $tokens['acme']);
required($status === 200 && ($discovery['typing_expires_after_seconds'] ?? null) === 5,
    'Typing expiry contract was not advertised.');
$channel = $discovery['channel'];

[$observerSocket, $observerSocketId] = connect($hosts['acme']);
[$status, $observerAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $observerSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Observer authorization failed.');
$snapshot = subscribePresence($observerSocket, $channel, $observerAuth);
required($snapshot['presence']['count'] === 1, 'Observer membership was missing.');

[$senderSocket, $senderSocketId] = connect($hosts['acme']);
[$status, $senderAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $senderSocketId, 'channel_name' => $channel,
], $tokens['acme']);
required($status === 200, 'Sender authorization failed.');
subscribePresence($senderSocket, $channel, $senderAuth);
$joined = frame($observerSocket);
required(($joined['event'] ?? null) === 'pusher_internal:member_added', 'Sender membership was not announced.');
$senderMembership = json_decode($joined['data'], true, flags: JSON_THROW_ON_ERROR);
required(($senderMembership['user_id'] ?? null) === (string) $member->id
    && ($senderMembership['user_info']['member_id'] ?? null) === $member->id,
    'Sender identity did not come from signed Presence membership.');

[$deniedSocket, $deniedSocketId] = connect($hosts['acme']);
[$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
    'socket_id' => $deniedSocketId, 'channel_name' => $channel,
], $tokens['beta']);
required($status === 403, 'Other Organization authorized for typing Presence.');
[$status] = apiRequest('POST', $hosts['acme'], "/api/portal/tickets/{$ticketId}/broadcasting/auth",
    json_encode(['socket_id' => $deniedSocketId, 'channel_name' => $channel], JSON_THROW_ON_ERROR),
    "Content-Type: application/json\r\nX-Customer-Token: {$created['token']}\r\n");
required($status === 403, 'Customer authorized for typing Presence.');
sendFrame($deniedSocket, ['event' => 'client-typing', 'channel' => $channel, 'data' => ['typing' => true]]);
required((frame($deniedSocket)['event'] ?? null) === 'pusher:error', 'Unsubscribed Customer socket sent typing.');

sendFrame($senderSocket, ['event' => 'client-other', 'channel' => $channel,
    'data' => ['draft' => 'secret draft'],
]);
stream_set_timeout($observerSocket, 1);
required(frame($observerSocket) === null, 'An unapproved client event reached Ticket Presence.');
stream_set_timeout($observerSocket, 10);

// The receiver maps Reverb's authenticated member ID to the signed Presence snapshot.
sendFrame($senderSocket, ['event' => 'client-typing', 'channel' => $channel, 'user_id' => 'forged',
    'data' => ['typing' => true, 'member_id' => 'forged', 'name' => 'Impostor', 'draft' => 'secret draft'],
]);
$typing = frame($observerSocket);
required(($typing['event'] ?? null) === 'client-typing' && ($typing['user_id'] ?? null) === (string) $member->id,
    'Typing sender was not the authenticated Presence member.');
required(($typing['data'] ?? null) === ['typing' => true] && ! str_contains(json_encode($typing), 'secret draft'),
    'Typing forwarded unapproved fields.');
required($typing['user_id'] === $senderMembership['user_id'],
    'Typing sender did not match signed Presence membership.');

// A consumer expires its last true state after five seconds; a new subscriber gets no typing replay.
$lastInput = microtime(true);
usleep(5_100_000);
required(microtime(true) - $lastInput >= $discovery['typing_expires_after_seconds'], 'Typing did not expire.');
[$lateSocket, $lateSocketId] = connect($hosts['acme']);
[$status, $lateAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $lateSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Late observer authorization failed.');
subscribePresence($lateSocket, $channel, $lateAuth);
stream_set_timeout($lateSocket, 1);
required(frame($lateSocket) === null, 'Typing history was replayed to a late subscriber.');
fclose($lateSocket);
sendFrame($senderSocket, ['event' => 'client-typing', 'channel' => $channel, 'data' => ['typing' => false]]);
required((frame($observerSocket)['data'] ?? null) === ['typing' => false], 'Typing stop was not delivered.');

// Reverb bounds all socket messages, including client whispers.
for ($attempt = 0; $attempt < 50; $attempt++) {
    sendFrame($senderSocket, ['event' => 'client-typing', 'channel' => $channel, 'data' => ['typing' => true]]);
}
stream_set_timeout($senderSocket, 3);
$limited = frame($senderSocket);
required(($limited['event'] ?? null) === 'pusher:error'
    && str_contains($limited['data'] ?? '', 'Rate limit exceeded'), 'Reverb did not rate-limit typing traffic.');
required(DB::table('notifications')->where('ticket_id', $ticketId)->count() === $notificationCount,
    'Typing wrote a durable Notification.');

foreach ([$observerSocket, $senderSocket, $deniedSocket] as $socket) {
    fclose($socket);
}
echo "Live Ticket typing Presence smoke passed.\n";
