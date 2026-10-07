<?php

function api(string $method, string $host, string $path, ?array $body = null, ?string $token = null): array
{
    $headers = "Host: {$host}\r\nAccept: application/json\r\n";
    if ($body !== null) {
        $headers .= "Content-Type: application/json\r\n";
    }
    if ($token !== null) {
        $headers .= "Authorization: Bearer {$token}\r\n";
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => $headers,
        'content' => $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
        'ignore_errors' => true,
        'timeout' => 10,
    ]]);
    $response = file_get_contents('http://nginx'.$path, false, $context);
    $status = (int) (explode(' ', $http_response_header[0])[1] ?? 0);

    return [$status, json_decode($response ?: '{}', true, flags: JSON_THROW_ON_ERROR)];
}

function required(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function readExact($socket, int $length): ?string
{
    $bytes = '';
    while (strlen($bytes) < $length) {
        $chunk = fread($socket, $length - strlen($bytes));
        if ($chunk === false || $chunk === '') {
            return null;
        }
        $bytes .= $chunk;
    }

    return $bytes;
}

function frame($socket): ?array
{
    $header = readExact($socket, 2);
    if ($header === null) {
        return null;
    }
    $first = ord($header[0]);
    $length = ord($header[1]) & 127;
    if ($length === 126) {
        $length = unpack('n', readExact($socket, 2))[1];
    } elseif ($length === 127) {
        $length = unpack('J', readExact($socket, 8))[1];
    }
    $payload = readExact($socket, $length);

    return $payload === null ? null : json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
}

function sendFrame($socket, array $message): void
{
    $payload = json_encode($message, JSON_THROW_ON_ERROR);
    $length = strlen($payload);
    required($length < 65536, 'Smoke frame is unexpectedly large.');
    $mask = random_bytes(4);
    $masked = '';
    for ($i = 0; $i < $length; $i++) {
        $masked .= $payload[$i] ^ $mask[$i % 4];
    }
    $header = $length < 126 ? chr(0x81).chr(0x80 | $length) : chr(0x81).chr(0x80 | 126).pack('n', $length);
    fwrite($socket, $header.$mask.$masked);
}

function connect(string $host): array
{
    $socket = stream_socket_client('tcp://nginx:80', $errno, $error, 10);
    required($socket !== false, "Socket connection failed: {$error}");
    stream_set_timeout($socket, 10);
    $key = base64_encode(random_bytes(16));
    $appKey = getenv('REVERB_APP_KEY');
    $request = "GET /app/{$appKey}?protocol=7&client=js&version=8.0&flash=false HTTP/1.1\r\n"
        ."Host: {$host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        ."Origin: http://{$host}:5173\r\nSec-WebSocket-Key: {$key}\r\nSec-WebSocket-Version: 13\r\n\r\n";
    fwrite($socket, $request);
    $status = fgets($socket);
    required(str_contains($status ?: '', '101'), "WebSocket upgrade failed: {$status}");
    while (($line = fgets($socket)) !== false && trim($line) !== '') {
    }
    $connected = frame($socket);
    required(($connected['event'] ?? null) === 'pusher:connection_established', 'Missing connection event.');
    $data = json_decode($connected['data'], true, flags: JSON_THROW_ON_ERROR);

    return [$socket, $data['socket_id']];
}

function subscribe($socket, string $channel, string $auth): void
{
    sendFrame($socket, ['event' => 'pusher:subscribe', 'data' => ['channel' => $channel, 'auth' => $auth]]);
    $message = frame($socket);
    required(($message['event'] ?? null) === 'pusher_internal:subscription_succeeded', 'Subscription was not accepted.');
}
