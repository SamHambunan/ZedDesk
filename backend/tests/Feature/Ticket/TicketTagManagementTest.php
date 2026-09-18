<?php

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidTicketTransitionException;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->acmeOrg = Organization::create([
        'name' => 'Acme Corporation',
        'slug' => 'acme',
    ]);

    $this->betaOrg = Organization::create([
        'name' => 'Beta Corporation',
        'slug' => 'beta',
    ]);

    $this->acmeUser = User::create([
        'name' => 'Acme Agent',
        'email' => 'agent@acme.test',
        'password' => Hash::make('password'),
    ]);

    $this->betaUser = User::create([
        'name' => 'Beta Agent',
        'email' => 'agent@beta.test',
        'password' => Hash::make('password'),
    ]);

    $this->acmeMember = OrganizationMember::create([
        'organization_id' => $this->acmeOrg->id,
        'user_id' => $this->acmeUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->betaMember = OrganizationMember::create([
        'organization_id' => $this->betaOrg->id,
        'user_id' => $this->betaUser->id,
        'role' => Role::AGENT->value,
    ]);

    $this->acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);

    $this->betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'customer@beta.com',
        'name' => 'Beta Customer',
    ]);

    $this->acmeTicket = Ticket::create([
        'organization_id' => $this->acmeOrg->id,
        'customer_id' => $this->acmeCustomer->id,
        'subject' => 'Acme Ticket For Tags',
    ]);

    $this->betaTicket = Ticket::create([
        'organization_id' => $this->betaOrg->id,
        'customer_id' => $this->betaCustomer->id,
        'subject' => 'Beta Ticket For Tags',
    ]);

    $this->acmeTag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Bug',
    ]);

    $this->betaTag = Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Feature',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('ticket can attach and detach tag belonging to the same organization', function () {
    $this->acmeTicket->attachTag($this->acmeTag);

    expect($this->acmeTicket->tags)->toHaveCount(1)
        ->and($this->acmeTicket->tags->first()->id)->toBe($this->acmeTag->id);

    $this->assertDatabaseHas('ticket_tags', [
        'ticket_id' => $this->acmeTicket->id,
        'tag_id' => $this->acmeTag->id,
    ]);

    // Detach tag
    $this->acmeTicket->detachTag($this->acmeTag);

    expect($this->acmeTicket->fresh()->tags)->toBeEmpty();
    $this->assertDatabaseMissing('ticket_tags', [
        'ticket_id' => $this->acmeTicket->id,
        'tag_id' => $this->acmeTag->id,
    ]);
});

test('attaching tag accepts tag uuid string and is idempotent', function () {
    $this->acmeTicket->attachTag($this->acmeTag->id);
    $this->acmeTicket->attachTag($this->acmeTag->id);

    expect($this->acmeTicket->fresh()->tags)->toHaveCount(1);
});

test('ticket rejects attaching tag from another organization', function () {
    expect(fn () => $this->acmeTicket->attachTag($this->betaTag))
        ->toThrow(DomainException::class, 'Cross-organization tag assignment is rejected.');

    $this->assertDatabaseMissing('ticket_tags', [
        'ticket_id' => $this->acmeTicket->id,
        'tag_id' => $this->betaTag->id,
    ]);
});

test('ticket rejects detaching tag from another organization', function () {
    expect(fn () => $this->acmeTicket->detachTag($this->betaTag))
        ->toThrow(DomainException::class, 'Cross-organization tag detachment is rejected.');
});

test('closed ticket rejects tag attachment and detachment', function () {
    $this->acmeTicket->attachTag($this->acmeTag);

    $this->acmeTicket->status = TicketStatus::CLOSED;
    $this->acmeTicket->save();

    $newTag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Late Tag',
    ]);

    expect(fn () => $this->acmeTicket->attachTag($newTag))
        ->toThrow(InvalidTicketTransitionException::class);

    expect(fn () => $this->acmeTicket->detachTag($this->acmeTag))
        ->toThrow(InvalidTicketTransitionException::class);
});

test('ticket syncTags attaches valid tags and removes omitted tags', function () {
    $tag2 = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Frontend',
    ]);

    $tag3 = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Backend',
    ]);

    $this->acmeTicket->attachTag($this->acmeTag);

    $this->acmeTicket->syncTags([$tag2, $tag3]);

    $tagIds = $this->acmeTicket->fresh()->tags->pluck('id')->all();
    expect($tagIds)->toHaveCount(2)
        ->and($tagIds)->toContain($tag2->id)
        ->and($tagIds)->toContain($tag3->id)
        ->and($tagIds)->not->toContain($this->acmeTag->id);
});

test('ticket syncTags rejects cross organization tag', function () {
    expect(fn () => $this->acmeTicket->syncTags([$this->acmeTag, $this->betaTag]))
        ->toThrow(DomainException::class, 'Cross-organization tag assignment is rejected.');
});

test('organization member can list tags scoped to their organization via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $response = $this->getJson('http://acme.localhost/api/tags');

    $response->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $this->acmeTag->id)
        ->assertJsonPath('data.0.name', 'Bug');
});

test('organization member can create tag via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $response = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Customer Request',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.name', 'Customer Request')
        ->assertJsonPath('data.slug', 'customer-request');

    $this->assertDatabaseHas('tags', [
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Customer Request',
        'slug' => 'customer-request',
    ]);
});

test('creating tag via api validates name and rejects duplicate slug', function () {
    Sanctum::actingAs($this->acmeUser);

    // Missing name
    $response = $this->postJson('http://acme.localhost/api/tags', []);
    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name']);

    // Duplicate slug
    $response = $this->postJson('http://acme.localhost/api/tags', [
        'name' => 'Bug',
    ]);
    $response->assertStatus(422)
        ->assertJsonValidationErrors(['slug']);
});

test('organization member can attach and detach tags on ticket via api', function () {
    Sanctum::actingAs($this->acmeUser);

    // Attach tag
    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags", [
        'tag_id' => $this->acmeTag->id,
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.tags.0.id', $this->acmeTag->id);

    $this->assertDatabaseHas('ticket_tags', [
        'ticket_id' => $this->acmeTicket->id,
        'tag_id' => $this->acmeTag->id,
    ]);

    // List ticket tags
    $listResponse = $this->getJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags");
    $listResponse->assertStatus(200)
        ->assertJsonCount(1, 'data');

    // Detach tag
    $detachResponse = $this->deleteJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags/{$this->acmeTag->id}");
    $detachResponse->assertStatus(200);

    $this->assertDatabaseMissing('ticket_tags', [
        'ticket_id' => $this->acmeTicket->id,
        'tag_id' => $this->acmeTag->id,
    ]);
});

test('cross organization tag attachment is rejected via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $response = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags", [
        'tag_id' => $this->betaTag->id,
    ]);

    $response->assertStatus(422);
});

test('cross organization tag detachment is rejected via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $response = $this->deleteJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags/{$this->betaTag->id}");

    $response->assertStatus(422);
});

test('tag attachment and detachment on closed ticket returns 422 via api', function () {
    Sanctum::actingAs($this->acmeUser);

    $this->acmeTicket->status = TicketStatus::CLOSED;
    $this->acmeTicket->save();

    // Attach attempt on closed ticket
    $attachResponse = $this->postJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags", [
        'tag_id' => $this->acmeTag->id,
    ]);
    $attachResponse->assertStatus(422);

    // Detach attempt on closed ticket
    $detachResponse = $this->deleteJson("http://acme.localhost/api/tickets/{$this->acmeTicket->id}/tags/{$this->acmeTag->id}");
    $detachResponse->assertStatus(422);
});
