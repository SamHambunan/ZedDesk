<?php

use App\Context\OrganizationContext;
use App\Events\TicketChanged;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->organization = Organization::create(['name' => 'Acme', 'slug' => 'acme']);
    $this->customer = Customer::create([
        'organization_id' => $this->organization->id,
        'name' => 'Customer',
        'email' => 'customer@acme.test',
    ]);
    $this->user = User::create([
        'name' => 'Admin',
        'email' => 'admin@acme.test',
        'password' => bcrypt('password'),
    ]);
    OrganizationMember::create([
        'organization_id' => $this->organization->id,
        'user_id' => $this->user->id,
        'role' => 'admin',
    ]);
    $this->ticket = Ticket::create([
        'organization_id' => $this->organization->id,
        'customer_id' => $this->customer->id,
        'subject' => 'Live metadata',
    ]);
    $this->tag = Tag::create([
        'organization_id' => $this->organization->id,
        'name' => 'Urgent',
        'slug' => 'urgent',
    ]);
    Event::fake([TicketChanged::class]);
    Sanctum::actingAs($this->user);
    $this->url = "http://acme.localhost/api/tickets/{$this->ticket->id}";
});

afterEach(fn () => OrganizationContext::clear());

function classificationSignals(): array
{
    return Event::dispatched(TicketChanged::class)
        ->map(fn ($dispatch) => $dispatch[0])
        ->all();
}

test('priority change signals current state with a body-free staff payload', function () {
    $this->patchJson($this->url.'/priority', ['priority' => 'high'])->assertOk();

    $signals = classificationSignals();
    expect($signals)->toHaveCount(1);
    expect($signals[0]->broadcastWith())->toMatchArray([
        'organization_id' => $this->organization->id,
        'ticket_id' => $this->ticket->id,
        'change_type' => 'priority_changed',
        'revision' => 2,
    ]);
    expect(array_keys($signals[0]->broadcastWith()))->toEqualCanonicalizing([
        'event_id', 'organization_id', 'ticket_id', 'change_type', 'revision',
    ]);
    expect($signals[0]->broadcastOn())->toHaveCount(2);
    $this->getJson($this->url)->assertOk()
        ->assertJsonPath('ticket.priority', 'high')
        ->assertJsonPath('ticket.revision', 2);
});

test('tag attachment and detachment each advance revision and signal current tags', function () {
    $this->postJson($this->url.'/tags', ['tag_id' => $this->tag->id])->assertOk();
    $this->getJson($this->url.'/tags')->assertOk()->assertJsonPath('data.0.id', $this->tag->id);
    $this->getJson($this->url)->assertOk()->assertJsonPath('ticket.revision', 2);

    $this->deleteJson($this->url.'/tags/'.$this->tag->id)->assertOk();
    $this->getJson($this->url.'/tags')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($this->url)->assertOk()->assertJsonPath('ticket.revision', 3);

    expect(array_map(fn ($signal) => $signal->broadcastWith()['change_type'], classificationSignals()))
        ->toBe(['tags_changed', 'tags_changed']);
    expect(array_map(fn ($signal) => $signal->broadcastWith()['revision'], classificationSignals()))
        ->toBe([2, 3]);
});

test('deletion and restoration signal availability and preserve a monotonic revision', function () {
    $this->deleteJson($this->url)->assertOk();
    $this->getJson($this->url)->assertNotFound();
    $this->getJson($this->url.'/live-channel')->assertNotFound();
    $this->postJson($this->url.'/restore')->assertOk()->assertJsonPath('data.revision', 3);
    $this->getJson($this->url)->assertOk()->assertJsonPath('ticket.revision', 3);

    expect(array_map(fn ($signal) => $signal->broadcastWith()['change_type'], classificationSignals()))
        ->toBe(['deleted', 'restored']);
    expect(array_map(fn ($signal) => $signal->broadcastWith()['revision'], classificationSignals()))
        ->toBe([2, 3]);
});

test('closed Ticket can be restored without weakening closed Ticket immutability', function () {
    $this->ticket->update(['status' => 'closed']);
    $revision = $this->ticket->fresh()->revision;

    $this->deleteJson($this->url)->assertOk();
    $this->postJson($this->url.'/restore')->assertOk()
        ->assertJsonPath('data.revision', $revision + 2);
    $this->getJson($this->url)->assertOk()->assertJsonPath('ticket.status', 'closed');
});

test('permanent deletion does not emit a soft deletion signal', function () {
    $this->ticket->forceDelete();

    expect(classificationSignals())->toBeEmpty();
});

test('rejected and unchanged mutations produce no classification signal', function () {
    $this->patchJson($this->url.'/priority', ['priority' => 'invalid'])->assertUnprocessable();
    $this->patchJson($this->url.'/priority', ['priority' => 'medium'])->assertOk();
    $this->deleteJson($this->url.'/tags/'.$this->tag->id)->assertOk();
    $this->postJson($this->url.'/restore')->assertUnprocessable();
    expect(classificationSignals())->toBeEmpty();

    $this->postJson($this->url.'/tags', ['tag_id' => $this->tag->id])->assertOk();
    Event::fake([TicketChanged::class]);
    $this->postJson($this->url.'/tags', ['tag_id' => $this->tag->id])->assertOk();
    expect(classificationSignals())->toBeEmpty();
});

test('rolled-back classification change leaves the durable revision unchanged', function () {
    try {
        DB::transaction(function () {
            $this->ticket->updatePriority('high');
            throw new RuntimeException('rollback');
        });
    } catch (RuntimeException $e) {
        expect($e->getMessage())->toBe('rollback');
    }
    expect($this->ticket->fresh()->revision)->toBe(1);
});
