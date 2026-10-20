<?php

// Run through Docker Compose after phase4_workload.php seed. Stop one dependency, run "write",
// restore it, then run "wait <comma-separated-signal-ids>" within 60 seconds.

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

function check(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function apiReply(string $host, string $ticketId, string $token, string $key, string $body): array
{
    $response = @file_get_contents('http://nginx/api/tickets/'.$ticketId.'/messages', false, stream_context_create(['http' => [
        'method' => 'POST', 'ignore_errors' => true, 'timeout' => 10,
        'header' => "Host: {$host}.localhost\r\nAccept: application/json\r\nContent-Type: application/json\r\nAuthorization: Bearer {$token}\r\nIdempotency-Key: {$key}\r\n",
        'content' => json_encode(['message_type' => 'public_reply', 'body' => $body], JSON_THROW_ON_ERROR),
    ]]));

    return [(int) (explode(' ', $http_response_header[0] ?? '')[1] ?? 0), json_decode($response ?: '{}', true) ?: []];
}

$accessToken = null;
$exitCode = 0;
try {
    $mode = $argv[1] ?? '';
    if ($mode === 'wait') {
        $ids = array_filter(explode(',', $argv[2] ?? ''));
        check($ids !== [], 'Provide signal IDs returned by write.');
        $started = microtime(true);
        do {
            $delivered = DB::table('delivery_outbox')->whereIn('id', $ids)->whereNotNull('delivered_at')->count();
            if ($delivered > 0) {
                echo json_encode(['resumed_in_seconds' => round(microtime(true) - $started, 3),
                    'delivered' => $delivered, 'signals' => count($ids)], JSON_THROW_ON_ERROR)."\n";
                exit(0);
            }
            usleep(250000);
        } while (microtime(true) - $started < 60);
        throw new RuntimeException('No pending publication resumed within 60 seconds.');
    }
    check($mode === 'write', 'Usage: php tests/Integration/phase4_recovery.php write|wait [signal-ids]');
    $organization = DB::table('organizations')->where('slug', 'phase4-01')->first();
    check($organization !== null, 'Seed phase4-01 first.');
    $ticket = DB::table('tickets')->where('organization_id', $organization->id)->where('ticket_number', 1)->first();
    check($ticket !== null, 'Missing benchmark Ticket.');
    $user = User::where('email', 'phase4-01-user-2@example.test')->firstOrFail();
    $accessToken = $user->createToken('phase4-recovery');
    $token = $accessToken->plainTextToken;
    $key = bin2hex(random_bytes(32));
    $body = 'Recovery probe '.bin2hex(random_bytes(8));
    $before = [
        'messages' => DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
        'audits' => DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
        'notifications' => DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
        'signals' => DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
    ];
    [$status, $created] = apiReply($organization->slug, $ticket->id, $token, $key, $body);
    check($status === 201, "Reply failed with {$status}: ".json_encode($created));
    $messageId = $created['data']['id'] ?? null;
    check(is_string($messageId), 'Reply response omitted message ID.');
    $committed = [
        'messages' => DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
        'audits' => DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
        'notifications' => DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
        'signals' => DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
    ];
    check($committed['messages'] === $before['messages'] + 1, 'Committed reply did not add exactly one message.');
    check($committed['audits'] > $before['audits'] && $committed['signals'] > $before['signals'],
        'Committed reply omitted required audit or delivery intent.');
    [$retryStatus, $replayed] = apiReply($organization->slug, $ticket->id, $token, $key, $body);
    check($retryStatus === 201 && ($replayed['data']['id'] ?? null) === $messageId,
        "Lost-response retry returned {$retryStatus} or a different message.");
    $after = [
        'messages' => DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count(),
        'audits' => DB::table('audit_logs')->where('target_id', $ticket->id)->count(),
        'notifications' => DB::table('notifications')->where('ticket_id', $ticket->id)->count(),
        'signals' => DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->count(),
    ];
    check($after === $committed, 'Retry duplicated a business, audit, notification, or delivery effect.');
    $ids = DB::table('delivery_outbox')->where('ticket_id', $ticket->id)->orderByDesc('created_at')
        ->limit($committed['signals'] - $before['signals'])->pluck('id')->all();
    $pending = DB::table('delivery_outbox')->whereIn('id', $ids)->whereNull('delivered_at')->count();
    echo json_encode(['ticket_id' => $ticket->id, 'message_id' => $messageId,
        'signal_ids' => $ids, 'pending_signals' => $pending,
        'before' => $before, 'after' => $after], JSON_THROW_ON_ERROR)."\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage()."\n");
    $exitCode = 1;
} finally {
    if ($accessToken !== null) {
        $accessToken->accessToken->delete();
    }
}
exit($exitCode);
