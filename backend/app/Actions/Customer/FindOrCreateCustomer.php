<?php

namespace App\Actions\Customer;

use App\Models\Customer;
use App\Models\Organization;
use App\Repositories\CustomerRepository;

class FindOrCreateCustomer
{
    public function __construct(
        protected CustomerRepository $customerRepository = new CustomerRepository()
    ) {}

    /**
     * Execute the atomic find-or-create customer intake action.
     *
     * @param  array{email: string, name: string, phone?: ?string, metadata?: ?array}  $data
     * @param  Organization|int|null  $organization
     * @return Customer
     */
    public function execute(array $data, Organization|int|null $organization = null): Customer
    {
        return $this->customerRepository->findOrCreate($data, $organization);
    }

    /**
     * Invokable shorthand for execute.
     */
    public function __invoke(array $data, Organization|int|null $organization = null): Customer
    {
        return $this->execute($data, $organization);
    }
}
