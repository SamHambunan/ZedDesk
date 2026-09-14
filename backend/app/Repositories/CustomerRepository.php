<?php

namespace App\Repositories;

use App\Context\OrganizationContext;
use App\Models\Customer;
use App\Models\Organization;
use App\Scopes\OrganizationScope;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class CustomerRepository
{
    /**
     * Atomically find an existing customer or create a new customer within the given organization.
     * Handles concurrency and prevents duplicate key race conditions.
     *
     * @param  array{email: string, name: string, phone?: ?string, metadata?: ?array}  $data
     * @param  Organization|int|null  $organization
     * @return Customer
     *
     * @throws InvalidArgumentException|QueryException
     */
    public function findOrCreate(array $data, Organization|int|null $organization = null): Customer
    {
        $organizationId = $this->resolveOrganizationId($organization);
        $email = trim($data['email'] ?? '');
        $name = trim($data['name'] ?? '');

        if ($email === '') {
            throw new InvalidArgumentException('Customer email cannot be empty.');
        }

        if ($name === '') {
            throw new InvalidArgumentException('Customer name cannot be empty.');
        }

        $existing = $this->findByEmail($email, $organizationId);

        if ($existing) {
            return $existing;
        }

        try {
            return DB::transaction(function () use ($organizationId, $email, $name, $data) {
                return Customer::create([
                    'organization_id' => $organizationId,
                    'email' => $email,
                    'name' => $name,
                    'phone' => $data['phone'] ?? null,
                    'metadata' => $data['metadata'] ?? null,
                ]);
            });
        } catch (QueryException $e) {
            // Check for unique constraint violation (SQLSTATE 23505 in PostgreSQL or duplicate key error)
            if ($e->getCode() === '23505' || str_contains($e->getMessage(), 'unique') || str_contains($e->getMessage(), 'Duplicate')) {
                return $this->findByEmail($email, $organizationId)
                    ?? throw $e;
            }

            throw $e;
        }
    }

    /**
     * Find a customer by email scoped to the organization.
     */
    public function findByEmail(string $email, Organization|int|null $organization = null): ?Customer
    {
        $organizationId = $this->resolveOrganizationId($organization);

        return Customer::withoutGlobalScope(OrganizationScope::class)
            ->where('organization_id', $organizationId)
            ->where('email', trim($email))
            ->first();
    }

    /**
     * Resolve the organization ID from the parameter or the active OrganizationContext.
     */
    protected function resolveOrganizationId(Organization|int|null $organization): int
    {
        if ($organization instanceof Organization) {
            return (int) $organization->id;
        }

        if (is_numeric($organization)) {
            return (int) $organization;
        }

        if (OrganizationContext::hasCurrent()) {
            return OrganizationContext::getCurrentId();
        }

        throw new InvalidArgumentException('An organization or active organization context is required.');
    }
}
