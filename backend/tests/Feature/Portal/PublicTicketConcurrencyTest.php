<?php

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(DatabaseMigrations::class);

test('overlapping public intake requests with one key create one inquiry', function () {
    Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $key = (string) Str::uuid();
    $payload = ['name' => 'Alice', 'email' => 'alice@example.test', 'subject' => 'Help', 'message' => 'One inquiry'];

    DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION slow_public_ticket_insert() RETURNS trigger AS $$
BEGIN
    PERFORM pg_sleep(0.4);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER slow_public_ticket_insert BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION slow_public_ticket_insert();
SQL);

    $barriers = [
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
    ];
    $results = [tempnam(sys_get_temp_dir(), 'intake-a-'), tempnam(sys_get_temp_dir(), 'intake-b-')];
    $children = [];

    try {
        foreach ($results as $index => $path) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                DB::purge('pgsql');
                fread($barriers[$index][1], 1);
                $response = $this->withHeader('Idempotency-Key', $key)
                    ->postJson('http://acme.localhost/api/portal/tickets', $payload);
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
            ->and(DB::table('tickets')->count())->toBe(1)
            ->and(DB::table('ticket_messages')->count())->toBe(1)
            ->and(DB::table('request_idempotency')->count())->toBe(1);
    } finally {
        DB::unprepared('DROP TRIGGER slow_public_ticket_insert ON tickets; DROP FUNCTION slow_public_ticket_insert;');
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
