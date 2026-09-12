<?php

use App\Actions\Customer\FindOrCreateCustomer;
use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Repositories\CustomerRepository;
use App\Scopes\OrganizationScope;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
});

afterEach(function () {
    OrganizationContext::clear();
});

test('customers table has uuid primary key and required columns', function () {
    $customer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@example.com',
        'name' => 'Jane Customer',
        'phone' => '+1-555-0199',
        'metadata' => ['vip' => true, 'source' => 'web_portal'],
    ]);

    expect($customer->id)->toBeString()
        ->and(Str::isUuid($customer->id))->toBeTrue()
        ->and($customer->email)->toBe('customer@example.com')
        ->and($customer->name)->toBe('Jane Customer')
        ->and($customer->phone)->toBe('+1-555-0199')
        ->and($customer->metadata)->toBe(['vip' => true, 'source' => 'web_portal']);

    $this->assertDatabaseHas('customers', [
        'id' => $customer->id,
        'organization_id' => $this->acmeOrg->id,
        'email' => 'customer@example.com',
        'name' => 'Jane Customer',
        'phone' => '+1-555-0199',
    ]);
});

test('foreign key cascade deletes customers when organization is deleted', function () {
    $customer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'cascade@example.com',
        'name' => 'Cascade Customer',
    ]);

    $this->acmeOrg->delete();

    $this->assertDatabaseMissing('customers', [
        'id' => $customer->id,
    ]);
});

test('compound unique index prevents duplicate email within the same organization', function () {
    Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'duplicate@example.com',
        'name' => 'Original Customer',
    ]);

    expect(function () {
        Customer::create([
            'organization_id' => $this->acmeOrg->id,
            'email' => 'duplicate@example.com',
            'name' => 'Second Customer',
        ]);
    })->toThrow(QueryException::class);
});

test('same customer email can exist in different organizations without conflict', function () {
    $acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'shared@example.com',
        'name' => 'Shared Customer',
    ]);

    $betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'shared@example.com',
        'name' => 'Shared Customer',
    ]);

    expect($acmeCustomer->id)->not->toBe($betaCustomer->id)
        ->and($acmeCustomer->organization_id)->toBe($this->acmeOrg->id)
        ->and($betaCustomer->organization_id)->toBe($this->betaOrg->id)
        ->and($acmeCustomer->email)->toBe($betaCustomer->email);
});

test('customer model implements organization query scoping', function () {
    $acmeCustomer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'acme_cust@example.com',
        'name' => 'Acme Customer',
    ]);

    $betaCustomer = Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'beta_cust@example.com',
        'name' => 'Beta Customer',
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);

    $results = Customer::all();

    expect($results)->toHaveCount(1)
        ->and($results->first()->id)->toBe($acmeCustomer->id);

    OrganizationContext::setCurrent($this->betaOrg);

    $betaResults = Customer::all();

    expect($betaResults)->toHaveCount(1)
        ->and($betaResults->first()->id)->toBe($betaCustomer->id);
});

test('creating customer in active organization context automatically assigns organization_id', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $customer = Customer::create([
        'email' => 'auto_org@example.com',
        'name' => 'Auto Context Customer',
    ]);

    expect($customer->organization_id)->toBe($this->acmeOrg->id);

    $this->assertDatabaseHas('customers', [
        'id' => $customer->id,
        'organization_id' => $this->acmeOrg->id,
        'email' => 'auto_org@example.com',
    ]);
});

test('customer model organization scope can be bypassed using withoutGlobalScope', function () {
    Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'c1@example.com',
        'name' => 'Customer 1',
    ]);

    Customer::create([
        'organization_id' => $this->betaOrg->id,
        'email' => 'c2@example.com',
        'name' => 'Customer 2',
    ]);

    OrganizationContext::setCurrent($this->acmeOrg);

    $allCustomers = Customer::withoutGlobalScope(OrganizationScope::class)->get();

    expect($allCustomers->count())->toBe(2);
});

test('customer model relationships to organization and future tickets', function () {
    $customer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'rel@example.com',
        'name' => 'Rel Customer',
    ]);

    expect($customer->organization)->not->toBeNull()
        ->and($customer->organization->id)->toBe($this->acmeOrg->id)
        ->and($customer->tickets())->toBeInstanceOf(HasMany::class);
});

test('repository findOrCreate creates a new customer when non-existent', function () {
    $repo = new CustomerRepository();

    $customer = $repo->findOrCreate([
        'email' => 'newcustomer@example.com',
        'name' => 'New Customer',
        'phone' => '+1-555-1234',
        'metadata' => ['plan' => 'enterprise'],
    ], $this->acmeOrg);

    expect($customer)->toBeInstanceOf(Customer::class)
        ->and(Str::isUuid($customer->id))->toBeTrue()
        ->and($customer->organization_id)->toBe($this->acmeOrg->id)
        ->and($customer->email)->toBe('newcustomer@example.com')
        ->and($customer->name)->toBe('New Customer')
        ->and($customer->phone)->toBe('+1-555-1234')
        ->and($customer->metadata)->toBe(['plan' => 'enterprise']);

    $this->assertDatabaseHas('customers', [
        'id' => $customer->id,
        'organization_id' => $this->acmeOrg->id,
        'email' => 'newcustomer@example.com',
    ]);
});

test('repository findOrCreate returns existing customer without duplication', function () {
    $existing = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'existing@example.com',
        'name' => 'Existing Customer',
        'phone' => '111-222',
    ]);

    $repo = new CustomerRepository();

    $found = $repo->findOrCreate([
        'email' => 'existing@example.com',
        'name' => 'Different Name',
    ], $this->acmeOrg);

    expect($found->id)->toBe($existing->id)
        ->and($found->organization_id)->toBe($this->acmeOrg->id)
        ->and($found->email)->toBe('existing@example.com');

    expect(Customer::where('organization_id', $this->acmeOrg->id)->where('email', 'existing@example.com')->count())->toBe(1);
});

test('repository findOrCreate isolates customers across organizations', function () {
    $repo = new CustomerRepository();

    $acmeCustomer = $repo->findOrCreate([
        'email' => 'shared_lookup@example.com',
        'name' => 'Acme Customer',
    ], $this->acmeOrg);

    $betaCustomer = $repo->findOrCreate([
        'email' => 'shared_lookup@example.com',
        'name' => 'Beta Customer',
    ], $this->betaOrg);

    expect($acmeCustomer->id)->not->toBe($betaCustomer->id)
        ->and($acmeCustomer->organization_id)->toBe($this->acmeOrg->id)
        ->and($betaCustomer->organization_id)->toBe($this->betaOrg->id)
        ->and($acmeCustomer->email)->toBe($betaCustomer->email);
});

test('repository findOrCreate uses active organization context if organization not explicitly passed', function () {
    OrganizationContext::setCurrent($this->acmeOrg);

    $repo = new CustomerRepository();

    $customer = $repo->findOrCreate([
        'email' => 'context_customer@example.com',
        'name' => 'Context Customer',
    ]);

    expect($customer->organization_id)->toBe($this->acmeOrg->id);
});

test('action FindOrCreateCustomer executes lookup and creation atomically', function () {
    $action = new FindOrCreateCustomer(new CustomerRepository());

    $customer = $action->execute([
        'email' => 'action_customer@example.com',
        'name' => 'Action Customer',
    ], $this->acmeOrg);

    expect($customer)->toBeInstanceOf(Customer::class)
        ->and($customer->organization_id)->toBe($this->acmeOrg->id)
        ->and($customer->email)->toBe('action_customer@example.com');

    // Executing again with same email returns the same customer
    $sameCustomer = $action->execute([
        'email' => 'action_customer@example.com',
        'name' => 'Action Customer Again',
    ], $this->acmeOrg);

    expect($sameCustomer->id)->toBe($customer->id);

    // Invokable shorthand
    $invoked = $action([
        'email' => 'action_customer@example.com',
        'name' => 'Action Customer Invoked',
    ], $this->acmeOrg);

    expect($invoked->id)->toBe($customer->id);
});

test('repository findByEmail retrieves customer within organization', function () {
    $customer = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'find_me@example.com',
        'name' => 'Find Me',
    ]);

    $repo = new CustomerRepository();

    expect($repo->findByEmail('find_me@example.com', $this->acmeOrg)->id)->toBe($customer->id)
        ->and($repo->findByEmail('find_me@example.com', $this->betaOrg))->toBeNull();
});

test('repository findOrCreate throws InvalidArgumentException when no organization provided or set', function () {
    $repo = new CustomerRepository();

    expect(function () use ($repo) {
        $repo->findOrCreate([
            'email' => 'no_org@example.com',
            'name' => 'No Org',
        ]);
    })->toThrow(InvalidArgumentException::class);
});

test('repository findOrCreate throws InvalidArgumentException when email is empty', function () {
    $repo = new CustomerRepository();

    expect(function () use ($repo) {
        $repo->findOrCreate([
            'email' => '   ',
            'name' => 'Empty Email',
        ], $this->acmeOrg);
    })->toThrow(InvalidArgumentException::class);
});

test('repository findOrCreate throws InvalidArgumentException when name is empty', function () {
    $repo = new CustomerRepository();

    expect(function () use ($repo) {
        $repo->findOrCreate([
            'email' => 'valid@example.com',
            'name' => '   ',
        ], $this->acmeOrg);
    })->toThrow(InvalidArgumentException::class);
});

test('customer factory creates valid customer instance', function () {
    $customer = Customer::factory()->create([
        'organization_id' => $this->acmeOrg->id,
    ]);

    expect($customer)->toBeInstanceOf(Customer::class)
        ->and(Str::isUuid($customer->id))->toBeTrue()
        ->and($customer->organization_id)->toBe($this->acmeOrg->id)
        ->and($customer->email)->toBeString()
        ->and($customer->name)->toBeString();
});

test('action FindOrCreateCustomer recovers from unique constraint collision during concurrent create', function () {
    $existing = Customer::create([
        'organization_id' => $this->acmeOrg->id,
        'email' => 'collision@example.com',
        'name' => 'Pre-existing Customer',
    ]);

    // Subclass CustomerRepository to simulate the initial findByEmail lookup returning null
    // while executing the real production findOrCreate logic (DB::transaction, create, catch, recovery)
    $repo = new class extends CustomerRepository {
        public bool $simulatedRace = false;

        public function findByEmail(string $email, Organization|int|null $organization = null): ?Customer
        {
            if (! $this->simulatedRace) {
                $this->simulatedRace = true;
                // Return null on initial lookup to simulate two requests running findByEmail at the same millisecond
                return null;
            }

            return parent::findByEmail($email, $organization);
        }
    };

    $action = new FindOrCreateCustomer($repo);

    $result = $action->execute([
        'email' => 'collision@example.com',
        'name' => 'Colliding Customer',
    ], $this->acmeOrg);

    expect($result->id)->toBe($existing->id)
        ->and($result->name)->toBe('Pre-existing Customer');
});
