<?php

use App\Context\OrganizationContext;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

afterEach(function () {
    Carbon::setTestNow();
    OrganizationContext::clear();
});

test('only a current Organization Member joins the current Presence generation with a server identity', function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    Carbon::setTestNow('2026-10-09 12:01:00 UTC');

    $organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    Organization::create(['name' => 'Beta', 'slug' => 'beta']);
    $user = User::create(['name' => 'Agent', 'email' => 'agent@acme.test', 'password' => bcrypt('password')]);
    $member = OrganizationMember::create([
        'organization_id' => $organization->id, 'user_id' => $user->id, 'role' => 'agent',
    ]);
    $outsider = User::create(['name' => 'Outsider', 'email' => 'outsider@acme.test', 'password' => bcrypt('password')]);

    $this->getJson('http://acme.localhost/api/live/presence-channel')->assertUnauthorized();
    Sanctum::actingAs($user);
    $channel = $this->getJson('http://acme.localhost/api/live/presence-channel')
        ->assertOk()->assertJsonPath('offline_grace_seconds', 30)->json('channel');
    expect($channel)->toBe('presence-organization.'.$organization->id.'.members.'.intdiv(now()->timestamp, 300));

    $authorize = fn (string $host, string $name) => $this->postJson("http://{$host}.localhost/api/broadcasting/auth", [
        'socket_id' => '123.456', 'channel_name' => $name,
        'member_id' => $outsider->id, 'name' => 'Forged',
    ]);
    $authorized = $authorize('acme', $channel)->assertOk()->json();
    $identity = json_decode($authorized['channel_data'], true, flags: JSON_THROW_ON_ERROR);
    expect($identity)->toBe([
        'user_id' => (string) $member->id,
        'user_info' => ['member_id' => $member->id, 'name' => 'Agent'],
    ]);
    $authorize('beta', $channel)->assertForbidden();

    Carbon::setTestNow('2026-10-09 12:06:00 UTC');
    $next = $this->getJson('http://acme.localhost/api/live/presence-channel')->assertOk()->json('channel');
    expect($next)->not->toBe($channel);
    $authorize('acme', $channel)->assertForbidden();

    $member->delete();
    $this->getJson('http://acme.localhost/api/live/presence-channel')->assertForbidden();
    $authorize('acme', $next)->assertForbidden();
    Sanctum::actingAs($outsider);
    $authorize('acme', $next)->assertForbidden();
});
