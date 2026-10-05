import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { use } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  TicketTimeline,
  PublicReplyItem,
  InternalNoteItem,
} from './TicketTimeline'
import {
  TicketComposer,
  Composer,
  PublicReplyComposer,
  InternalNoteComposer,
  useComposer,
  type ComposerSubmitPayload,
} from './TicketComposer'
import { TicketCockpit } from './TicketCockpit'
import type { TicketMessage, TicketItem } from './types'
import { INITIAL_MOCK_TICKETS, MOCK_TEAMS, MOCK_MEMBERS, MOCK_TAGS_POOL } from './mockData'

const MOCK_MESSAGES: TicketMessage[] = [
  {
    id: 'msg-1',
    ticket_id: 'ticket-1',
    message_type: 'public_reply',
    author_type: 'Customer',
    author_name: 'Alice Johnson',
    body: 'We are experiencing intermittent SSO failures across regional hubs.',
    attachments: [
      {
        id: 'att-1',
        file_name: 'sso-error-trace.log',
        file_size_bytes: 45200,
        mime_type: 'text/plain',
      },
    ],
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'msg-2',
    ticket_id: 'ticket-1',
    message_type: 'internal_note',
    author_type: 'OrganizationMember',
    author_name: 'Devon Vance',
    author_role: 'Senior SRE',
    body: 'Investigated Okta SAML cert rollover; looks like cert cache expiration mismatch.',
    attachments: [
      {
        id: 'att-2',
        file_name: 'cert-diagnostics.json',
        file_size_bytes: 12400,
        mime_type: 'application/json',
      },
    ],
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'msg-3',
    ticket_id: 'ticket-1',
    message_type: 'public_reply',
    author_type: 'OrganizationMember',
    author_name: 'Sara Chen',
    author_role: 'Lead Support',
    body: 'We have applied an updated SAML metadata bundle to remediate the authentication handshake.',
    attachments: [],
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
]

describe('Ticket Detail Timeline & Explicit Items (Issue #104)', () => {
  it('renders PublicReplyItem with graphite styling and author information', () => {
    render(<PublicReplyItem message={MOCK_MESSAGES[0]} />)

    const item = screen.getByTestId('timeline-message-msg-1')
    expect(item).toBeInTheDocument()
    // Graphite tone background & border
    expect(item.className).toContain('bg-[#121316]')
    expect(item.className).toContain('border-[#282A33]')
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText(/We are experiencing intermittent SSO failures/)).toBeInTheDocument()
    // Should NOT have staff-only badge
    expect(screen.queryByTestId('internal-note-badge')).not.toBeInTheDocument()
  })

  it('renders InternalNoteItem with caution-amber styling, lock icon, and staff-only warning badge', () => {
    render(<InternalNoteItem message={MOCK_MESSAGES[1]} />)

    const item = screen.getByTestId('timeline-message-msg-2')
    expect(item).toBeInTheDocument()
    // Caution-amber styling
    expect(item.className).toContain('bg-[#F59E0B]/5')
    expect(item.className).toContain('border-[#F59E0B]/25')
    expect(screen.getByText('Devon Vance')).toBeInTheDocument()
    expect(screen.getByText('Senior SRE')).toBeInTheDocument()

    // Staff-only warning badge with lock
    const badge = screen.getByTestId('internal-note-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Staff only — hidden from customer')
  })

  it('renders secure download links for attachments (/api/attachments/:id/download)', () => {
    render(<PublicReplyItem message={MOCK_MESSAGES[0]} />)

    const downloadLink = screen.getByTestId('attachment-download-link-att-1')
    expect(downloadLink).toBeInTheDocument()
    expect(downloadLink).toHaveAttribute('href', '/api/attachments/att-1/download')
    expect(screen.getByText('sso-error-trace.log')).toBeInTheDocument()
  })

  it('renders chronological messages in TicketTimeline matching their explicit variants', () => {
    render(<TicketTimeline messages={MOCK_MESSAGES} />)

    expect(screen.getByTestId('timeline-message-msg-1')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-message-msg-2')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-message-msg-3')).toBeInTheDocument()
    expect(screen.getByTestId('internal-note-badge')).toBeInTheDocument()
  })
})

describe('Ticket Conversation Live Hydration via GET /api/tickets/{uuid}', () => {
  it('fetches ticket detail and timeline from GET /api/tickets/{uuid} when apiUrl is configured', async () => {
    const fetchedUrls: string[] = []
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      fetchedUrls.push(url)
      if (url.includes('/api/tickets/ticket-srv-1')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: 'ticket-srv-1',
              ticket_number: 7777,
              subject: 'Live Server Ticket',
              status: 'open',
              priority: 'high',
              customer: { id: 'cust-1', name: 'Server Requester', email: 'req@example.com' },
              tags: [],
              messages: [
                {
                  id: 'srv-msg-1',
                  ticket_id: 'ticket-srv-1',
                  message_type: 'public_reply',
                  author_type: 'Customer',
                  author_name: 'Server Requester',
                  body: 'Live fetched message from API endpoint.',
                  attachments: [],
                  created_at: new Date().toISOString(),
                },
              ],
              assignments: [],
            },
          }),
        }
      }
      // Index endpoint
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'ticket-srv-1',
              ticket_number: 7777,
              subject: 'Live Server Ticket',
              status: 'open',
              priority: 'high',
              customer: { id: 'cust-1', name: 'Server Requester', email: 'req@example.com' },
              tags: [],
              messages: [],
              assignments: [],
            },
          ],
        }),
      }
    })

    vi.stubGlobal('fetch', mockFetch)

    try {
      render(
        <TicketCockpit.Provider
          apiUrl="http://localhost:8000/api"
          token="test-auth-token"
          selectedTicketId="ticket-srv-1"
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      await waitFor(() => {
        expect(fetchedUrls.some((u) => u.includes('/api/tickets/ticket-srv-1'))).toBe(true)
      })

      // The live fetched message should be rendered in the timeline
      await waitFor(() => {
        expect(screen.getByText('Live fetched message from API endpoint.')).toBeInTheDocument()
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Compound Composer Architecture (Issue #104)', () => {
  it('exposes ComposerContextValue with state, actions, and meta via use()', () => {
    function ComposerConsumer() {
      const { state, actions, meta } = useComposer()
      return (
        <div data-testid="composer-consumer">
          <span data-testid="current-tab">{state.tab}</span>
          <span data-testid="current-body">{state.body}</span>
          <span data-testid="current-next-status">{state.nextStatus}</span>
          <button
            type="button"
            data-testid="consumer-switch-tab"
            onClick={() => actions.setTab('internal_note')}
          >
            Switch Tab
          </button>
          <button
            type="button"
            data-testid="consumer-set-body"
            onClick={() => actions.setBody('Drafting response')}
          >
            Set Body
          </button>
        </div>
      )
    }

    render(
      <Composer.Provider currentStatus="open" onSubmit={vi.fn()}>
        <ComposerConsumer />
      </Composer.Provider>
    )

    expect(screen.getByTestId('current-tab')).toHaveTextContent('public_reply')
    expect(screen.getByTestId('current-next-status')).toHaveTextContent('pending')
  })

  it('PublicReplyComposer includes next-status selector defaulting to pending (overrideable)', async () => {
    const user = userEvent.setup()
    render(
      <Composer.Provider currentStatus="open" onSubmit={vi.fn()}>
        <PublicReplyComposer />
      </Composer.Provider>
    )

    const statusSelector = screen.getByTestId('composer-next-status') as HTMLSelectElement
    expect(statusSelector).toBeInTheDocument()
    expect(statusSelector.value).toBe('pending')

    // Change to resolved
    await user.selectOptions(statusSelector, 'resolved')
    expect(statusSelector.value).toBe('resolved')
  })

  it('InternalNoteComposer renders caution-amber styling, lock icon, staff warning, and strictly omits next-status selector', () => {
    render(
      <Composer.Provider currentStatus="open" onSubmit={vi.fn()}>
        <InternalNoteComposer />
      </Composer.Provider>
    )

    // Caution styling / ring
    const composer = screen.getByTestId('ticket-composer')
    expect(composer.className).toContain('ring-[#F59E0B]/30')

    // Staff warning
    expect(screen.getByText('Hidden from customer')).toBeInTheDocument()

    // Strictly omits next-status selector
    expect(screen.queryByTestId('composer-next-status')).not.toBeInTheDocument()
  })

  it('preserves draft text and staged attachments when switching between composer tabs', async () => {
    const user = userEvent.setup()
    render(
      <TicketComposer
        currentStatus="open"
        onSubmit={vi.fn()}
      />
    )

    // Type in Public Reply
    const textarea = screen.getByTestId('composer-textarea')
    await user.type(textarea, 'Draft reply for customer consideration')

    // Stage an attachment
    const file = new File(['log content'], 'debug.log', { type: 'text/plain' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    expect(screen.getByText('debug.log')).toBeInTheDocument()
    expect(textarea).toHaveValue('Draft reply for customer consideration')

    // Switch to Internal Note
    await user.click(screen.getByTestId('composer-tab-internal'))

    // Verify draft text and attachment are PRESERVED
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Draft reply for customer consideration')
    expect(screen.getByText('debug.log')).toBeInTheDocument()

    // Switch back to Public Reply
    await user.click(screen.getByTestId('composer-tab-public'))
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Draft reply for customer consideration')
    expect(screen.getByText('debug.log')).toBeInTheDocument()
  })

  it('pre-validates attachment file size (<= 10MB) and allowed MIME types', async () => {
    const user = userEvent.setup()
    render(
      <TicketComposer
        currentStatus="open"
        onSubmit={vi.fn()}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    // 1. Oversized file (> 10MB)
    const largeContent = new Uint8Array(11 * 1024 * 1024)
    const oversizedFile = new File([largeContent], 'huge-dump.bin', { type: 'application/octet-stream' })
    await user.upload(fileInput, oversizedFile)

    expect(screen.getByText(/exceeds the 10MB limit/)).toBeInTheDocument()
    expect(screen.queryByText('huge-dump.bin')).not.toBeInTheDocument()

    // 2. Unsupported MIME type
    const unsupportedFile = new File(['malicious binary'], 'payload.exe', { type: 'application/x-msdownload' })
    await user.upload(fileInput, unsupportedFile)

    expect(screen.getByText(/is not supported/)).toBeInTheDocument()
    expect(screen.queryByText('payload.exe')).not.toBeInTheDocument()

    // 3. Valid file (PDF <= 10MB)
    const validFile = new File(['%PDF-1.4 valid content'], 'invoice.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, validFile)

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
  })

  it('triggers submission via Cmd/Ctrl+Enter from anywhere within Composer.Provider', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(
      <Composer.Provider currentStatus="open" onSubmit={handleSubmit}>
        <Composer.Frame>
          <Composer.Header />
          <Composer.Input />
          <Composer.Footer>
            <Composer.Submit />
          </Composer.Footer>
        </Composer.Frame>
      </Composer.Provider>
    )

    const textarea = screen.getByTestId('composer-textarea')
    await user.type(textarea, 'Verified via hotkey shortcut.')

    // Press Ctrl+Enter
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(handleSubmit).toHaveBeenCalledTimes(1)
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Verified via hotkey shortcut.',
        messageType: 'public_reply',
        nextStatus: 'pending',
      })
    )
  })

  it('dispatches atomic multipart POST /api/tickets/{uuid}/messages and invalidates queries on submit', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    let submittedUrl = ''
    let submittedFormData: FormData | null = null

    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        submittedUrl = url
        if (options?.body instanceof FormData) {
          submittedFormData = options.body
        }
      }
      return {
        ok: true,
        json: async () => ({
          message: 'Ticket message created successfully.',
          data: { id: 'new-msg-123', body: 'Dispatched response' },
        }),
      }
    })

    vi.stubGlobal('fetch', mockFetch)

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <TicketCockpit.Provider
            apiUrl="http://localhost:8000/api"
            token="bearer-token-123"
            tickets={[INITIAL_MOCK_TICKETS[0]]}
            selectedTicketId={INITIAL_MOCK_TICKETS[0].id}
          >
            <TicketCockpit.Frame>
              <TicketCockpit.Detail />
            </TicketCockpit.Frame>
          </TicketCockpit.Provider>
        </QueryClientProvider>
      )

      const textarea = screen.getByTestId('composer-textarea')
      await user.type(textarea, 'Dispatched multipart response with attachment.')

      // Attach valid file
      const file = new File(['report data'], 'report.pdf', { type: 'application/pdf' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      // Submit
      const submitBtn = screen.getByTestId('composer-submit-btn')
      await user.click(submitBtn)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      // Check URL and form data
      expect(submittedUrl).toBe(`http://localhost:8000/api/tickets/${INITIAL_MOCK_TICKETS[0].id}/messages`)
      expect(submittedFormData).not.toBeNull()
      expect(submittedFormData?.get('body')).toBe('Dispatched multipart response with attachment.')
      expect(submittedFormData?.get('message_type')).toBe('public_reply')
      expect(submittedFormData?.get('target_status')).toBe('pending')
      expect(submittedFormData?.get('attachments[]')).toBeInstanceOf(File)

      // Invalidation of queries
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['ticket', INITIAL_MOCK_TICKETS[0].id] })
      )
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['tickets'] })
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
