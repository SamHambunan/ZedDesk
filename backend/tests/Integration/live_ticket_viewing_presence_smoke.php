<?php

// Run against Docker Compose: docker compose exec -T backend php tests/Integration/live_ticket_viewing_presence_smoke.php

use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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
        'name' => ucfirst($name).' Viewer',
        'email' => "viewing-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "{$name} registration failed.");
    $tokens[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Viewing Smoke', 'slug' => "viewing-{$name}-{$suffix}",
    ], $tokens[$name]);
    required($status === 201, "{$name} Organization creation failed.");
    $hosts[$name] = "viewing-{$name}-{$suffix}.localhost";
}
[$status, $observer] = api('POST', 'localhost', '/api/register', [
    'name' => 'Viewing Observer',
    'email' => "viewing-observer-{$suffix}@example.test",
    'password' => 'smoke-password',
    'password_confirmation' => 'smoke-password',
]);
required($status === 201, 'Observer registration failed.');
$organization = Organization::where('slug', "viewing-acme-{$suffix}")->firstOrFail();
$agent = User::where('email', "viewing-acme-{$suffix}@example.test")->firstOrFail();
$member = OrganizationMember::where('organization_id', $organization->id)->where('user_id', $agent->id)->firstOrFail();
OrganizationMember::create([
    'organization_id' => $organization->id,
    'user_id' => User::where('email', "viewing-observer-{$suffix}@example.test")->firstOrFail()->id,
    'role' => 'agent',
]);
[$status, $created] = api('POST', $hosts['acme'], '/api/portal/tickets', [
    'name' => 'Viewing Customer',
    'email' => "viewing-customer-{$suffix}@example.test",
    'subject' => 'Viewing Presence',
    'message' => 'Current viewers only.',
]);
required($status === 201, 'Ticket creation failed.');
$notificationCount = DB::table('notifications')->count();
$ticketId = $created['ticket']['id'];
$path = '/api/tickets/'.$ticketId.'/viewing-channel';
[$status, $discovery] = api('GET', $hosts['acme'], $path, token: $tokens['acme']);
required($status === 200, 'Ticket viewing channel discovery failed.');
$channel = $discovery['channel'];
required($channel === 'presence-ticket.'.$ticketId.'.viewers.'.intdiv(time(), 300), 'Viewing generation is wrong.');
[$status] = api('GET', $hosts['beta'], $path, token: $tokens['beta']);
required($status === 404, 'Another Organization discovered the Ticket viewing channel.');

[$observerSocket, $observerSocketId] = connect($hosts['acme']);
[$status, $observerAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $observerSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Observer authorization failed.');
$observerSnapshot = subscribePresence($observerSocket, $channel, $observerAuth);
required($observerSnapshot['presence']['count'] === 1, 'Observer did not appear in viewing Presence.');

[$firstSocket, $firstSocketId] = connect($hosts['acme']);
[$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
], $tokens['beta']);
required($status === 403, 'Cross-Organization viewing authorization succeeded.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
], $tokens['beta']);
required($status === 403, 'Another Organization Member joined viewing Presence.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
]);
required($status === 401, 'Unauthenticated socket joined viewing Presence.');
[$status] = apiRequest('POST', $hosts['acme'],
    '/api/portal/tickets/'.$ticketId.'/broadcasting/auth',
    json_encode(['socket_id' => $firstSocketId, 'channel_name' => $channel], JSON_THROW_ON_ERROR),
    "Content-Type: application/json\r\nX-Customer-Token: {$created['token']}\r\n");
required($status === 403, 'Customer token joined staff viewing Presence.');

$authorizeAgent = function (string $socketId) use ($hosts, $tokens, $channel, $member): array {
    [$status, $auth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
        'socket_id' => $socketId, 'channel_name' => $channel,
        'member_id' => 'forged', 'name' => 'Forged',
    ], $tokens['acme']);
    required($status === 200, 'Agent viewing authorization failed.');
    $identity = json_decode($auth['channel_data'], true, flags: JSON_THROW_ON_ERROR);
    required($identity['user_id'] === (string) $member->id
        && $identity['user_info'] === ['member_id' => $member->id, 'name' => 'Acme Viewer'],
        'Viewing Presence accepted a client identity.');

    return $auth;
};

$firstAuth = $authorizeAgent($firstSocketId);
subscribePresence($firstSocket, $channel, $firstAuth);
$added = frame($observerSocket);
required(($added['event'] ?? null) === 'pusher_internal:member_added'
    && json_decode($added['data'], true, flags: JSON_THROW_ON_ERROR)['user_id'] === (string) $member->id,
    'Observer missed the agent viewing Ticket.');
[$secondSocket, $secondSocketId] = connect($hosts['acme']);
$secondAuth = $authorizeAgent($secondSocketId);
$secondSnapshot = subscribePresence($secondSocket, $channel, $secondAuth);
required($secondSnapshot['presence']['count'] === 2
    && count(array_filter($secondSnapshot['presence']['ids'], fn ($id) => (string) $id === (string) $member->id)) === 1,
    'Two tabs appeared as separate viewers.');
stream_set_timeout($observerSocket, 2);
required(frame($observerSocket) === null, 'Second tab announced a duplicate viewer.');

// A hidden tab explicitly unsubscribes; the other tab keeps the member visible.
sendFrame($firstSocket, ['event' => 'pusher:unsubscribe', 'data' => ['channel' => $channel]]);
required(frame($observerSocket) === null, 'Hiding one tab removed the viewer while another tab remained.');
$remaining = connect($hosts['acme']);
[$remainingSocket, $remainingSocketId] = $remaining;
[$status, $remainingAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $remainingSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Second observer authorization failed.');
$remainingSnapshot = subscribePresence($remainingSocket, $channel, $remainingAuth);
required($remainingSnapshot['presence']['count'] === 2, 'Hidden tab remained in the viewer snapshot.');
fclose($remainingSocket);

// Navigating away closes the final Ticket tab and removes the viewer immediately.
fclose($secondSocket);
$removed = frame($observerSocket);
required(($removed['event'] ?? null) === 'pusher_internal:member_removed'
    && json_decode($removed['data'], true, flags: JSON_THROW_ON_ERROR)['user_id'] === (string) $member->id,
    'Leaving the final Ticket tab did not remove the viewer.');

// A hidden final tab also leaves the roster without waiting for online grace.
[$lastSocket, $lastSocketId] = connect($hosts['acme']);
$lastAuth = $authorizeAgent($lastSocketId);
subscribePresence($lastSocket, $channel, $lastAuth);
required((frame($observerSocket)['event'] ?? null) === 'pusher_internal:member_added', 'Viewer did not return.');
sendFrame($lastSocket, ['event' => 'pusher:unsubscribe', 'data' => ['channel' => $channel]]);
required((frame($observerSocket)['event'] ?? null) === 'pusher_internal:member_removed', 'Hiding the final tab did not remove the viewer.');

// A previously signed old-generation channel is rejected by the socket server itself.
$oldChannel = 'presence-ticket.'.$ticketId.'.viewers.'.(intdiv(time(), 300) - 1);
$oldData = $lastAuth['channel_data'];
$signature = hash_hmac('sha256', $lastSocketId.':'.$oldChannel.':'.$oldData, getenv('REVERB_APP_SECRET'));
sendFrame($lastSocket, ['event' => 'pusher:subscribe', 'data' => [
    'channel' => $oldChannel,
    'auth' => getenv('REVERB_APP_KEY').':'.$signature,
    'channel_data' => $oldData,
]]);
required((frame($lastSocket)['event'] ?? null) === 'pusher:error', 'An old generation accepted a signed subscription.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $lastSocketId, 'channel_name' => $oldChannel,
], $tokens['acme']);
required($status === 403, 'An old generation was reauthorized.');
[$status, $renewed] = api('GET', $hosts['acme'], $path, token: $tokens['acme']);
required($status === 200, 'Current generation discovery failed.');
[$status, $renewedAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $lastSocketId, 'channel_name' => $renewed['channel'],
], $tokens['acme']);
required($status === 200, 'Current generation reauthorization failed.');
subscribePresence($lastSocket, $renewed['channel'], $renewedAuth);

required(! in_array('ticket_viewing_presence', Schema::getTableListing(), true), 'Viewing Presence created a durable table.');
required(! Schema::hasTable('ticket_view_history'), 'Viewing Presence created a history table.');
required(DB::table('notifications')->count() === $notificationCount, 'Viewing Presence wrote a Notification.');
fclose($lastSocket);
fclose($firstSocket);
fclose($observerSocket);
echo "Live Ticket viewing Presence smoke passed.\n";
