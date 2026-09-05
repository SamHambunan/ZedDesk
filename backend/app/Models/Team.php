<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Team extends Model
{
    use BelongsToOrganization;
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'name',
        'description',
    ];

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(OrganizationMember::class, 'team_members', 'team_id', 'organization_member_id')
            ->withTimestamps();
    }

    public function organizationMembers(): BelongsToMany
    {
        return $this->members();
    }
}
