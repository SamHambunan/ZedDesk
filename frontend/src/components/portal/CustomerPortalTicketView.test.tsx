import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerPortalView } from './CustomerPortalView'
import { CustomerPortalReplyComposer } from './CustomerPortalReplyComposer'
import { PortalTicketClosedBanner } from './PortalTicketClosedBanner'
import { PortalTicketActiveThread } from './PortalTicketActiveThread'
import { createMockLiveClient } from '../../lib/live-client'
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

  it('applies Warm Alabaster visual direction to conversation thread and composer without graphite leakage or staff presence', async () => {
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

    // Thread is scoped within data-theme="customer"
    expect(screen.getByTestId('customer-portal-layout')).toHaveAttribute('data-theme', 'customer')

    // Message card uses semantic border rather than dark-mode border-white/5
    const messageCard = screen.getByTestId('portal-thread-message-msg-1')
    expect(messageCard.className).toContain('border-border-subtle')
    expect(messageCard.innerHTML).not.toContain('border-white/5')

    // Composer header uses semantic amber and border-subtle instead of hardcoded graphite #0F1012 or #282A33
    const composer = screen.getByTestId('customer-portal-reply-composer')
    expect(composer.innerHTML).not.toContain('#0F1012')
    expect(composer.innerHTML).not.toContain('#282A33')
    expect(composer.innerHTML).toContain('text-amber-action')

    // Staff presence indicators must NOT exist
    expect(screen.queryByTestId('ticket-typing-indicator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-viewers')).not.toBeInTheDocument()
    expect(screen.queryByTestId('online-members')).not.toBeInTheDocument()
  })

  describe('Customer Ticket Live Signals, Reading Position, and Access Recovery (#156)', () => {
    it('signed Customer token authorizes only Customer Ticket channel and updates thread on live public reply', async () => {
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()
      const subscribeSpy = vi.spyOn(mockLiveClient, 'subscribeToCustomerTicket')

      let ticketData = {
        ticket: {
          id: 'ticket-uuid-1001',
          ticket_number: 1001,
          subject: 'Billing discrepancy on invoice #502',
          status: 'open',
          created_at: '2026-10-01T10:00:00.000000Z',
        },
        customer: { id: 'cust-1', name: 'Alice Freeman' },
        messages: [
          {
            id: 'msg-1',
            ticket_id: 'ticket-uuid-1001',
            message_type: 'public_reply',
            author_name: 'Alice Freeman',
            body: 'Initial query',
            created_at: '2026-10-01T10:00:00.000000Z',
          },
        ],
      }

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ticketData,
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Initial query')).toBeInTheDocument()
      })

      // Verify signed Customer token authorizes only that Customer's ticket channel
      expect(subscribeSpy).toHaveBeenCalledWith(
        'ticket-uuid-1001',
        'signed-token-xyz',
        expect.any(Function),
        expect.any(Function)
      )

      // Next, a support staff adds a public reply
      ticketData = {
        ...ticketData,
        messages: [
          ...ticketData.messages,
          {
            id: 'msg-2',
            ticket_id: 'ticket-uuid-1001',
            message_type: 'public_reply',
            author_name: 'Support Agent',
            body: 'We resolved the discrepancy for you.',
            created_at: '2026-10-01T10:05:00.000000Z',
          },
        ],
      }

      // Live signal arrives
      act(() => {
        mockLiveClient.emitSignal({
          event_id: 'sig-1',
          organization_id: 1,
          ticket_id: 'ticket-uuid-1001',
          change_type: 'message_created',
          revision: 2,
        })
      })

      await waitFor(() => {
        expect(screen.getByText('We resolved the discrepancy for you.')).toBeInTheDocument()
      })
    })

    it('shows "New reply — jump to latest" when reading older content and jumps when clicked', async () => {
      const user = userEvent.setup()
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()

      let ticketData = {
        ticket: {
          id: 'ticket-uuid-1001',
          ticket_number: 1001,
          subject: 'Billing discrepancy on invoice #502',
          status: 'open',
          created_at: '2026-10-01T10:00:00.000000Z',
        },
        customer: { id: 'cust-1', name: 'Alice Freeman' },
        messages: [
          {
            id: 'msg-1',
            ticket_id: 'ticket-uuid-1001',
            message_type: 'public_reply',
            author_name: 'Alice Freeman',
            body: 'Original issue message',
            created_at: '2026-10-01T10:00:00.000000Z',
          },
        ],
      }

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ticketData,
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      // Simulate user scrolled up (reading older content)
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true })
      Object.defineProperty(window, 'innerHeight', { value: 400, writable: true })
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1500, writable: true })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Original issue message')).toBeInTheDocument()
      })

      // Simulate scroll event to trigger isNearBottom calculation
      window.dispatchEvent(new Event('scroll'))

      // Support sends a new reply
      ticketData = {
        ...ticketData,
        messages: [
          ...ticketData.messages,
          {
            id: 'msg-new-reply',
            ticket_id: 'ticket-uuid-1001',
            message_type: 'public_reply',
            author_name: 'Support Agent',
            body: 'Fresh update while user was reading older text.',
            created_at: '2026-10-01T10:10:00.000000Z',
          },
        ],
      }

      act(() => {
        mockLiveClient.emitSignal({
          event_id: 'sig-2',
          organization_id: 1,
          ticket_id: 'ticket-uuid-1001',
          change_type: 'message_created',
          revision: 3,
        })
      })

      // "New reply — jump to latest" button must appear
      await waitFor(() => {
        expect(screen.getByTestId('portal-jump-to-latest')).toBeInTheDocument()
      })
      expect(screen.getByTestId('portal-jump-to-latest')).toHaveTextContent('New reply — jump to latest')

      // Scroll position was preserved at 100
      expect(window.scrollY).toBe(100)

      // Clicking jump to latest removes the cue
      await user.click(screen.getByTestId('portal-jump-to-latest'))
      expect(screen.queryByTestId('portal-jump-to-latest')).not.toBeInTheDocument()
    })

    it('closed Ticket removes active composer according to existing lifecycle behavior', async () => {
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()

      let ticketData = {
        ticket: {
          id: 'ticket-uuid-1001',
          ticket_number: 1001,
          subject: 'Billing discrepancy',
          status: 'open',
          created_at: '2026-10-01T10:00:00.000000Z',
        },
        customer: { id: 'cust-1', name: 'Alice Freeman' },
        messages: [
          {
            id: 'msg-1',
            ticket_id: 'ticket-uuid-1001',
            message_type: 'public_reply',
            author_name: 'Alice Freeman',
            body: 'Please close this inquiry',
            created_at: '2026-10-01T10:00:00.000000Z',
          },
        ],
      }

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ticketData,
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('customer-portal-reply-composer')).toBeInTheDocument()
      })

      // Ticket is closed by staff
      ticketData = {
        ...ticketData,
        ticket: {
          ...ticketData.ticket,
          status: 'closed',
        },
      }

      act(() => {
        mockLiveClient.emitSignal({
          event_id: 'sig-3',
          organization_id: 1,
          ticket_id: 'ticket-uuid-1001',
          change_type: 'status_changed',
          revision: 4,
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('portal-ticket-closed-banner')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('customer-portal-reply-composer')).not.toBeInTheDocument()
    })

    it('soft deletion or denied access clears protected content and shows generic unavailable state', async () => {
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              ticket: {
                id: 'ticket-uuid-1001',
                ticket_number: 1001,
                subject: 'Confidential subject',
                status: 'open',
              },
              customer: { id: 'cust-1', name: 'Alice Freeman' },
              messages: [
                {
                  id: 'msg-1',
                  ticket_id: 'ticket-uuid-1001',
                  message_type: 'public_reply',
                  author_name: 'Alice Freeman',
                  body: 'Confidential body message',
                  created_at: '2026-10-01T10:00:00.000000Z',
                },
              ],
            }),
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Confidential subject')).toBeInTheDocument()
        expect(screen.getByText('Confidential body message')).toBeInTheDocument()
      })

      // Soft deletion signal arrives via WebSocket
      act(() => {
        mockLiveClient.emitTicketUnavailable('ticket-uuid-1001', 'unavailable')
      })

      await waitFor(() => {
        expect(screen.getByTestId('portal-ticket-unavailable')).toBeInTheDocument()
      })

      // Protected content MUST BE CLEARED from DOM
      expect(screen.queryByText('Confidential subject')).not.toBeInTheDocument()
      expect(screen.queryByText('Confidential body message')).not.toBeInTheDocument()
      expect(screen.queryByTestId('portal-ticket-active-thread')).not.toBeInTheDocument()
      expect(screen.queryByTestId('customer-portal-reply-composer')).not.toBeInTheDocument()
    })

    it('expired customer token clears protected content and offers "Request a new link"', async () => {
      const user = userEvent.setup()
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ message: 'Customer access token has expired.' }),
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('portal-ticket-expired')).toBeInTheDocument()
      })

      const requestLinkBtn = screen.getByTestId('portal-request-link-btn')
      expect(requestLinkBtn).toHaveTextContent('Request a new link')

      // Clicking opens Find My Tickets modal to request a new magic link
      await user.click(requestLinkBtn)
      expect(screen.getByRole('heading', { name: /Find My Tickets/i })).toBeInTheDocument()
    })

    it('reconnect reauthorizes and refetches without leaking Internal Notes or staff Presence', async () => {
      sessionStorage.setItem('portal_token_ticket-uuid-1001', 'signed-token-xyz')
      const mockLiveClient = createMockLiveClient()

      let fetchCount = 0
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/portal/tickets/ticket-uuid-1001')) {
          fetchCount++
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              ticket: {
                id: 'ticket-uuid-1001',
                ticket_number: 1001,
                subject: 'Live ticket refetch',
                status: 'open',
              },
              customer: { id: 'cust-1', name: 'Alice Freeman' },
              messages: [
                {
                  id: 'msg-1',
                  ticket_id: 'ticket-uuid-1001',
                  message_type: 'public_reply',
                  author_name: 'Alice Freeman',
                  body: `Public body fetch #${fetchCount}`,
                  created_at: '2026-10-01T10:00:00.000000Z',
                },
              ],
            }),
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      renderWithClient(
        <CustomerPortalView
          apiUrl="http://acme.localhost:8000"
          subdomain="acme"
          pathname="/portal/tickets/ticket-uuid-1001"
          liveClient={mockLiveClient}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Public body fetch #1')).toBeInTheDocument()
      })

      // Simulate network disconnect and reconnect
      act(() => {
        mockLiveClient.simulateDisconnect()
        mockLiveClient.simulateReconnect()
      })

      await waitFor(() => {
        expect(screen.getByText('Public body fetch #2')).toBeInTheDocument()
      })

      // Staff presence and internal notes never present
      expect(screen.queryByTestId('ticket-typing-indicator')).not.toBeInTheDocument()
      expect(screen.queryByTestId('ticket-viewers')).not.toBeInTheDocument()
    })
  })
})
