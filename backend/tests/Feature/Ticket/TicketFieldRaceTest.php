<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(DatabaseMigrations::class);

afterEach(fn () => OrganizationContext::clear());

test('overlapping same-field HTTP writes from one revision have one winner and one conflict', function (string $field, string $target) {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Race test',
    ]);
    $users = [];
    foreach (['Ada', 'Ben'] as $name) {
        $user = User::create([
            'name' => $name,
            'email' => strtolower($name).'@acme.test',
            'password' => bcrypt('password'),
        ]);
        OrganizationMember::create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'agent',
        ]);
        $users[] = $user;
    }

    Sanctum::actingAs($users[0]);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}";
    $revision = $this->getJson($url)->assertOk()->json("ticket.{$field}_revision");
    $barriers = [
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
    ];
    $results = [tempnam(sys_get_temp_dir(), 'ticket-race-a-'), tempnam(sys_get_temp_dir(), 'ticket-race-b-')];
    $children = [];

    try {
        foreach ($users as $index => $user) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                DB::purge('pgsql');
                Event::fake([TicketChanged::class]);
                Sanctum::actingAs($user);
                fread($barriers[$index][1], 1);

                $response = $this->patchJson($url.'/'.$field, [
                    $field => $target,
                    "expected_{$field}_revision" => $revision,
                ]);
                file_put_contents($results[$index], json_encode([
                    'status' => $response->getStatusCode(),
                    'current' => $response->json('current'),
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
        expect(array_column($responses, 'status'))->toEqualCanonicalizing([200, 409]);
        $conflict = collect($responses)->firstWhere('status', 409);
        expect($conflict['current'][$field])->toBe($target)
            ->and($conflict['current']["{$field}_revision"])->toBe(2)
            ->and($ticket->fresh()->revision)->toBe(2);
    } finally {
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
})->with([
    'Ticket Status' => ['status', 'open'],
    'Priority' => ['priority', 'high'],
]);
