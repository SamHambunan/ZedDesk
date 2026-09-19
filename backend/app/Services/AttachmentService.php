<?php

namespace App\Services;

use App\Exceptions\InvalidAttachmentException;
use App\Models\Customer;
use App\Models\OrganizationMember;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AttachmentService
{
    /**
     * Maximum allowed attachment file size: 10MB (in bytes).
     */
    public const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes

    /**
     * Whitelist of permitted MIME types for ticket attachments.
     */
    public const ALLOWED_MIME_TYPES = [
        // Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        // Documents & spreadsheets
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Archives & data
        'application/zip',
        'application/x-zip-compressed',
        'application/json',
    ];

    protected string $disk;

    public function __construct(?string $disk = null)
    {
        $this->disk = $disk ?? config('filesystems.attachments_disk', 'private');
    }

    /**
     * Get the configured storage disk name.
     */
    public function getDisk(): string
    {
        return $this->disk;
    }

    /**
     * Validate the given uploaded file against size and MIME constraints.
     *
     * @throws InvalidAttachmentException
     */
    public function validateFile(UploadedFile $file): void
    {
        if ($file->getSize() > self::MAX_FILE_SIZE_BYTES) {
            throw new InvalidAttachmentException('File size exceeds the 10MB limit.');
        }

        $mime = $file->getMimeType();
        if (! in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            throw new InvalidAttachmentException("File MIME type '{$mime}' is not supported.");
        }
    }

    /**
     * Validate, store on private disk in tenant-partitioned path, and record attachment.
     *
     * Path pattern: tenants/{org_id}/tickets/{ticket_id}/attachments/{uuid}.{ext}
     *
     * @throws InvalidAttachmentException
     */
    public function store(UploadedFile $file, TicketMessage $message): TicketAttachment
    {
        $this->validateFile($file);

        $ticket = $message->relationLoaded('ticket')
            ? $message->ticket
            : Ticket::withoutGlobalScopes()->findOrFail($message->ticket_id);

        $attachmentId = (string) Str::uuid();
        $extension = $file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin';
        $filePath = "tenants/{$message->organization_id}/tickets/{$ticket->id}/attachments/{$attachmentId}.{$extension}";

        // Store file securely on private disk
        Storage::disk($this->disk)->put($filePath, $file->getContent());

        $attachment = new TicketAttachment;
        $attachment->id = $attachmentId;
        $attachment->organization_id = $message->organization_id;
        $attachment->ticket_message_id = $message->id;
        $attachment->file_name = $file->getClientOriginalName();
        $attachment->file_path = $filePath;
        $attachment->mime_type = $file->getMimeType() ?: 'application/octet-stream';
        $attachment->file_size = $file->getSize();
        $attachment->save();

        return $attachment;
    }

    /**
     * Stream an attachment file for download after verifying organization member authorization.
     *
     * @throws HttpException
     */
    public function download(TicketAttachment $attachment, ?User $user = null): StreamedResponse
    {
        if ($user) {
            $isMember = OrganizationMember::withoutGlobalScopes()
                ->where('organization_id', $attachment->organization_id)
                ->where('user_id', $user->id)
                ->exists();

            if (! $isMember) {
                abort(403, 'Forbidden. You are not an Organization Member of this Organization.');
            }
        } else {
            abort(403, 'Unauthorized access to attachment.');
        }

        if (! Storage::disk($this->disk)->exists($attachment->file_path)) {
            abort(404, 'Attachment file not found.');
        }

        return $this->streamFile($attachment);
    }

    /**
     * Stream an attachment file for download after verifying customer ownership and privacy boundaries.
     *
     * @throws HttpException
     */
    public function downloadForCustomer(TicketAttachment $attachment, Customer $customer, Ticket $ticket): StreamedResponse
    {
        // 1. Organization boundary check
        if ((int) $attachment->organization_id !== (int) $customer->organization_id
            || (int) $ticket->organization_id !== (int) $customer->organization_id) {
            abort(403, 'Forbidden. Attachment belongs to another organization.');
        }

        // 2. Ticket customer ownership check
        if ($ticket->customer_id !== $customer->id) {
            abort(403, 'Forbidden. You do not have permission to access this ticket.');
        }

        // 3. Attachment must belong to the specified ticket
        $message = $attachment->relationLoaded('message')
            ? $attachment->message
            : TicketMessage::find($attachment->ticket_message_id);

        if (! $message || $message->ticket_id !== $ticket->id) {
            abort(404, 'Attachment not found.');
        }

        // 4. Conversation privacy: customer cannot access attachments belonging to internal notes
        if ($message->isInternalNote() || ! $message->isPublicReply()) {
            abort(404, 'Attachment not found.');
        }

        // 5. File must exist on storage disk
        if (! Storage::disk($this->disk)->exists($attachment->file_path)) {
            abort(404, 'Attachment file not found.');
        }

        return $this->streamFile($attachment);
    }

    /**
     * Helper to create a streamed HTTP download response for an attachment.
     */
    protected function streamFile(TicketAttachment $attachment): StreamedResponse
    {
        return response()->streamDownload(function () use ($attachment) {
            $stream = Storage::disk($this->disk)->readStream($attachment->file_path);
            if ($stream) {
                fpassthru($stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }
        }, $attachment->file_name, [
            'Content-Type' => $attachment->mime_type,
            'Content-Length' => (string) $attachment->file_size,
            'Content-Disposition' => 'attachment; filename="'.$attachment->file_name.'"',
        ]);
    }
}
