<?php

namespace App\Http\Controllers\Api;

use App\Actions\Customer\FindOrCreateCustomer;
use App\Context\OrganizationContext;
use App\Enums\TicketMessageType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Exceptions\InvalidAttachmentException;
use App\Exceptions\InvalidTicketTransitionException;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Repositories\CustomerRepository;
use App\Services\AttachmentService;
use App\Services\CustomerTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerPortalController extends Controller
{
    public function __construct(
        protected CustomerTokenService $tokenService = new CustomerTokenService,
        protected AttachmentService $attachmentService = new AttachmentService,
        protected FindOrCreateCustomer $findOrCreateCustomer = new FindOrCreateCustomer,
        protected CustomerRepository $customerRepository = new CustomerRepository
    ) {}

    /**
     * Public customer ticket intake endpoint.
     */
    public function store(Request $request): JsonResponse
    {
        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        if (! $organization) {
            return response()->json(['message' => 'Organization not found.'], 404);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'attachments' => ['nullable'],
            'attachments.*' => ['file', 'max:10240'],
        ]);

        // Normalize and pre-validate any attachments before creating resources
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
                try {
                    $this->attachmentService->validateFile($file);
                } catch (InvalidAttachmentException $e) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'errors' => ['attachments' => [$e->getMessage()]],
                    ], 422);
                }
            }
        }

        return DB::transaction(function () use ($organization, $validated, $files, $request) {
            // Find or create customer
            $customer = $this->findOrCreateCustomer->execute([
                'name' => $validated['name'],
                'email' => $validated['email'],
            ], $organization);

            // Create sequential ticket
            $ticket = Ticket::create([
                'organization_id' => $organization->id,
                'customer_id' => $customer->id,
                'subject' => $validated['subject'],
                'status' => TicketStatus::NEW,
                'priority' => TicketPriority::MEDIUM,
            ]);

            // Create initial customer Public Reply
            $message = TicketMessage::create([
                'organization_id' => $organization->id,
                'ticket_id' => $ticket->id,
                'message_type' => TicketMessageType::PUBLIC_REPLY,
                'author_type' => Customer::class,
                'author_id' => $customer->id,
                'body' => $validated['message'],
            ]);

            // Store any uploaded attachments linked to the initial message
            $storedAttachments = [];
            foreach ($files as $file) {
                if ($file instanceof UploadedFile) {
                    $storedAttachments[] = $this->attachmentService->store($file, $message);
                }
            }

            // Generate cryptographically signed HMAC token for customer access
            $token = $this->tokenService->generateToken($customer, $ticket);
            $accessUrl = $this->tokenService->generateTicketUrl($ticket, $token, $request);

            return response()->json([
                'message' => 'Ticket created successfully.',
                'token' => $token,
                'access_url' => $accessUrl,
                'ticket' => [
                    'id' => $ticket->id,
                    'ticket_number' => $ticket->ticket_number,
                    'subject' => $ticket->subject,
                    'status' => $ticket->status instanceof TicketStatus ? $ticket->status->value : $ticket->status,
                    'priority' => $ticket->priority instanceof TicketPriority ? $ticket->priority->value : $ticket->priority,
                    'created_at' => $ticket->created_at?->toISOString(),
                ],
                'customer' => [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'email' => $customer->email,
                ],
                'initial_message' => [
                    'id' => $message->id,
                    'body' => $message->body,
                    'created_at' => $message->created_at?->toISOString(),
                ],
                'attachments' => $storedAttachments,
            ], 201);
        });
    }

    /**
     * Request a customer portal magic link for an existing customer.
     */
    public function magicLink(Request $request): JsonResponse
    {
        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        if (! $organization) {
            return response()->json(['message' => 'Organization not found.'], 404);
        }

        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        $customer = $this->customerRepository->findByEmail($validated['email'], $organization);

        if (! $customer) {
            return response()->json([
                'message' => 'Customer not found.',
            ], 404);
        }

        $token = $this->tokenService->generateToken($customer);
        $magicLink = $this->tokenService->generateMagicLink($customer, $token, $request);

        return response()->json([
            'message' => 'Magic link generated successfully.',
            'token' => $token,
            'magic_link' => $magicLink,
            'url' => $magicLink,
        ], 200);
    }

    /**
     * Show customer ticket details and customer-visible conversation messages.
     */
    public function show(Request $request, string $ticketId): JsonResponse
    {
        /** @var Ticket $ticket */
        $ticket = $request->attributes->get('ticket')
            ?? Ticket::withoutGlobalScopes()->findOrFail($ticketId);

        $ticket->load(['customer', 'customerVisibleMessages.attachments']);

        return response()->json([
            'ticket' => [
                'id' => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject' => $ticket->subject,
                'status' => $ticket->status instanceof TicketStatus ? $ticket->status->value : $ticket->status,
                'priority' => $ticket->priority instanceof TicketPriority ? $ticket->priority->value : $ticket->priority,
                'created_at' => $ticket->created_at?->toISOString(),
            ],
            'customer' => [
                'id' => $ticket->customer->id,
                'name' => $ticket->customer->name,
                'email' => $ticket->customer->email,
            ],
            'messages' => $ticket->customerVisibleMessages,
        ], 200);
    }

    /**
     * Post a customer public reply to an existing ticket.
     */
    public function reply(Request $request, string $ticket): JsonResponse
    {
        $organization = OrganizationContext::getCurrent() ?? $request->attributes->get('organization');

        if (! $organization) {
            return response()->json(['message' => 'Organization not found.'], 404);
        }

        /** @var Ticket $ticketModel */
        $ticketModel = $request->attributes->get('ticket')
            ?? Ticket::withoutGlobalScopes()->findOrFail($ticket);

        /** @var Customer $customer */
        $customer = $request->attributes->get('customer')
            ?? Customer::withoutGlobalScopes()->findOrFail($ticketModel->customer_id);

        if ($ticketModel->isClosed()) {
            return response()->json([
                'message' => "Ticket #{$ticketModel->ticket_number} is closed and immutable. New conversation replies are rejected.",
            ], 422);
        }

        $validated = $request->validate([
            'message' => ['required_without:body', 'nullable', 'string'],
            'body' => ['required_without:message', 'nullable', 'string'],
            'attachments' => ['nullable'],
            'attachments.*' => ['file', 'max:10240'],
        ]);

        $body = $validated['message'] ?? $validated['body'] ?? null;
        if (empty($body)) {
            return response()->json([
                'message' => 'The message body is required.',
                'errors' => ['body' => ['The message body is required.']],
            ], 422);
        }

        // Normalize and pre-validate any attachments before creating resources
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
                try {
                    $this->attachmentService->validateFile($file);
                } catch (InvalidAttachmentException $e) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'errors' => ['attachments' => [$e->getMessage()]],
                    ], 422);
                }
            }
        }

        try {
            return DB::transaction(function () use ($organization, $ticketModel, $customer, $body, $files) {
                $message = TicketMessage::create([
                    'organization_id' => $organization->id,
                    'ticket_id' => $ticketModel->id,
                    'message_type' => TicketMessageType::PUBLIC_REPLY,
                    'author_type' => Customer::class,
                    'author_id' => $customer->id,
                    'body' => $body,
                ]);

                $storedAttachments = [];
                foreach ($files as $file) {
                    if ($file instanceof UploadedFile) {
                        $storedAttachments[] = $this->attachmentService->store($file, $message);
                    }
                }

                $ticketModel->refresh();

                return response()->json([
                    'message' => 'Reply submitted successfully.',
                    'reply' => [
                        'id' => $message->id,
                        'ticket_id' => $ticketModel->id,
                        'body' => $message->body,
                        'message_type' => $message->message_type instanceof TicketMessageType ? $message->message_type->value : $message->message_type,
                        'created_at' => $message->created_at?->toISOString(),
                        'attachments' => $storedAttachments,
                    ],
                    'ticket' => [
                        'id' => $ticketModel->id,
                        'ticket_number' => $ticketModel->ticket_number,
                        'status' => $ticketModel->status instanceof TicketStatus ? $ticketModel->status->value : $ticketModel->status,
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
     * Secure streaming download of a ticket attachment for customers.
     */
    public function downloadAttachment(Request $request, string $ticket, string $attachment): StreamedResponse
    {
        /** @var Ticket $ticketModel */
        $ticketModel = $request->attributes->get('ticket')
            ?? Ticket::withoutGlobalScopes()->findOrFail($ticket);

        /** @var Customer $customer */
        $customer = $request->attributes->get('customer')
            ?? Customer::withoutGlobalScopes()->findOrFail($ticketModel->customer_id);

        /** @var TicketAttachment|null $attachmentModel */
        $attachmentModel = TicketAttachment::withoutGlobalScopes()
            ->where('id', $attachment)
            ->first();

        if (! $attachmentModel) {
            abort(404, 'Attachment not found.');
        }

        return $this->attachmentService->downloadForCustomer($attachmentModel, $customer, $ticketModel);
    }

    /**
     * Verify customer signed token authentication.
     */
    public function verify(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->attributes->get('customer');

        return response()->json([
            'valid' => true,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'email' => $customer->email,
            ],
        ], 200);
    }
}
