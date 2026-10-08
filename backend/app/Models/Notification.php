<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use BelongsToOrganization, HasUuids;

    protected $fillable = [
        'organization_id', 'recipient_member_id', 'ticket_id',
        'activity_type', 'latest_activity_metadata', 'latest_activity_at', 'read_at',
    ];

    protected function casts(): array
    {
        return [
            'latest_activity_metadata' => 'array',
            'latest_activity_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(OrganizationMember::class, 'recipient_member_id');
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }
}
