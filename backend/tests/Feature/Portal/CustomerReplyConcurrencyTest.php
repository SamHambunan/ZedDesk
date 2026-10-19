<?php

use App\Models\Customer;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\CustomerTokenService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(DatabaseMigrations::class);

test('overlapping customer replies with one key return one committed result', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Concurrent']);
    $token = app(CustomerTokenService::class)->generateToken($customer, $ticket);
    $key = (string) Str::uuid();

    DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION slow_customer_reply_insert() RETURNS trigger AS $$
BEGIN
    PERFORM pg_sleep(0.4);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER slow_customer_reply_insert BEFORE INSERT ON ticket_messages FOR EACH ROW EXECUTE FUNCTION slow_customer_reply_insert();
SQL);

    $url = "http://acme.localhost/api/portal/tickets/{$ticket->id}/reply";
    $barriers = [
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
    ];
    $results = [tempnam(sys_get_temp_dir(), 'customer-reply-a-'), tempnam(sys_get_temp_dir(), 'customer-reply-b-')];
    $children = [];

    try {
        foreach ($results as $index => $path) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                DB::purge('pgsql');
                fread($barriers[$index][1], 1);

                $response = $this->withHeader('X-Customer-Token', $token)
                    ->withHeader('Idempotency-Key', $key)
                    ->postJson($url, ['message' => 'One intended reply']);
                file_put_contents($path, json_encode([
                    'status' => $response->getStatusCode(),
                    'body' => $response->json(),
                ]));
                exit(0);
            }

            expect($pid)->toBeGreaterThan(0);
            $children[] = $pid;
        }

        foreach ($barriers as $pair) {
            fwrite($pair[0], 'G');
        }
        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
            expect(pcntl_wifexited($status) && pcntl_wexitstatus($status) === 0)->toBeTrue();
        }

        DB::purge('pgsql');
        $responses = array_map(fn ($path) => json_decode(file_get_contents($path), true), $results);
        expect(array_column($responses, 'status'))->toBe([201, 201])
            ->and($responses[0]['body'])->toBe($responses[1]['body'])
            ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
            ->and(DB::table('request_idempotency')->count())->toBe(1);
    } finally {
        DB::unprepared('DROP TRIGGER slow_customer_reply_insert ON ticket_messages; DROP FUNCTION slow_customer_reply_insert;');
        foreach ($barriers as $pair) {
            fclose($pair[0]);
            fclose($pair[1]);
        }
        foreach ($results as $path) {
            if (file_exists($path)) {
                unlink($path);
            }
        }
    }
});
