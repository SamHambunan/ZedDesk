<?php

use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use GuzzleHttp\Client;
use GuzzleHttp\Promise\Utils;
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

    $client = new Client(['http_errors' => false, 'timeout' => 15]);
    $url = "http://nginx/api/tickets/{$ticket->id}/messages";
    $options = [
        'headers' => [
            'Host' => 'acme.localhost',
            'Accept' => 'application/json',
            'Authorization' => "Bearer {$token}",
            'Idempotency-Key' => $key,
        ],
        'json' => ['message_type' => 'public_reply', 'body' => 'One intended message'],
    ];

    try {
        $responses = Utils::unwrap([$client->postAsync($url, $options), $client->postAsync($url, $options)]);
    } finally {
        DB::unprepared('DROP TRIGGER slow_member_message_insert ON ticket_messages; DROP FUNCTION slow_member_message_insert;');
    }

    expect(array_map(fn ($response) => $response->getStatusCode(), $responses))->toBe([201, 201]);
    $bodies = array_map(fn ($response) => json_decode((string) $response->getBody(), true), $responses);
    expect($bodies[0])->toBe($bodies[1])
        ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1)
        ->and(DB::table('request_idempotency')->count())->toBe(1);

    $user->tokens()->delete();
    expect($client->post($url, $options)->getStatusCode())->toBe(401)
        ->and(DB::table('ticket_messages')->where('ticket_id', $ticket->id)->count())->toBe(1);
});
