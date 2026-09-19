<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

class TicketController extends Controller
{
    /**
     * Display a paginated listing of tickets with compound filtering.
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Ticket::class);

        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        /** @var OrganizationMember|null $currentMember */
        $currentMember = $request->attributes->get('organization_member');
        if (! $currentMember && $organization && $request->user()) {
            $currentMember = OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', $organization->id)
                ->where('user_id', $request->user()->id)
                ->first();
        }

        $query = Ticket::query()
            ->with(['customer', 'assignedTeam', 'assignedMember.user', 'tags']);

        // 1. Status filter
        if ($request->filled('status')) {
            $statuses = $this->extractArrayParameter($request->input('status'));
            $query->whereIn('status', $statuses);
        }

        // 2. Priority filter
        if ($request->filled('priority')) {
            $priorities = $this->extractArrayParameter($request->input('priority'));
            $query->whereIn('priority', $priorities);
        }

        // 3. Dedicated queue filter shortcut: unassigned=true
        $unassignedFilter = $request->boolean('unassigned')
            || $request->input('unassigned') === 'true'
            || $request->input('unassigned') === '1';

        // 4. Assigned to filter & shortcut
        if ($request->filled('assigned_to')) {
            $assignedTo = $request->input('assigned_to');

            if ($assignedTo === 'me') {
                $query->where('assigned_member_id', $currentMember?->id);
            } elseif ($assignedTo === 'unassigned') {
                $query->whereNull('assigned_member_id');
            } else {
                $rawMembers = $this->extractArrayParameter($assignedTo);
                $memberIds = [];
                foreach ($rawMembers as $item) {
                    if (is_numeric($item)) {
                        $memberIds[] = (int) $item;
                    } elseif ($organization) {
                        $foundId = OrganizationMember::withoutGlobalScopes()
                            ->where('organization_id', $organization->id)
                            ->where('user_id', $item)
                            ->value('id');
                        if ($foundId) {
                            $memberIds[] = $foundId;
                        }
                    }
                }

                if (! empty($memberIds)) {
                    $query->whereIn('assigned_member_id', $memberIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            }
        } elseif ($unassignedFilter) {
            $query->whereNull('assigned_member_id');
        }

        // 5. Team filter
        if ($request->filled('team_id')) {
            $teamId = $request->input('team_id');
            if ($teamId === 'unassigned' || $teamId === 'none') {
                $query->whereNull('assigned_team_id');
            } else {
                $teamIds = $this->extractArrayParameter($teamId);
                $numericTeamIds = array_values(array_filter($teamIds, fn ($id) => is_numeric($id)));
                if (! empty($numericTeamIds)) {
                    $query->whereIn('assigned_team_id', $numericTeamIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            }
        }

        // 6. Customer filter
        if ($request->filled('customer_id')) {
            $customerIds = $this->extractArrayParameter($request->input('customer_id'));
            $validCustomerUuids = array_values(array_filter($customerIds, fn ($id) => Str::isUuid($id)));
            if (! empty($validCustomerUuids)) {
                $query->whereIn('customer_id', $validCustomerUuids);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        // 7. Tag filter (matches tag name, slug, or UUID ID)
        if ($request->filled('tag')) {
            $tags = $this->extractArrayParameter($request->input('tag'));
            $uuidTags = array_values(array_filter($tags, fn ($t) => Str::isUuid($t)));
            $stringTags = array_values(array_filter($tags, fn ($t) => ! Str::isUuid($t)));

            $query->whereHas('tags', function ($tagQuery) use ($uuidTags, $stringTags) {
                $tagQuery->where(function ($sub) use ($uuidTags, $stringTags) {
                    $hasCondition = false;
                    if (! empty($uuidTags)) {
                        $sub->whereIn('tags.id', $uuidTags);
                        $hasCondition = true;
                    }
                    if (! empty($stringTags)) {
                        $method = $hasCondition ? 'orWhereIn' : 'whereIn';
                        $sub->$method('tags.slug', $stringTags)
                            ->orWhereIn('tags.name', $stringTags);
                    }
                });
            });
        }

        // 8. Sorting
        $this->applySorting($query, $request);

        // 9. Pagination
        $perPage = max(1, min((int) $request->input('per_page', 15), 100));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'from' => $paginator->firstItem(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'to' => $paginator->lastItem(),
                'total' => $paginator->total(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
            'current_page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * Normalize comma-separated strings or arrays into a clean array of strings.
     *
     * @param  mixed  $value
     * @return array<string>
     */
    protected function extractArrayParameter(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter($value, fn ($item) => ! is_null($item) && $item !== ''));
        }

        $parts = explode(',', (string) $value);

        return array_values(array_filter(array_map('trim', $parts), fn ($item) => $item !== ''));
    }

    /**
     * Apply sorting to the query with support for priority enum ordering and compound fallback.
     */
    protected function applySorting($query, Request $request): void
    {
        $sortParam = $request->input('sort', 'created_at');
        $sortDirection = strtolower($request->input('direction', $request->input('order', 'desc')));

        $sortField = 'created_at';

        if (is_string($sortParam)) {
            if (str_starts_with($sortParam, '-')) {
                $sortField = substr($sortParam, 1);
                $sortDirection = 'desc';
            } elseif (str_contains($sortParam, ':')) {
                [$field, $dir] = explode(':', $sortParam, 2);
                $sortField = $field;
                $sortDirection = strtolower($dir) === 'asc' ? 'asc' : 'desc';
            } else {
                $sortField = $sortParam;
            }
        }

        $sortDirection = in_array($sortDirection, ['asc', 'desc'], true) ? $sortDirection : 'desc';

        $allowedColumns = [
            'created_at',
            'updated_at',
            'ticket_number',
            'priority',
            'status',
            'subject',
        ];

        if (! in_array($sortField, $allowedColumns, true)) {
            $sortField = 'created_at';
        }

        if ($sortField === 'priority') {
            $query->orderByRaw("
                CASE priority
                    WHEN 'urgent' THEN 4
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 1
                    ELSE 0
                END {$sortDirection}
            ")->orderBy('tickets.id', 'desc');
        } else {
            $query->orderBy("tickets.{$sortField}", $sortDirection)
                ->orderBy('tickets.id', 'desc');
        }
    }
}
