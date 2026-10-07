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

beforeEach(function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    (new AppServiceProvider(app()))->boot();
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->user = User::create([
        'name' => 'Agent',
        'email' => 'agent@acme.test',
        'password' => bcrypt('password'),
    ]);
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->user->id,
        'role' => 'agent',
    ]);
});

afterEach(fn () => OrganizationContext::clear());

test('customer creation exposes revision one through authorized staff REST reads', function () {
    $created = $this->postJson('http://acme.localhost/api/portal/tickets', [
        'name' => 'Customer',
        'email' => 'customer@acme.test',
        'subject' => 'Live ticket',
        'message' => 'Please help',
    ])->assertCreated()->assertJsonPath('ticket.revision', 1);

    Sanctum::actingAs($this->user);

    $this->getJson('http://acme.localhost/api/tickets/'.$created->json('ticket.id'))
        ->assertOk()
        ->assertJsonPath('ticket.revision', 1)
        ->assertJsonPath('data.revision', 1);
});

test('only a current Organization Member can discover and authorize the current channel generation', function () {
    Carbon::setTestNow('2026-10-07 12:01:00 UTC');
    $other = Organization::create(['name' => 'Beta', 'slug' => 'beta']);

    $this->getJson('http://acme.localhost/api/live/organization-channel')->assertUnauthorized();

    Sanctum::actingAs($this->user);
    $channel = $this->getJson('http://acme.localhost/api/live/organization-channel')
        ->assertOk()->json('channel');

    expect($channel)->toBe('private-organization.'.$this->organization->id.'.'.intdiv(Carbon::now()->timestamp, 300));

    $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => $channel,
    ])->assertOk()->assertJsonStructure(['auth']);

    $this->postJson('http://beta.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => $channel,
    ])->assertForbidden();

    Carbon::setTestNow('2026-10-07 12:06:00 UTC');
    $next = $this->getJson('http://acme.localhost/api/live/organization-channel')
        ->assertOk()->json('channel');
    expect($next)->not->toBe($channel);

    $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => $channel,
    ])->assertForbidden();

    OrganizationMember::where('organization_id', $this->organization->id)->delete();
    $this->getJson('http://acme.localhost/api/live/organization-channel')->assertForbidden();
    $this->postJson('http://acme.localhost/api/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => $next,
    ])->assertForbidden();

    Carbon::setTestNow();
});
