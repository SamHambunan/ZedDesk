<?php

namespace App\Http\Controllers\Api;

use App\Context\OrganizationContext;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\Tag;
use App\Models\Ticket;
use App\Services\AuditLogWriter;
use App\Services\TagCatalogCache;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TagController extends Controller
{
    public function __construct(
        private readonly TagCatalogCache $catalogCache,
    ) {}

    /**
     * List all tags for the current organization.
     */
    public function index(): JsonResponse
    {
        $orgId = OrganizationContext::getCurrentId();
        $tags = $orgId ? $this->catalogCache->get($orgId) : [];

        return response()->json([
            'data' => $tags,
        ]);
    }

    /**
     * Create a new tag within the current organization.
     */
    public function store(Request $request): JsonResponse
    {
        $orgId = OrganizationContext::getCurrentId();

        $name = $request->input('name');
        $computedSlug = $request->input('slug') ?: ($name ? Str::slug($name) : null);

        $request->merge(['slug' => $computedSlug]);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                Rule::unique('tags', 'slug')->where('organization_id', $orgId),
            ],
        ]);

        $tag = DB::transaction(function () use ($orgId, $validated, $request) {
            $created = Tag::create([
                'organization_id' => $orgId,
                'name' => $validated['name'],
                'slug' => $validated['slug'],
            ]);

            app(AuditLogWriter::class)->recordTagCreated($created, $request->user());

            return $created;
        });

        return response()->json([
            'data' => $tag,
        ], 201);
    }

    /**
     * List tags attached to a specific ticket.
     */
    public function ticketTags(string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        return response()->json([
            'data' => $ticket->tags,
        ]);
    }

    /**
     * Attach a tag to a ticket.
     */
    public function attachToTicket(Request $request, string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $orgId = OrganizationContext::getCurrentId();

        $validated = $request->validate([
            'tag_id' => [
                'required',
                'string',
                Rule::exists('tags', 'id')->where('organization_id', $orgId),
            ],
        ]);

        try {
            DB::transaction(function () use ($ticket, $validated, $request) {
                $alreadyAttached = $ticket->tags()->where('tags.id', $validated['tag_id'])->exists();
                $ticket->attachTag($validated['tag_id']);
                if (! $alreadyAttached) {
                    app(AuditLogWriter::class)->recordTagAttached($ticket, $request->user(), $validated['tag_id']);
                }
            });
        } catch (DomainException|InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $ticket->fresh(['tags']),
        ]);
    }

    /**
     * Detach a tag from a ticket.
     */
    public function detachFromTicket(Request $request, string $ticketId, string $tagId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        try {
            DB::transaction(function () use ($ticket, $tagId, $request) {
                $wasAttached = $ticket->tags()->where('tags.id', $tagId)->exists();
                $ticket->detachTag($tagId);
                if ($wasAttached) {
                    app(AuditLogWriter::class)->recordTagDetached($ticket, $request->user(), $tagId);
                }
            });
        } catch (DomainException|InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Tag detached successfully.',
        ]);
    }
}
