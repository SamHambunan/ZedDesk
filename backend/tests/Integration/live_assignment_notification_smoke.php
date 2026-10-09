<?php

// Run from Docker Compose's backend container; --outage checks REST while Reverb is stopped.

use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/live_socket_helpers.php';
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$suffix = bin2hex(random_bytes(5));
$register = function (string $name) use ($suffix): string {
    [$status, $response] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name),
        'email' => "assignment-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}: {$status}");

    return $response['token'];
};

foreach (['actor', 'outgoing', 'incoming', 'teammate', 'outsider'] as $name) {
    $tokens[$name] = $register($name);
}

foreach (['acme' => 'actor', 'beta' => 'outsider'] as $name => $owner) {
    [$status, $response] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Assignment Notification Smoke',
        'slug' => "assignment-{$name}-{$suffix}",
    ], $tokens[$owner]);
    required($status === 201, "Organization creation failed for {$name}: {$status}");
    $organizations[$name] = $response['organization']['id'];
}

$host = "assignment-acme-{$suffix}.localhost";
$betaHost = "assignment-beta-{$suffix}.localhost";
$actorId = OrganizationMember::withoutGlobalScopes()->where('organization_id', $organizations['acme'])->firstOrFail()->id;
foreach (['outgoing', 'incoming', 'teammate'] as $name) {
    $email = "assignment-{$name}-{$suffix}@example.test";
    $userId = User::where('email', $email)->firstOrFail()->id;
    $memberIds[$name] = OrganizationMember::create([
        'organization_id' => $organizations['acme'], 'user_id' => $userId, 'role' => 'agent',
    ])->id;
}

[$status, $created] = api('POST', $host, '/api/portal/tickets', [
    'name' => 'Smoke Customer',
    'email' => "assignment-customer-{$suffix}@example.test",
    'subject' => 'Assignment handoff',
    'message' => 'Please help',
]);
required($status === 201, "Ticket creation failed: {$status}");
$ticketId = $created['ticket']['id'];
$path = '/api/tickets/'.$ticketId.'/assign';

if (($argv[1] ?? null) === '--outage') {
    [$status] = api('POST', $host, $path, ['member_id' => $memberIds['outgoing']], $tokens['actor']);
    required($status === 200, 'Assignment failed during Reverb outage.');
    [$status, $inbox] = api('GET', $host, '/api/notifications', token: $tokens['outgoing']);
    required($status === 200 && $inbox['data'][0]['activity_type'] === 'assignment_changed',
        'Assignment Notification was not durable during Reverb outage.');
    echo "Assignment Notification outage recovery passed.\n";
    exit(0);
}

foreach (['actor', 'outgoing', 'incoming', 'teammate', 'outsider'] as $name) {
    $memberHost = $name === 'outsider' ? $betaHost : $host;
    [$sockets[$name], $socketIds[$name]] = connect($memberHost);
    [$status, $channel] = api('GET', $memberHost, '/api/live/notification-channel', token: $tokens[$name]);
    required($status === 200, "Channel discovery failed for {$name}.");
    $channels[$name] = $channel['channel'];
    [$status, $authorized] = api('POST', $memberHost, '/api/broadcasting/auth', [
        'socket_id' => $socketIds[$name], 'channel_name' => $channels[$name],
    ], $tokens[$name]);
    required($status === 200, "Channel authorization failed for {$name}.");
    subscribe($sockets[$name], $channels[$name], $authorized['auth']);
}

[$status] = api('POST', $betaHost, '/api/broadcasting/auth', [
    'socket_id' => $socketIds['outsider'], 'channel_name' => $channels['incoming'],
], $tokens['outsider']);
required($status === 403, 'Another Organization authorized the incoming member channel.');

$signalFor = function (string $name) use (&$sockets, &$channels): void {
    $signal = frame($sockets[$name]);
    required(($signal['event'] ?? null) === 'inbox.changed' && ($signal['channel'] ?? null) === $channels[$name],
        "{$name} missed the private inbox signal.");
    $payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
    required(array_keys($payload) === ['event_id', 'organization_id', 'recipient_member_id'],
        'Inbox signal exposed activity details.');
};

[$status] = api('POST', $host, $path, ['member_id' => $memberIds['outgoing']], $tokens['actor']);
required($status === 200, 'Initial Assignment failed.');
$signalFor('outgoing');
[$status] = api('POST', $host, $path, ['member_id' => $memberIds['incoming']], $tokens['actor']);
required($status === 200, 'Handoff failed.');
$signalFor('outgoing');
$signalFor('incoming');
foreach (['outgoing', 'incoming'] as $name) {
    [$status, $inbox] = api('GET', $host, '/api/notifications', token: $tokens[$name]);
    required($status === 200 && count($inbox['data']) === 1
        && $inbox['data'][0]['activity_type'] === 'assignment_changed', "{$name} has the wrong inbox state.");
}

$team = Team::create(['organization_id' => $organizations['acme'], 'name' => 'Support']);
$team->members()->attach([$actorId, $memberIds['teammate']]);
[$status] = api('POST', $host, $path, ['team_id' => $team->id, 'member_id' => null], $tokens['actor']);
required($status === 200, 'Team fallback Assignment failed.');
$signalFor('incoming'); // outgoing handler
$signalFor('teammate'); // current Team member
foreach (['actor', 'outsider'] as $name) {
    stream_set_timeout($sockets[$name], 2);
    required(frame($sockets[$name]) === null, "{$name} received another member's Notification.");
}

foreach ($sockets as $socket) {
    fclose($socket);
}
echo "Live Assignment Notification smoke passed.\n";
