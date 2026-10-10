<?php

namespace App\Http\Controllers\Api;

use App\Enums\TicketPriority;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rules\Enum;

class TicketPriorityController extends Controller
{
    /**
     * Update the priority of a ticket.
     */
    public function update(Request $request, string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $validated = $request->validate([
            'priority' => ['required', new Enum(TicketPriority::class)],
            'expected_priority' => ['sometimes', 'required', new Enum(TicketPriority::class)],
        ]);

        try {
            $conflict = DB::transaction(function () use ($ticket, $validated) {
                $current = Ticket::whereKey($ticket->id)->lockForUpdate()->firstOrFail();
                $currentPriority = $current->priority instanceof TicketPriority
                    ? $current->priority->value : (string) $current->priority;

                if (isset($validated['expected_priority']) && $validated['expected_priority'] !== $currentPriority) {
                    return response()->json([
                        'message' => 'Ticket priority has changed since it was read.',
                        'current' => ['priority' => $currentPriority, 'revision' => $current->revision],
                    ], 409);
                }

                $current->updatePriority($validated['priority']);

                return null;
            });
        } catch (InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($conflict !== null) {
            return $conflict;
        }

        return response()->json([
            'data' => $ticket->fresh(),
        ]);
    }
}
