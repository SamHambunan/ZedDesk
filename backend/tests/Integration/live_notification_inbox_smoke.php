<?php

// Run against Docker Compose: php tests/Integration/live_notification_inbox_smoke.php
// With Reverb stopped, pass --outage to verify durable REST recovery.

require __DIR__.'/live_socket_helpers.php';

$suffix = bin2hex(random_bytes(5));
$members = [];
foreach (['acme', 'beta'] as $name) {
    [$status, $registered] = api('POST', 'localhost', '/api/register', [
        'name' => ucfirst($name).' Agent',
        'email' => "notification-{$name}-{$suffix}@example.test",
        'password' => 'smoke-password',
        'password_confirmation' => 'smoke-password',
    ]);
    required($status === 201, "Registration failed for {$name}: {$status}");
    $members[$name] = $registered['token'];
    [$status] = api('POST', 'localhost', '/api/organizations', [
        'name' => ucfirst($name).' Notification Smoke',
        'slug' => "notification-{$name}-{$suffix}",
    ], $members[$name]);
    required($status === 201, "Organization creation failed for {$name}: {$status}");
}

$host = "notification-acme-{$suffix}.localhost";
$createTicket = function (string $subject) use ($host, $suffix): array {
    [$status, $created] = api('POST', $host, '/api/portal/tickets', [
        'name' => 'Smoke Customer',
        'email' => "notification-customer-{$suffix}@example.test",
        'subject' => $subject,
        'message' => 'A new Ticket needs attention.',
    ]);
    required($status === 201, "Ticket creation failed: {$status}");

    return $created;
};

if (($argv[1] ?? null) === '--outage') {
    $created = $createTicket('Reverb outage cannot lose this Notification');
    [$status, $inbox] = api('GET', $host, '/api/notifications', token: $members['acme']);
    required($status === 200 && count($inbox['data']) === 1, 'Inbox was not durable during Reverb outage.');
    required($inbox['data'][0]['ticket_id'] === $created['ticket']['id'], 'Outage inbox references the wrong Ticket.');
    [$status, $count] = api('GET', $host, '/api/notifications/unread-count', token: $members['acme']);
    required($status === 200 && $count['unread_count'] === 1, 'Unread count was lost during Reverb outage.');
    echo "Notification outage REST recovery passed.\n";
    exit(0);
}

$sockets = [];
foreach (['acme', 'beta'] as $name) {
    $memberHost = "notification-{$name}-{$suffix}.localhost";
    [$sockets[$name], $socketId] = connect($memberHost);
    [$status, $discovered] = api('GET', $memberHost, '/api/live/notification-channel', token: $members[$name]);
    required($status === 200, "Notification channel discovery failed for {$name}: {$status}");
    $channels[$name] = $discovered['channel'];
    $socketIds[$name] = $socketId;
}

[$status] = api('POST', "notification-beta-{$suffix}.localhost", '/api/broadcasting/auth', [
    'socket_id' => $socketIds['beta'], 'channel_name' => $channels['acme'],
], $members['beta']);
required($status === 403, 'A different Organization authorized the Notification channel.');

foreach (['acme', 'beta'] as $name) {
    [$status, $authorized] = api('POST', "notification-{$name}-{$suffix}.localhost", '/api/broadcasting/auth', [
        'socket_id' => $socketIds[$name], 'channel_name' => $channels[$name],
    ], $members[$name]);
    required($status === 200, "Notification channel authorization failed for {$name}: {$status}");
    subscribe($sockets[$name], $channels[$name], $authorized['auth']);
}

$created = $createTicket('Notification socket delivery');
$signal = frame($sockets['acme']);
required(($signal['event'] ?? null) === 'inbox.changed', 'Authorized member missed the inbox signal.');
$payload = json_decode($signal['data'], true, flags: JSON_THROW_ON_ERROR);
required(array_keys($payload) === ['event_id', 'organization_id', 'recipient_member_id'], 'Inbox signal exposed more than routing identifiers.');
stream_set_timeout($sockets['beta'], 2);
required(frame($sockets['beta']) === null, 'Another Organization received the inbox signal.');

[$status, $inbox] = api('GET', $host, '/api/notifications', token: $members['acme']);
required($status === 200 && count($inbox['data']) === 1, 'REST inbox did not expose the stored Notification.');
required($inbox['data'][0]['ticket_id'] === $created['ticket']['id'], 'REST inbox references the wrong Ticket.');
[$status] = api('POST', $host, '/api/notifications/'.$inbox['data'][0]['id'].'/mark-read', [], $members['acme']);
required($status === 200, 'Mark-read failed.');
required((frame($sockets['acme'])['event'] ?? null) === 'inbox.changed', 'Mark-read did not signal the inbox.');

fclose($sockets['acme']);
$missed = $createTicket('Missed while disconnected');
[$reconnectedSocket, $reconnectedSocketId] = connect($host);
[$status, $rediscovered] = api('GET', $host, '/api/live/notification-channel', token: $members['acme']);
required($status === 200, 'Notification channel rediscovery failed after reconnect.');
[$status, $reauthorized] = api('POST', $host, '/api/broadcasting/auth', [
    'socket_id' => $reconnectedSocketId, 'channel_name' => $rediscovered['channel'],
], $members['acme']);
required($status === 200, 'Notification channel reauthorization failed after reconnect.');
subscribe($reconnectedSocket, $rediscovered['channel'], $reauthorized['auth']);

[$status, $count] = api('GET', $host, '/api/notifications/unread-count', token: $members['acme']);
required($status === 200 && $count['unread_count'] === 1, 'Reconnect REST count did not recover current state.');
[$status, $recovered] = api('GET', $host, '/api/notifications', token: $members['acme']);
required($status === 200 && count($recovered['data']) === 2, 'Reconnect REST list missed Notification history.');
required($recovered['data'][0]['ticket_id'] === $missed['ticket']['id'], 'Reconnect REST list did not show current Ticket.');
$later = $createTicket('Live after reconnect');
$laterSignal = frame($reconnectedSocket);
required(($laterSignal['event'] ?? null) === 'inbox.changed', 'Reconnected member missed the next live signal.');
[$status, $current] = api('GET', $host, '/api/notifications', token: $members['acme']);
required($status === 200 && count($current['data']) === 3
    && in_array($later['ticket']['id'], array_column($current['data'], 'ticket_id'), true),
    'REST did not expose the Ticket signaled after reconnect.');

fclose($reconnectedSocket);
fclose($sockets['beta']);
echo "Live Notification inbox smoke passed.\n";
