<?php

namespace App\Traits;

use App\Context\OrganizationContext;
use App\Models\Organization;
use App\Scopes\OrganizationScope;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToOrganization
{
    public static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope(new OrganizationScope);

        static::creating(function ($model) {
            if (OrganizationContext::hasCurrent() && empty($model->organization_id)) {
                $model->organization_id = OrganizationContext::getCurrentId();
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
