<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationMember extends Model
{
    use HasFactory;
    use BelongsToOrganization;

    protected $table = 'organization_members';

    protected $fillable = [
        'organization_id',
        'user_id',
        'role',
    ];

    protected function casts(): array
    {
        return [
            'role' => \App\Enums\Role::class,
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
