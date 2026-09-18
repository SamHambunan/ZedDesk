<?php

namespace App\Http\Controllers\Api;

use App\Enums\TicketPriority;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Enum;

class TicketPriorityController extends Controller
{
    /**
     * Update the priority of a ticket.
     */
    public function update(Request $request, string $ticketId): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);

        $validated = $request->validate([
            'priority' => ['required', new Enum(TicketPriority::class)],
        ]);

        try {
            $ticket->updatePriority($validated['priority']);
        } catch (InvalidTicketTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $ticket->fresh(),
        ]);
    }
}
