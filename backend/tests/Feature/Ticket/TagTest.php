<?php

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Tag;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

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

    $this->customer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@acme.com',
        'name' => 'Acme Customer',
    ]);
});

afterEach(function () {
    OrganizationContext::clear();
});

test('tags and ticket_tags tables have expected schema structure', function () {
    expect(Schema::hasTable('tags'))->toBeTrue()
        ->and(Schema::hasTable('ticket_tags'))->toBeTrue()
        ->and(Schema::hasColumns('tags', [
            'id', 'organization_id', 'name', 'slug', 'created_at', 'updated_at',
        ]))->toBeTrue()
        ->and(Schema::hasColumns('ticket_tags', [
            'ticket_id', 'tag_id', 'created_at', 'updated_at',
        ]))->toBeTrue();
});

test('tag model creates tag with uuid primary key and auto-generates slug from name', function () {
    $tag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Issue',
    ]);

    expect($tag->id)->toBeString()
        ->and(Str::isUuid($tag->id))->toBeTrue()
        ->and($tag->name)->toBe('Billing Issue')
        ->and($tag->slug)->toBe('billing-issue')
        ->and($tag->organization_id)->toBe($this->acmeOrg->id);

    $this->assertDatabaseHas('tags', [
        'id' => $tag->id,
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Billing Issue',
        'slug' => 'billing-issue',
    ]);
});

test('tag model preserves custom slug if provided', function () {
    $tag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Security Vulnerability',
        'slug' => 'sec-vuln',
    ]);

    expect($tag->slug)->toBe('sec-vuln');
    $this->assertDatabaseHas('tags', [
        'id' => $tag->id,
        'slug' => 'sec-vuln',
    ]);
});

test('tag model automatically populates organization_id from context', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $tag = Tag::create([
        'name' => 'Onboarding',
    ]);

    expect($tag->organization_id)->toBe($this->acmeOrg->id);
});

test('duplicate slug within the same organization is rejected by unique constraint', function () {
    Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Hardware Bug',
        'slug' => 'hardware',
    ]);

    expect(function () {
        Tag::create([
            'organization_id' => $this->acmeOrg->id,
            'name' => 'Hardware Failure',
            'slug' => 'hardware',
        ]);
    })->toThrow(QueryException::class);
});

test('identical slug across different organizations is allowed', function () {
    $acmeTag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Urgent VIP',
        'slug' => 'urgent-vip',
    ]);

    $betaTag = Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Urgent VIP',
        'slug' => 'urgent-vip',
    ]);

    expect($acmeTag->id)->not->toBe($betaTag->id)
        ->and($acmeTag->slug)->toBe($betaTag->slug)
        ->and($acmeTag->organization_id)->not->toBe($betaTag->organization_id);
});

test('tag queries are automatically scoped by organization context', function () {
    Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'Acme Internal',
    ]);

    Tag::create([
        'organization_id' => $this->betaOrg->id,
        'name' => 'Beta Internal',
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);
    $acmeTags = Tag::all();
    expect($acmeTags)->toHaveCount(1)
        ->and($acmeTags->first()->name)->toBe('Acme Internal');

    OrganizationContext::setCurrent($this->betaOrg);
    $betaTags = Tag::all();
    expect($betaTags)->toHaveCount(1)
        ->and($betaTags->first()->name)->toBe('Beta Internal');
});

test('deleting organization cascade deletes its tags', function () {
    $tag = Tag::create([
        'organization_id' => $this->acmeOrg->id,
        'name' => 'To Be Cascade Deleted',
    ]);

    $this->acmeOrg->delete();

    $this->assertDatabaseMissing('tags', ['id' => $tag->id]);
});
