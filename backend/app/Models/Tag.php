<?php

namespace App\Models;

use App\Services\TagCatalogCache;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class Tag extends Model
{
    use BelongsToOrganization;
    use HasFactory;
    use HasUuids;

    protected $fillable = [
        'organization_id',
        'name',
        'slug',
    ];

    /**
     * Model boot lifecycle events.
     */
    protected static function booted(): void
    {
        static::creating(function (Tag $tag) {
            if (empty($tag->slug) && ! empty($tag->name)) {
                $tag->slug = Str::slug($tag->name);
            }
        });

        static::created(function (Tag $tag) {
            if (! empty($tag->organization_id)) {
                try {
                    app(TagCatalogCache::class)->invalidate($tag->organization_id);
                } catch (\Throwable) {
                    // Safe fallback
                }
            }
        });

        static::deleted(function (Tag $tag) {
            if (! empty($tag->organization_id)) {
                try {
                    app(TagCatalogCache::class)->invalidate($tag->organization_id);
                } catch (\Throwable) {
                    // Safe fallback
                }
            }
        });
    }

    /**
     * Get the tickets associated with this tag.
     */
    public function tickets(): BelongsToMany
    {
        return $this->belongsToMany(Ticket::class, 'ticket_tags', 'tag_id', 'ticket_id')
            ->withTimestamps();
    }
}
