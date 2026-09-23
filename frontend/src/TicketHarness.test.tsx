import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('Stage 2.8 Functional Test Harness: Customer Submission & Agent Queue', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('allows a customer to submit a support request on the customer portal', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/portal/tickets') && options?.method === 'POST') {
        let body: Record<string, unknown> = {}
        if (typeof options?.body === 'string') {
          try {
            body = JSON.parse(options.body)
          } catch {
            body = {}
          }
        } else if (options?.body instanceof FormData) {
          body = {
            name: options.body.get('name'),
            email: options.body.get('email'),
            subject: options.body.get('subject'),
            priority: options.body.get('priority'),
          }
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            ticket: {
              id: 'ticket-uuid-1',
              ticket_number: 101,
              subject: body.subject,
              status: 'new',
              priority: body.priority,
            },
            customer: {
              id: 'customer-uuid-1',
              name: body.name,
              email: body.email,
            },
            token: 'signed-customer-token-xyz',
          }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    render(<App hostname="acme.localhost" pathname="/portal" />)

    expect(screen.getByText('Submit a Support Request')).toBeInTheDocument()

    // Fill form fields
    const nameInput = screen.getByTestId('portal-customer-name')
    const emailInput = screen.getByTestId('portal-customer-email')
    const subjectInput = screen.getByTestId('portal-ticket-subject')
    const prioritySelect = screen.getByTestId('portal-ticket-priority')
    const messageInput = screen.getByTestId('portal-ticket-message')
    const submitBtn = screen.getByTestId('portal-submit-btn')

    await user.type(nameInput, 'Alice Freeman')
    await user.type(emailInput, 'alice@example.com')
    await user.type(subjectInput, 'Login issue with 2FA')
    await user.selectOptions(prioritySelect, 'urgent')
    await user.type(messageInput, 'Cannot receive SMS verification code on phone.')

    await user.click(submitBtn)

    // Verify submission confirmation
    await waitFor(() => {
      expect(screen.getByTestId('portal-success-message')).toHaveTextContent('Ticket submitted successfully!')
    })

    expect(screen.getByTestId('portal-submitted-ticket-number')).toHaveTextContent('#101')
    expect(screen.getByTestId('portal-access-token')).toHaveTextContent('signed-customer-token-xyz')
  })

  it('allows an agent to browse the tickets queue in the workspace shell', async () => {
    const user = userEvent.setup()
    localStorage.setItem('zeddesk_token', 'agent-token')

    const mockTickets = [
      {
        id: 'ticket-1',
        organization_id: 1,
        ticket_number: 1,
        subject: 'Vulnerability report on SSO flow',
        status: 'new',
        priority: 'urgent',
        customer: { id: 'cust-1', name: 'Alice Freeman', email: 'alice@example.com' },
      },
      {
        id: 'ticket-2',
        organization_id: 1,
        ticket_number: 2,
        subject: 'Database query timeout on batch report',
        status: 'open',
        priority: 'high',
        customer: { id: 'cust-2', name: 'Bob Smith', email: 'bob@example.com' },
      },
      {
        id: 'ticket-3',
        organization_id: 1,
        ticket_number: 3,
        subject: 'Dark mode support for portal',
        status: 'resolved',
        priority: 'low',
        customer: { id: 'cust-3', name: 'Diana Prince', email: 'diana@example.com' },
      },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
            user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' },
            role: 'agent',
          }),
        } as Response)
      }

      if (url.includes('/api/tickets')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockTickets, meta: { total: 3 } }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    // Navigate to tickets queue
    const ticketsNav = screen.getByTestId('nav-tickets')
    await user.click(ticketsNav)

    // Verify tickets table rendered with seeded mock tickets
    await waitFor(() => {
      expect(screen.getByTestId('tickets-queue-view')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    })

    expect(screen.getByTestId('ticket-number-ticket-1')).toHaveTextContent('#1')
    expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('Vulnerability report on SSO flow')
    expect(screen.getByTestId('ticket-status-ticket-1')).toHaveTextContent('new')
    expect(screen.getByTestId('ticket-priority-ticket-1')).toHaveTextContent('urgent')
    expect(screen.getByTestId('ticket-customer-ticket-1')).toHaveTextContent('Alice Freeman')

    expect(screen.getByTestId('ticket-number-ticket-2')).toHaveTextContent('#2')
    expect(screen.getByTestId('ticket-subject-ticket-2')).toHaveTextContent('Database query timeout on batch report')
    expect(screen.getByTestId('ticket-status-ticket-2')).toHaveTextContent('open')
    expect(screen.getByTestId('ticket-priority-ticket-2')).toHaveTextContent('high')
  })
})
