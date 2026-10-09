<?php

// Run with Docker Compose: docker compose exec -T backend php tests/Integration/live_organization_presence_smoke.php

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
$hosts = [];
$tokens = [];
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "presence-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}: {$status}");
    $tokens[$name] = $registered['token'];
    $slug = "presence-{$name}-{$suffix}";
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Presence Smoke', 'slug' => $slug,
    ], $tokens[$name]);
    required($status === 201, "Organization creation failed for {$name}: {$status}");
    $hosts[$name] = $slug.'.localhost';
}

[$status, $observer] = api('POST', 'localhost', '/api/register', [
    'name' => 'Presence Observer',
    'email' => "presence-observer-{$suffix}@example.test",
    'password' => 'smoke-password',
    'password_confirmation' => 'smoke-password',
]);
required($status === 201, 'Observer registration failed.');
$organization = Organization::where('slug', "presence-acme-{$suffix}")->firstOrFail();
$agent = User::where('email', "presence-acme-{$suffix}@example.test")->firstOrFail();
$member = OrganizationMember::where('organization_id', $organization->id)->where('user_id', $agent->id)->firstOrFail();
OrganizationMember::create([
    'organization_id' => $organization->id,
    'user_id' => User::where('email', "presence-observer-{$suffix}@example.test")->firstOrFail()->id,
    'role' => 'agent',
]);

[$status, $discovery] = api('GET', $hosts['acme'], '/api/live/presence-channel', token: $tokens['acme']);
required($status === 200 && $discovery['offline_grace_seconds'] === 30, 'Presence discovery or grace contract failed.');
$channel = $discovery['channel'];
required($channel === 'presence-organization.'.$organization->id.'.members.'.intdiv(time(), 300), 'Presence generation is wrong.');
[$status, $betaDiscovery] = api('GET', $hosts['beta'], '/api/live/presence-channel', token: $tokens['beta']);
required($status === 200 && $betaDiscovery['channel'] !== $channel, 'Organizations share a Presence channel.');

[$observerSocket, $observerSocketId] = connect($hosts['acme']);
[$status, $observerAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $observerSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Observer Presence authorization failed.');
subscribePresence($observerSocket, $channel, $observerAuth);

[$firstSocket, $firstSocketId] = connect($hosts['acme']);
[$status] = api('POST', $hosts['beta'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
], $tokens['beta']);
required($status === 403, 'Cross-Organization Presence authorization succeeded.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
], $tokens['beta']);
required($status === 403, 'Another Organization Member joined Presence.');
[$status] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $firstSocketId, 'channel_name' => $channel,
]);
required($status === 401, 'Unauthenticated Customer socket joined Presence.');
[$status, $ticket] = api('POST', $hosts['acme'], '/api/portal/tickets', [
    'name' => 'Presence Customer',
    'email' => "presence-customer-{$suffix}@example.test",
    'subject' => 'Customer cannot join staff Presence',
    'message' => 'Private staff activity stays private.',
]);
required($status === 201, 'Customer Ticket setup failed.');
[$status] = apiRequest('POST', $hosts['acme'],
    '/api/portal/tickets/'.$ticket['ticket']['id'].'/broadcasting/auth',
    json_encode(['socket_id' => $firstSocketId, 'channel_name' => $channel], JSON_THROW_ON_ERROR),
    "Content-Type: application/json\r\nX-Customer-Token: {$ticket['token']}\r\n");
required($status === 403, 'Signed Customer token joined staff Presence.');
$notificationCount = DB::table('notifications')->count();

$authorizeAgent = function (string $socketId) use ($hosts, $tokens, $channel, $member): array {
    [$status, $auth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
        'socket_id' => $socketId, 'channel_name' => $channel,
        'member_id' => 'forged', 'name' => 'Forged',
    ], $tokens['acme']);
    required($status === 200, 'Agent Presence authorization failed.');
    $identity = json_decode($auth['channel_data'], true, flags: JSON_THROW_ON_ERROR);
    required($identity['user_id'] === (string) $member->id
        && $identity['user_info'] === ['member_id' => $member->id, 'name' => 'Acme Agent'],
        'Presence accepted a client-claimed identity.');

    return $auth;
};

$firstAuth = $authorizeAgent($firstSocketId);
subscribePresence($firstSocket, $channel, $firstAuth);
$added = frame($observerSocket);
required(($added['event'] ?? null) === 'pusher_internal:member_added', 'Observer missed the online member.');
required(json_decode($added['data'], true, flags: JSON_THROW_ON_ERROR)['user_id'] === (string) $member->id,
    'Presence member identity is wrong.');

[$secondSocket, $secondSocketId] = connect($hosts['acme']);
$secondAuth = $authorizeAgent($secondSocketId);
$snapshot = subscribePresence($secondSocket, $channel, $secondAuth);
required($snapshot['presence']['count'] === 2, 'Second tab did not see two distinct Organization Members.');
required(count(array_filter($snapshot['presence']['ids'], fn ($id) => (string) $id === (string) $member->id)) === 1,
    'Multiple tabs appeared as separate identities.');
stream_set_timeout($observerSocket, 2);
required(frame($observerSocket) === null, 'Second tab emitted a duplicate member_added event.');
fclose($firstSocket);
required(frame($observerSocket) === null, 'First tab disconnect removed an online Organization Member.');

fclose($secondSocket);
required(frame($observerSocket) === null, 'Last tab departure was announced before reconnect grace.');
[$graceObserverSocket, $graceObserverSocketId] = connect($hosts['acme']);
[$status, $graceObserverAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $graceObserverSocketId, 'channel_name' => $channel,
], $observer['token']);
required($status === 200, 'Observer reauthorization during grace failed.');
$graceSnapshot = subscribePresence($graceObserverSocket, $channel, $graceObserverAuth);
required(in_array((string) $member->id, array_map('strval', $graceSnapshot['presence']['ids']), true),
    'A new observer could not see the member during reconnect grace.');
fclose($graceObserverSocket);

[$reconnectedSocket, $reconnectedSocketId] = connect($hosts['acme']);
$reconnectedAuth = $authorizeAgent($reconnectedSocketId);
subscribePresence($reconnectedSocket, $channel, $reconnectedAuth);
required(frame($observerSocket) === null, 'Reconnection during grace produced a duplicate arrival.');
$lastDepartureAt = microtime(true);
fclose($reconnectedSocket);
required(frame($observerSocket) === null, 'Final departure was announced before reconnect grace.');
stream_set_timeout($observerSocket, 35);
$removed = frame($observerSocket);
required(($removed['event'] ?? null) === 'pusher_internal:member_removed', 'Grace expiry did not announce departure.');
required(microtime(true) - $lastDepartureAt >= 28, 'Departure was announced before grace expired.');
required(json_decode($removed['data'], true, flags: JSON_THROW_ON_ERROR)['user_id'] === (string) $member->id,
    'Departure identified the wrong Organization Member.');
[$afterGraceSocket, $afterGraceSocketId] = connect($hosts['acme']);
[$status, $afterGraceChannel] = api('GET', $hosts['acme'], '/api/live/presence-channel', token: $observer['token']);
required($status === 200, 'Presence rediscovery failed after grace.');
[$status, $afterGraceAuth] = api('POST', $hosts['acme'], '/api/broadcasting/auth', [
    'socket_id' => $afterGraceSocketId, 'channel_name' => $afterGraceChannel['channel'],
], $observer['token']);
required($status === 200, 'Presence reauthorization failed after grace.');
$afterGraceSnapshot = subscribePresence($afterGraceSocket, $afterGraceChannel['channel'], $afterGraceAuth);
required(! in_array((string) $member->id, array_map('strval', $afterGraceSnapshot['presence']['ids']), true),
    'Departed member remained online after grace expiry.');

required(! in_array('presence', Schema::getTableListing(), true)
    && ! in_array('organization_presence', Schema::getTableListing(), true),
    'Presence created a durable database table.');
required(DB::table('notifications')->count() === $notificationCount,
    'Presence join or departure created a durable Notification.');
fclose($afterGraceSocket);
fclose($observerSocket);
echo "Live Organization Presence smoke passed.\n";
