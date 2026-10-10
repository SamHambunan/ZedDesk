<?php

namespace App\Http\Controllers\Api;

use App\Enums\TicketPriority;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Services\TicketFieldEditor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rules\Enum;

class TicketPriorityController extends Controller
{
    /**
     * Update the priority of a ticket.
     */
    public function update(Request $request, string $ticketId, TicketFieldEditor $fieldEditor): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        Gate::authorize('update', $ticket);

        $validated = $request->validate([
            'priority' => ['required', new Enum(TicketPriority::class)],
            'expected_priority_revision' => ['sometimes', 'required', 'integer', 'min:1'],
        ]);

        try {
            $conflict = $fieldEditor->updatePriority($ticket, $validated['priority'],
                isset($validated['expected_priority_revision']) ? (int) $validated['expected_priority_revision'] : null);
        } catch (InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($conflict !== null) {
            return response()->json([
                'message' => 'Ticket priority has changed since it was read.',
                'current' => $conflict,
            ], 409);
        }

        return response()->json([
            'data' => $ticket->fresh(),
        ]);
    }
}
