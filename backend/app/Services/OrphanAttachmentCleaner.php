<?php

namespace App\Services;

use App\Models\TicketAttachment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class OrphanAttachmentCleaner
{
    public const GRACE_SECONDS = 3600;

    public function clean(?int $organizationId = null): int
    {
        $disk = Storage::disk(config('filesystems.attachments_disk', 'private'));
        $deleted = 0;

        foreach ($disk->allFiles('tenants') as $path) {
            if (! preg_match('~^tenants/([0-9]+)/tickets/([a-f0-9-]+)/attachments/([a-f0-9-]+)\.[^/]+$~', $path, $matches)) {
                continue;
            }

            if ($organizationId !== null && (int) $matches[1] !== $organizationId) {
                continue;
            }

            if ($disk->lastModified($path) > time() - self::GRACE_SECONDS) {
                continue;
            }

            $deleted += DB::transaction(function () use ($disk, $path) {
                if (! AttachmentPathLock::tryHold($path)) {
                    return 0;
                }

                // Recheck age and references inside the lock. The writer holds this lock until commit.
                if (! $disk->exists($path)
                    || $disk->lastModified($path) > time() - self::GRACE_SECONDS
                    || TicketAttachment::withoutGlobalScopes()->where('file_path', $path)->exists()) {
                    return 0;
                }

                if (! $disk->delete($path)) {
                    throw new RuntimeException('Unable to remove orphan attachment.');
                }

                return 1;
            });
        }

        return $deleted;
    }
}
