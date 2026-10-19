<?php

use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(DatabaseMigrations::class);

test('overlapping PostgreSQL requests with one key return one committed member message', function () {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create(['organization_id' => $organization->id, 'name' => 'Customer', 'email' => 'customer@acme.test']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    OrganizationMember::create(['organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent']);
    $ticket = Ticket::create(['organization_id' => $organization->id, 'customer_id' => $customer->id, 'subject' => 'Concurrent']);
    $token = $user->createToken('concurrency-test')->plainTextToken;
    $key = (string) Str::uuid();

    // Hold the first request inside its business transaction while the second reaches the unique key.
    DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION slow_member_message_insert() RETURNS trigger AS $$
BEGIN
    PERFORM pg_sleep(0.4);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER slow_member_message_insert BEFORE INSERT ON ticket_messages FOR EACH ROW EXECUTE FUNCTION slow_member_message_insert();
SQL);

    $url = "http://acme.localhost/api/tickets/{$ticket->id}/messages";
    $payload = ['message_type' => 'public_reply', 'body' => 'One intended message'];
    $barriers = [
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
    ];
    $results = [tempnam(sys_get_temp_dir(), 'member-message-a-'), tempnam(sys_get_temp_dir(), 'member-message-b-')];
    $children = [];

    try {
        foreach ($results as $index => $path) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                DB::purge('pgsql');
                fread($barriers[$index][1], 1);

                $response = $this->withToken($token)
                    ->withHeader('Idempotency-Key', $key)
                    ->postJson($url, $payload);
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

        $user->tokens()->delete();
        $this->withToken($token)
            ->withHeader('Idempotency-Key', $key)
            ->postJson($url, $payload)
            ->assertUnauthorized();
        expect(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
    } finally {
        DB::unprepared('DROP TRIGGER slow_member_message_insert ON ticket_messages; DROP FUNCTION slow_member_message_insert;');
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
