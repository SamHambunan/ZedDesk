<?php

namespace App\Scopes;

use App\Context\OrganizationContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class OrganizationScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (OrganizationContext::hasCurrent()) {
            $builder->where($model->qualifyColumn('organization_id'), OrganizationContext::getCurrentId());
        }
    }
}
