<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Enums\TicketStatus;
use App\Events\MemberInboxChanged;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\OrganizationMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

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
        $isRecent = $request->query('mode') === 'recent'
            || $request->boolean('recent')
            || $request->query('filter') === 'recent';

        $isUnread = $request->query('filter') === 'unread'
            || $request->query('status') === 'unread'
            || $request->query('mode') === 'unread'
            || $request->boolean('unread');

        $query = $this->inbox($request)->with(['ticket.customer']);

        if ($isUnread) {
            $query->whereNull('read_at');
        }

        if ($isRecent) {
            $perPage = min(100, max(1, (int) $request->integer('per_page', 5)));
            $query->orderByDesc('latest_activity_at')
                ->orderByDesc('created_at')
                ->orderByDesc('id');
        } elseif ($isUnread) {
            $perPage = min(100, max(1, (int) $request->integer('per_page', 20)));
            $query->orderByDesc('latest_activity_at')
                ->orderByDesc('created_at')
                ->orderByDesc('id');
        } else {
            $perPage = min(100, max(1, (int) $request->integer('per_page', 20)));
            $query->orderByRaw('read_at IS NULL DESC')
                ->orderByDesc('latest_activity_at')
                ->orderByDesc('created_at')
                ->orderByDesc('id');
        }

        $paginator = $query->paginate($perPage);

        $actorMemberIds = $paginator->getCollection()
            ->map(fn ($n) => $n->latest_activity_metadata['actor_member_id'] ?? null)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $actorMembers = empty($actorMemberIds)
            ? collect()
            : OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', OrganizationContext::getCurrentId())
                ->whereIn('id', $actorMemberIds)
                ->with('user')
                ->get()
                ->keyBy('id');

        $paginator->through(fn ($item) => $this->formatNotificationRow($item, $actorMembers));

        return response()->json($paginator);
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

            $freshItem = $item->fresh();
            $freshItem->load(['ticket.customer']);

            return response()->json(['data' => $this->formatNotificationRow($freshItem)]);
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

    private function formatNotificationRow(Notification $notification, ?Collection $actorMembers = null): array
    {
        $ticket = $notification->ticket;
        $isAvailable = $ticket !== null
            && (int) $ticket->organization_id === (int) OrganizationContext::getCurrentId()
            && ! $ticket->trashed();

        if ($isAvailable && Gate::denies('view', $ticket)) {
            $isAvailable = false;
        }

        $actor = null;
        if ($isAvailable) {
            $actorMemberId = $notification->latest_activity_metadata['actor_member_id'] ?? null;
            if ($actorMemberId !== null) {
                $member = $actorMembers?->get($actorMemberId);
                if (! $member) {
                    $member = OrganizationMember::withoutGlobalScopes()
                        ->where('organization_id', OrganizationContext::getCurrentId())
                        ->with('user')
                        ->find($actorMemberId);
                }

                if ($member) {
                    $actor = [
                        'id' => (int) $member->id,
                        'name' => (string) ($member->user?->name ?? 'Staff'),
                        'email' => $member->user?->email,
                        'type' => 'member',
                    ];
                }
            } elseif ($ticket->customer !== null) {
                $actor = [
                    'id' => (int) $ticket->customer->id,
                    'name' => (string) $ticket->customer->name,
                    'email' => $ticket->customer->email,
                    'type' => 'customer',
                ];
            }
        }

        $time = $notification->latest_activity_at?->toISOString() ?? (string) $notification->latest_activity_at;

        return [
            'id' => (string) $notification->id,
            'organization_id' => (int) $notification->organization_id,
            'recipient_member_id' => (int) $notification->recipient_member_id,
            'ticket_id' => (string) $notification->ticket_id,
            'ticket_number' => $isAvailable ? (int) $ticket->ticket_number : null,
            'subject' => $isAvailable ? (string) $ticket->subject : null,
            'activity' => (string) $notification->activity_type,
            'activity_type' => (string) $notification->activity_type,
            'actor' => $actor,
            'actor_name' => $actor['name'] ?? null,
            'time' => $time,
            'latest_activity_metadata' => $notification->latest_activity_metadata ?? [],
            'latest_activity_at' => $time,
            'read_at' => $notification->read_at?->toISOString(),
            'created_at' => $notification->created_at?->toISOString() ?? (string) $notification->created_at,
            'updated_at' => $notification->updated_at?->toISOString() ?? (string) $notification->updated_at,
            'ticket' => $isAvailable ? [
                'id' => (string) $ticket->id,
                'ticket_number' => (int) $ticket->ticket_number,
                'subject' => (string) $ticket->subject,
                'status' => $ticket->status instanceof TicketStatus ? $ticket->status->value : (string) $ticket->status,
            ] : null,
            'is_available' => $isAvailable,
        ];
    }
}
