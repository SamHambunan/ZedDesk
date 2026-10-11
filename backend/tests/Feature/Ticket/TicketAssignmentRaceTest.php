<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(DatabaseMigrations::class);

afterEach(fn () => OrganizationContext::clear());

test('overlapping Assignment HTTP writes from one revision have one winner and one conflict', function (string $action) {
    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $customer = Customer::create([
        'organization_id' => $organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $ticket = Ticket::create([
        'organization_id' => $organization->id,
        'customer_id' => $customer->id,
        'subject' => 'Assignment race',
    ]);
    $actors = [];
    foreach (['Ada', 'Ben'] as $name) {
        $user = User::create([
            'name' => $name,
            'email' => strtolower($name).'@acme.test',
            'password' => bcrypt('password'),
        ]);
        $member = OrganizationMember::create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'agent',
        ]);
        $team = Team::create([
            'organization_id' => $organization->id,
            'name' => "{$name} team",
        ]);
        $actors[] = [$user, $member, $team];
    }

    Sanctum::actingAs($actors[0][0]);
    $url = "http://acme.localhost/api/tickets/{$ticket->id}";
    $revision = $this->getJson($url)->assertOk()->json('ticket.assignment_revision');
    $barriers = [
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
        stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0),
    ];
    $results = [tempnam(sys_get_temp_dir(), 'assignment-race-a-'), tempnam(sys_get_temp_dir(), 'assignment-race-b-')];
    $children = [];

    try {
        foreach ($actors as $index => [$user, $member, $team]) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                DB::purge('pgsql');
                Event::fake([TicketChanged::class]);
                Sanctum::actingAs($user);
                fread($barriers[$index][1], 1);

                $response = $this->postJson($url.'/'.$action, $action === 'assign'
                    ? ['team_id' => $team->id, 'expected_assignment_revision' => $revision]
                    : ['expected_assignment_revision' => $revision]);
                file_put_contents($results[$index], json_encode([
                    'status' => $response->getStatusCode(),
                    'current' => $response->json('current'),
                    'data' => $response->json('data'),
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
        $winner = collect($responses)->firstWhere('status', 200);
        $conflict = collect($responses)->firstWhere('status', 409);
        expect($conflict['current']['assigned_team_id'])->toBe($winner['data']['assigned_team_id'])
            ->and($conflict['current']['assigned_member_id'])->toBe($winner['data']['assigned_member_id'])
            ->and($conflict['current']['assignment_revision'])->toBe(2)
            ->and($ticket->fresh()->assignment_revision)->toBe(2);
        $this->assertDatabaseCount('ticket_assignments', 1);
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
})->with(['assign', 'claim']);
