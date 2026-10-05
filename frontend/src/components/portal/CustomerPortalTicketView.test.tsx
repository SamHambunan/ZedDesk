import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerPortalView } from './CustomerPortalView'
import { CustomerPortalReplyComposer } from './CustomerPortalReplyComposer'
import { PortalTicketClosedBanner } from './PortalTicketClosedBanner'
import { PortalTicketActiveThread } from './PortalTicketActiveThread'
import type { PortalMessage } from './types'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Customer Portal Conversation Thread, Composed Replies & Closed Lockout (#106)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    localStorage.clear()

    // Default mock response for portal tickets
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ticket: {
              id: 'ticket-uuid-1001',
              ticket_number: 1001,
              subject: 'Billing discrepancy on invoice #502',
              status: 'open',
              priority: 'high',
              created_at: '2026-10-01T10:00:00.000000Z',
            },
            customer: {
              id: 'cust-1',
              name: 'Alice Freeman',
              email: 'alice@example.com',
            },
            messages: [
              {
                id: 'msg-1',
                ticket_id: 'ticket-uuid-1001',
                message_type: 'public_reply',
                author_type: 'Customer',
                author_name: 'Alice Freeman',
                body: 'Hello, I see an extra charge on my latest invoice.',
                created_at: '2026-10-01T10:00:00.000000Z',
                attachments: [
                  {
                    id: 'att-1',
                    file_name: 'invoice-502.pdf',
                    file_size_bytes: 24500,
                    mime_type: 'application/pdf',
                    url: '/api/portal/tickets/ticket-uuid-1001/attachments/att-1',
                  },
                ],
              },
              {
                id: 'msg-internal-hidden',
                ticket_id: 'ticket-uuid-1001',
                message_type: 'internal_note',
                author_type: 'OrganizationMember',
                author_name: 'Bob Agent',
                author_role: 'Agent',
                body: 'CONFIDENTIAL STAFF NOTE: Check Stripe account history.',
                created_at: '2026-10-01T10:30:00.000000Z',
              },
              {
                id: 'msg-2',
                ticket_id: 'ticket-uuid-1001',
                message_type: 'public_reply',
                author_type: 'OrganizationMember',
                author_name: 'Bob Agent',
                author_role: 'Support Agent',
                body: 'We are investigating the charge and will get back to you shortly.',
                created_at: '2026-10-01T11:00:00.000000Z',
                attachments: [],
              },
            ],
          }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('ingests customer token from URL ?token= parameter into sessionStorage and strips it from address bar', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    window.history.pushState({}, '', '/portal/tickets/ticket-uuid-1001?token=signed-hmac-token-123')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-1001"
        search="?token=signed-hmac-token-123"
      />
    )

    // Token stored in sessionStorage
    expect(
      sessionStorage.getItem('portal_token_ticket-uuid-1001') ||
        sessionStorage.getItem('zeddesk_customer_token')
    ).toBe('signed-hmac-token-123')

    // Token stripped from address bar
    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      '',
      expect.not.stringContaining('token=')
    )
  })

  it('fetches ticket details and conversation thread using X-Customer-Token header', async () => {
    sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-hmac-token-123')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-1001"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-subject')).toHaveTextContent('Billing discrepancy on invoice #502')
    })

    // Check fetch request headers
    expect(global.fetch).toHaveBeenCalledWith(
      'http://acme.localhost:8000/api/portal/tickets/ticket-uuid-1001',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Customer-Token': 'signed-hmac-token-123',
        }),
      })
    )

    expect(screen.getByTestId('portal-ticket-number')).toHaveTextContent('#1001')
    expect(screen.getByTestId('portal-ticket-status-badge')).toHaveTextContent(/open/i)
  })

  it('strictly excludes internal notes authored by staff from the customer portal thread DOM', async () => {
    sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-hmac-token-123')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-1001"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-subject')).toBeInTheDocument()
    })

    // Public replies should be visible
    expect(screen.getByText('Hello, I see an extra charge on my latest invoice.')).toBeInTheDocument()
    expect(
      screen.getByText('We are investigating the charge and will get back to you shortly.')
    ).toBeInTheDocument()

    // Internal note MUST NOT exist anywhere in DOM
    expect(screen.queryByText(/CONFIDENTIAL STAFF NOTE/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Check Stripe account history/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('timeline-message-msg-internal-hidden')).not.toBeInTheDocument()
    expect(screen.queryByTestId('internal-note-badge')).not.toBeInTheDocument()
  })

  it('dedicated CustomerPortalReplyComposer variant reuses compound Composer.* primitives without agent controls', async () => {
    const onSubmitReply = vi.fn()

    renderWithClient(
      <CustomerPortalReplyComposer
        ticketUuid="ticket-uuid-1001"
        currentStatus="open"
        onSubmitReply={onSubmitReply}
      />
    )

    // Has composer textarea and submit button
    expect(screen.getByTestId('composer-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('composer-submit-btn')).toHaveTextContent(/Send Reply/i)

    // Agent controls must NOT be present
    expect(screen.queryByTestId('composer-next-status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('composer-tab-internal')).not.toBeInTheDocument()
    expect(screen.queryByText(/Hidden from customer/i)).not.toBeInTheDocument()
  })

  it('customer reply dispatches POST /api/portal/tickets/{uuid}/reply and automatically transitions pending or resolved tickets to open', async () => {
    const user = userEvent.setup()

    // Mock initial ticket state as 'pending'
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/portal/tickets/ticket-uuid-1001/reply') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            message: 'Reply submitted successfully.',
            reply: {
              id: 'msg-3',
              ticket_id: 'ticket-uuid-1001',
              body: 'I have attached the receipt showing the bank statement.',
              message_type: 'public_reply',
              author_type: 'Customer',
              author_name: 'Alice Freeman',
              created_at: '2026-10-01T12:00:00.000000Z',
              attachments: [],
            },
            ticket: {
              id: 'ticket-uuid-1001',
              ticket_number: 1001,
              status: 'open', // Reopened by backend from pending!
            },
          }),
        } as Response)
      }

      if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ticket: {
              id: 'ticket-uuid-1001',
              ticket_number: 1001,
              subject: 'Billing inquiry',
              status: 'pending', // Currently pending
              priority: 'medium',
              created_at: '2026-10-01T10:00:00.000000Z',
            },
            customer: {
              id: 'cust-1',
              name: 'Alice Freeman',
              email: 'alice@example.com',
            },
            messages: [
              {
                id: 'msg-1',
                ticket_id: 'ticket-uuid-1001',
                message_type: 'public_reply',
                author_type: 'Customer',
                body: 'First message',
                created_at: '2026-10-01T10:00:00.000000Z',
              },
            ],
          }),
        } as Response)
      }

      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-1001"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-status-badge')).toHaveTextContent(/pending/i)
    })

    const textarea = screen.getByTestId('composer-textarea')
    await user.type(textarea, 'I have attached the receipt showing the bank statement.')

    const submitBtn = screen.getByTestId('composer-submit-btn')
    await user.click(submitBtn)

    // Verify reply POST call
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://acme.localhost:8000/api/portal/tickets/ticket-uuid-1001/reply',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Customer-Token': 'signed-token-xyz',
          }),
        })
      )
    })

    // Status transitions from pending to open
    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-status-badge')).toHaveTextContent(/open/i)
    })

    // New reply is rendered in the active thread
    expect(screen.getByText('I have attached the receipt showing the bank statement.')).toBeInTheDocument()
  })

  it('renders explicit PortalTicketClosedBanner variant instead of composer when ticket status is closed', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/portal/tickets/ticket-uuid-closed')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ticket: {
              id: 'ticket-uuid-closed',
              ticket_number: 999,
              subject: 'Refund processed',
              status: 'closed',
              priority: 'low',
              created_at: '2026-09-20T10:00:00.000000Z',
            },
            customer: {
              id: 'cust-1',
              name: 'Alice Freeman',
              email: 'alice@example.com',
            },
            messages: [
              {
                id: 'msg-final',
                ticket_id: 'ticket-uuid-closed',
                message_type: 'public_reply',
                author_type: 'OrganizationMember',
                author_name: 'Bob Agent',
                body: 'Your refund has been issued and this ticket is now closed.',
                created_at: '2026-09-21T10:00:00.000000Z',
              },
            ],
          }),
        } as Response)
      }

      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    sessionStorage.setItem('portal_token_ticket-uuid-closed', 'token-closed')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-closed"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-status-badge')).toHaveTextContent(/closed/i)
    })

    // Closed Banner must be rendered
    expect(screen.getByTestId('portal-ticket-closed-banner')).toBeInTheDocument()
    expect(screen.getByText(/This ticket is closed/i)).toBeInTheDocument()

    // Composer must NOT be rendered (preventing rejected submissions)
    expect(screen.queryByTestId('composer-textarea')).not.toBeInTheDocument()
    expect(screen.queryByTestId('composer-submit-btn')).not.toBeInTheDocument()
  })

  it('header link "View all my tickets" opens FindMyTicketsModal', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token')

    renderWithClient(
      <CustomerPortalView
        apiUrl="http://acme.localhost:8000"
        subdomain="acme"
        pathname="/portal/tickets/ticket-uuid-1001"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('portal-ticket-subject')).toBeInTheDocument()
    })

    const viewAllBtn = screen.getByRole('button', { name: /View all my tickets/i })
    expect(viewAllBtn).toBeInTheDocument()

    await user.click(viewAllBtn)

    // FindMyTicketsModal should open
    expect(screen.getByRole('heading', { name: /Find My Tickets/i })).toBeInTheDocument()
  })

  it('PortalTicketActiveThread renders attachment chips with download links', () => {
    const sampleMessages: PortalMessage[] = [
      {
        id: 'msg-att-1',
        ticket_id: 'ticket-uuid-1',
        message_type: 'public_reply',
        author_type: 'Customer',
        author_name: 'Alice Freeman',
        body: 'Here is the screenshot.',
        created_at: '2026-10-01T10:00:00.000000Z',
        attachments: [
          {
            id: 'att-99',
            file_name: 'screenshot-error.png',
            file_size_bytes: 1048576,
            mime_type: 'image/png',
            url: 'http://acme.localhost:8000/api/portal/tickets/ticket-uuid-1/attachments/att-99',
          },
        ],
      },
    ]

    renderWithClient(
      <PortalTicketActiveThread
        messages={sampleMessages}
        customerName="Alice Freeman"
        ticketUuid="ticket-uuid-1"
        apiUrl="http://acme.localhost:8000"
      />
    )

    expect(screen.getByText('screenshot-error.png')).toBeInTheDocument()
    expect(screen.getByText('(1.0 MB)')).toBeInTheDocument()
    const downloadLink = screen.getByTestId('attachment-download-link-att-99')
    expect(downloadLink).toHaveAttribute(
      'href',
      'http://acme.localhost:8000/api/portal/tickets/ticket-uuid-1/attachments/att-99'
    )
  })

  it('PortalTicketClosedBanner displays ticket number and triggers callbacks', async () => {
    const user = userEvent.setup()
    const onNewInquiry = vi.fn()
    const onFindTickets = vi.fn()

    render(
      <PortalTicketClosedBanner
        ticketNumber={1002}
        onNewInquiry={onNewInquiry}
        onFindTickets={onFindTickets}
      />
    )

    expect(screen.getByText(/Ticket #1002 has been resolved and closed/i)).toBeInTheDocument()
    await user.click(screen.getByTestId('portal-closed-new-ticket-btn'))
    expect(onNewInquiry).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('portal-closed-find-tickets-btn'))
    expect(onFindTickets).toHaveBeenCalledTimes(1)
  })
})
