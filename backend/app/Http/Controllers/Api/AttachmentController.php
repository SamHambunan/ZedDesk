<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InvalidAttachmentException;
use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Services\AttachmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    /**
     * Secure streaming download of a ticket attachment with organization authorization checks.
     */
    public function download(Request $request, string $id, AttachmentService $service): StreamedResponse
    {
        $attachment = TicketAttachment::findOrFail($id);

        return $service->download($attachment, $request->user());
    }

    /**
     * Upload an attachment to a ticket message.
     */
    public function upload(Request $request, string $ticketId, string $messageId, AttachmentService $service): JsonResponse
    {
        $ticket = Ticket::findOrFail($ticketId);
        $message = TicketMessage::where('ticket_id', $ticket->id)->findOrFail($messageId);

        $request->validate([
            'file' => ['required', 'file'],
        ]);

        try {
            $attachment = $service->store($request->file('file'), $message);
        } catch (InvalidAttachmentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => ['file' => [$e->getMessage()]],
            ], 422);
        }

        return response()->json([
            'data' => $attachment,
        ], 201);
    }
}
