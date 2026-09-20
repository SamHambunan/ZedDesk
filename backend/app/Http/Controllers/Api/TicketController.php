<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Events\TicketMessageCreated;
use App\Exceptions\InvalidAssignmentException;
use App\Exceptions\InvalidAttachmentException;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Services\AttachmentService;
use App\Services\TicketAssignmentService;
use App\Services\TicketStateMachine;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class TicketController extends Controller
{
    /**
     * Display a paginated listing of tickets with compound filtering.
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Ticket::class);

        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');
        $currentMember = $this->resolveCurrentMember($request, $organization?->id);

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
        $unassignedFilter = $request->boolean('unassigned');

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
            $teamIds = $this->extractArrayParameter($request->input('team_id'));
            $numericTeamIds = array_values(array_filter($teamIds, fn ($id) => is_numeric($id)));
            if (! empty($numericTeamIds)) {
                $query->whereIn('assigned_team_id', $numericTeamIds);
            } else {
                $query->whereRaw('1 = 0');
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
        ]);
    }

    /**
     * Normalize comma-separated strings or arrays into a clean array of strings.
     *
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
        $sortDirection = strtolower($request->input('direction', 'desc'));

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
            $urgent = TicketPriority::URGENT->value;
            $high = TicketPriority::HIGH->value;
            $medium = TicketPriority::MEDIUM->value;
            $low = TicketPriority::LOW->value;

            $query->orderByRaw("
                CASE priority
                    WHEN '{$urgent}' THEN 4
                    WHEN '{$high}' THEN 3
                    WHEN '{$medium}' THEN 2
                    WHEN '{$low}' THEN 1
                    ELSE 0
                END {$sortDirection}
            ")->orderBy('tickets.id', 'desc');
        } else {
            $query->orderBy("tickets.{$sortField}", $sortDirection)
                ->orderBy('tickets.id', 'desc');
        }
    }

    /**
     * Display the specified ticket with hydrated details, customer profile, tags,
     * conversation timeline, attachments, and assignment audit log.
     */
    public function show(Request $request, string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('view', $ticket);

        $ticket->load([
            'customer',
            'assignedTeam',
            'assignedMember.user',
            'tags',
            'messages.attachments',
            'assignments.team',
            'assignments.member.user',
            'assignments.assignedBy.user',
            'attachments',
        ]);

        $ticket->loadMorph('messages.author', [
            OrganizationMember::class => ['user'],
        ]);

        $ticketData = [
            'id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
            'status' => $ticket->status instanceof TicketStatus ? $ticket->status->value : $ticket->status,
            'priority' => $ticket->priority instanceof TicketPriority ? $ticket->priority->value : $ticket->priority,
            'assigned_team_id' => $ticket->assigned_team_id,
            'assigned_member_id' => $ticket->assigned_member_id,
            'first_replied_at' => $ticket->first_replied_at?->toISOString(),
            'resolved_at' => $ticket->resolved_at?->toISOString(),
            'closed_at' => $ticket->closed_at?->toISOString(),
            'created_at' => $ticket->created_at?->toISOString(),
            'updated_at' => $ticket->updated_at?->toISOString(),
            'customer' => $ticket->customer,
            'assigned_team' => $ticket->assignedTeam,
            'assigned_member' => $ticket->assignedMember,
            'tags' => $ticket->tags,
            'messages' => $ticket->messages,
            'attachments' => $ticket->attachments,
            'ticket_assignments' => $ticket->assignments,
            'assignments' => $ticket->assignments,
        ];

        return response()->json([
            'data' => $ticketData,
            'ticket' => [
                'id' => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject' => $ticket->subject,
                'status' => $ticket->status instanceof TicketStatus ? $ticket->status->value : $ticket->status,
                'priority' => $ticket->priority instanceof TicketPriority ? $ticket->priority->value : $ticket->priority,
                'assigned_team_id' => $ticket->assigned_team_id,
                'assigned_member_id' => $ticket->assigned_member_id,
                'first_replied_at' => $ticket->first_replied_at?->toISOString(),
                'resolved_at' => $ticket->resolved_at?->toISOString(),
                'closed_at' => $ticket->closed_at?->toISOString(),
                'created_at' => $ticket->created_at?->toISOString(),
                'updated_at' => $ticket->updated_at?->toISOString(),
            ],
            'customer' => $ticket->customer,
            'messages' => $ticket->messages,
            'ticket_assignments' => $ticket->assignments,
            'assignments' => $ticket->assignments,
            'tags' => $ticket->tags,
            'attachments' => $ticket->attachments,
        ]);
    }

    /**
     * Create a new Ticket Message (Public Reply or Internal Note) in the conversation thread.
     */
    public function storeMessage(Request $request, string $ticketId, AttachmentService $attachmentService): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('create', [TicketMessage::class, $ticket]);

        if ($ticket->isClosed()) {
            return response()->json([
                'message' => "Ticket #{$ticket->ticket_number} is closed and immutable. New conversation replies are rejected.",
            ], 422);
        }

        $validated = $request->validate([
            'message_type' => ['required', new Enum(TicketMessageType::class)],
            'body' => ['required', 'string'],
            'status' => ['nullable', new Enum(TicketStatus::class)],
            'target_status' => ['nullable', new Enum(TicketStatus::class)],
            'attachments' => ['nullable'],
            'attachments.*' => ['file', 'max:10240'],
        ]);

        $body = $validated['body'];
        $messageType = $validated['message_type'];

        // Pre-validate any attachments
        try {
            $files = $this->extractAndValidateAttachments($request, $attachmentService);
        } catch (InvalidAttachmentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => ['attachments' => [$e->getMessage()]],
            ], 422);
        }

        $currentMember = $this->resolveCurrentMember($request, $ticket->organization_id);

        if (! $currentMember) {
            return response()->json(['message' => 'Forbidden. You are not an Organization Member of this Organization.'], 403);
        }

        // Internal notes never accept or persist target status transitions
        $rawStatusOverride = $request->input('target_status') ?? $request->input('status');
        $statusOverride = ($messageType === TicketMessageType::INTERNAL_NOTE->value) ? null : $rawStatusOverride;

        try {
            return DB::transaction(function () use ($ticket, $currentMember, $messageType, $body, $statusOverride, $files, $attachmentService) {
                $messageData = [
                    'organization_id' => $ticket->organization_id,
                    'ticket_id' => $ticket->id,
                    'message_type' => $messageType,
                    'author_type' => OrganizationMember::class,
                    'author_id' => $currentMember->id,
                    'body' => $body,
                ];

                if (! empty($statusOverride)) {
                    $messageData['target_status'] = $statusOverride;
                }

                $message = TicketMessage::create($messageData);

                $storedAttachments = [];
                foreach ($files as $file) {
                    if ($file instanceof UploadedFile) {
                        $storedAttachments[] = $attachmentService->store($file, $message);
                    }
                }

                $freshTicket = $ticket->fresh();

                TicketMessageCreated::dispatch($message, $freshTicket);

                return response()->json([
                    'message' => 'Ticket message created successfully.',
                    'data' => [
                        'id' => $message->id,
                        'ticket_id' => $ticket->id,
                        'message_type' => $message->message_type instanceof TicketMessageType ? $message->message_type->value : $message->message_type,
                        'body' => $message->body,
                        'author' => $currentMember->load('user'),
                        'created_at' => $message->created_at?->toISOString(),
                        'attachments' => $storedAttachments,
                    ],
                    'message_record' => $message->load(['attachments', 'author.user']),
                    'ticket' => [
                        'id' => $freshTicket->id,
                        'ticket_number' => $freshTicket->ticket_number,
                        'status' => $freshTicket->status instanceof TicketStatus ? $freshTicket->status->value : $freshTicket->status,
                    ],
                ], 201);
            });
        } catch (InvalidTicketTransitionException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Extract and pre-validate uploaded files from request attachments.
     *
     * @return array<UploadedFile>
     *
     * @throws InvalidAttachmentException
     */
    protected function extractAndValidateAttachments(Request $request, AttachmentService $attachmentService): array
    {
        $rawAttachments = $request->file('attachments');
        /** @var array<UploadedFile> $files */
        $files = [];
        if ($rawAttachments instanceof UploadedFile) {
            $files = [$rawAttachments];
        } elseif (is_array($rawAttachments)) {
            $files = $rawAttachments;
        }

        foreach ($files as $file) {
            if ($file instanceof UploadedFile) {
                $attachmentService->validateFile($file);
            }
        }

        return $files;
    }

    /**
     * Assign the ticket to a team, organization member, or both.
     */
    public function assign(Request $request, string $ticketId, TicketAssignmentService $assignmentService): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $orgId = OrganizationContext::getCurrentId() ?? $ticket->organization_id;

        $validated = $request->validate([
            'team_id' => [
                'nullable',
                'integer',
                Rule::exists('teams', 'id')->where('organization_id', $orgId),
            ],
            'member_id' => [
                'nullable',
                'integer',
                Rule::exists('organization_members', 'id')->where('organization_id', $orgId),
            ],
        ]);

        $teamId = $request->has('team_id') ? $validated['team_id'] : $ticket->assigned_team_id;
        $memberId = $request->has('member_id') ? $validated['member_id'] : $ticket->assigned_member_id;

        $currentMember = $this->resolveCurrentMember($request, $ticket->organization_id);

        try {
            $assignment = $assignmentService->assign(
                ticket: $ticket,
                team: $teamId,
                member: $memberId,
                assignedBy: $currentMember
            );
        } catch (InvalidAssignmentException|InvalidTicketTransitionException|DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Ticket assigned successfully.',
            'data' => $ticket->fresh(['assignedTeam', 'assignedMember.user', 'assignments']),
            'assignment' => $assignment,
        ]);
    }

    /**
     * Claim an unassigned ticket for the authenticated organization member.
     */
    public function claim(Request $request, string $ticketId, TicketAssignmentService $assignmentService): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $currentMember = $this->resolveCurrentMember($request, $ticket->organization_id);

        if (! $currentMember) {
            return response()->json(['message' => 'Forbidden. You are not an Organization Member of this Organization.'], 403);
        }

        try {
            $assignment = $assignmentService->claim(
                ticket: $ticket,
                member: $currentMember
            );
        } catch (InvalidAssignmentException|InvalidTicketTransitionException|DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Ticket claimed successfully.',
            'data' => $ticket->fresh(['assignedTeam', 'assignedMember.user', 'assignments']),
            'assignment' => $assignment,
        ]);
    }

    /**
     * Update the status of a ticket using the lifecycle state machine.
     */
    public function updateStatus(Request $request, string $ticketId, TicketStateMachine $stateMachine): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $validated = $request->validate([
            'status' => ['required', new Enum(TicketStatus::class)],
        ]);

        try {
            $stateMachine->transitionTo($ticket, $validated['status']);
        } catch (InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Ticket status updated successfully.',
            'data' => $ticket->fresh(),
        ]);
    }

    /**
     * Soft-delete a ticket (restricted to Admins).
     */
    public function destroy(string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('delete', $ticket);

        $ticket->delete();

        return response()->json([
            'message' => 'Ticket deleted successfully.',
        ]);
    }

    /**
     * Restore a soft-deleted ticket (restricted to Admins).
     */
    public function restore(string $ticketId): JsonResponse
    {
        $ticket = Ticket::withTrashed()->findOrFail($ticketId);

        Gate::authorize('restore', $ticket);

        $ticket->restore();

        return response()->json([
            'message' => 'Ticket restored successfully.',
            'data' => $ticket->fresh(),
        ]);
    }

    /**
     * Resolve the active organization member from request context or database fallback.
     */
    protected function resolveCurrentMember(Request $request, ?string $organizationId = null): ?OrganizationMember
    {
        $currentMember = $request->attributes->get('organization_member');
        if ($currentMember instanceof OrganizationMember) {
            return $currentMember;
        }

        $orgId = $organizationId ?? OrganizationContext::getCurrentId() ?? $request->attributes->get('organization')?->id;
        if (! $orgId || ! $request->user()) {
            return null;
        }

        return OrganizationMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('user_id', $request->user()->id)
            ->first();
    }
}
