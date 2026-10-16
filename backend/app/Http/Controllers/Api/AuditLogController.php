<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->attributes->get('role') === Role::ADMIN, 403);

        $filters = $request->validate([
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
            'action' => ['sometimes', 'string', 'max:100'],
            'actor_id' => ['sometimes', 'string', 'max:64'],
            'target_type' => ['sometimes', 'string', 'max:64'],
            'target_id' => ['sometimes', 'string', 'max:64'],
            'outcome' => ['sometimes', Rule::in(['success', 'failure', 'denied'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'cursor' => ['sometimes', 'string'],
        ]);

        $query = AuditLog::query()
            ->where('organization_id', OrganizationContext::getCurrentId())
            ->when(isset($filters['from']), fn ($query) => $query->whereDate('occurred_at', '>=', $filters['from']))
            ->when(isset($filters['to']), fn ($query) => $query->whereDate('occurred_at', '<=', $filters['to']));

        foreach (['action', 'actor_id', 'target_type', 'target_id', 'outcome'] as $filter) {
            if (isset($filters[$filter])) {
                $query->where($filter, $filters[$filter]);
            }
        }

        $page = $query->orderByDesc('occurred_at')->orderByDesc('id')
            ->cursorPaginate($filters['per_page'] ?? 25);

        return response()->json([
            'data' => $page->items(),
            'next_cursor' => $page->nextCursor()?->encode(),
        ]);
    }
}
