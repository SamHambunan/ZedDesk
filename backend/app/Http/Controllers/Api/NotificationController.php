<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Events\MemberInboxChanged;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    private function inbox(Request $request)
    {
        return Notification::query()
            ->where('organization_id', OrganizationContext::getCurrentId())
            ->where('recipient_member_id', $request->attributes->get('organization_member')->id);
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = min(100, max(1, (int) $request->integer('per_page', 20)));

        return response()->json($this->inbox($request)
            ->orderByRaw('read_at IS NULL DESC')
            ->orderByDesc('latest_activity_at')->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($perPage));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['unread_count' => $this->inbox($request)->whereNull('read_at')->count()]);
    }

    public function markRead(Request $request, string $notification): JsonResponse
    {
        return DB::transaction(function () use ($request, $notification) {
            $item = $this->inbox($request)->whereKey($notification)->lockForUpdate()->firstOrFail();
            if ($item->read_at === null) {
                $item->update(['read_at' => now()]);
                MemberInboxChanged::dispatch((int) $item->organization_id, (int) $item->recipient_member_id);
            }

            return response()->json(['data' => $item->fresh()]);
        });
    }

    public function markAllRead(Request $request): JsonResponse
    {
        return DB::transaction(function () use ($request) {
            $member = $request->attributes->get('organization_member');
            $updated = $this->inbox($request)->whereNull('read_at')->update(['read_at' => now()]);
            if ($updated > 0) {
                MemberInboxChanged::dispatch((int) $member->organization_id, (int) $member->id);
            }

            return response()->json(['marked_read' => $updated]);
        });
    }
}
