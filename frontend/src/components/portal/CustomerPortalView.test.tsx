import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerPortalView } from './CustomerPortalView'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Customer Support Portal Shell & Public Ticket Intake', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    )

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders customer portal layout with organization branding, header, and support introduction', () => {
    renderWithClient(
      <CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />
    )

    // Branding & Header
    expect(screen.getByTestId('portal-org-branding')).toBeInTheDocument()
    expect(screen.getByText(/acme/i)).toBeInTheDocument()
    expect(screen.getByText(/Support Portal/i)).toBeInTheDocument()
    expect(screen.getByTestId('portal-status-badge')).toHaveTextContent(/Systems Operational/i)

    // Introduction
    expect(screen.getByRole('heading', { name: /Submit a Support Request/i })).toBeInTheDocument()
    expect(
      screen.getByText(/Describe your inquiry or issue below and our support agents will assist you promptly/i)
    ).toBeInTheDocument()

    // Find My Tickets navigation
    expect(screen.getByTestId('portal-find-tickets-btn')).toBeInTheDocument()
  })

  it('validates required fields before submitting the intake form', async () => {
    const user = userEvent.setup()
    renderWithClient(<CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />)

    const submitBtn = screen.getByTestId('portal-submit-btn')
    await user.click(submitBtn)

    // Form should show field error messages
    expect(screen.getByTestId('portal-error-name')).toHaveTextContent(/Please provide your full name/i)
    expect(screen.getByTestId('portal-error-email')).toHaveTextContent(/Please provide your email address/i)
    expect(screen.getByTestId('portal-error-subject')).toHaveTextContent(/Please provide a subject for your ticket/i)
    expect(screen.getByTestId('portal-error-message-field')).toHaveTextContent(/Please provide a detailed message/i)

    // Verify fetch was NOT called
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('validates email format before submission', async () => {
    const user = userEvent.setup()
    renderWithClient(<CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />)

    await user.type(screen.getByTestId('portal-customer-name'), 'Alice Freeman')
    await user.type(screen.getByTestId('portal-customer-email'), 'invalid-email-address')
    await user.type(screen.getByTestId('portal-ticket-subject'), 'Payment question')
    await user.type(screen.getByTestId('portal-ticket-message'), 'I need help with my invoice')

    await user.click(screen.getByTestId('portal-submit-btn'))

    expect(screen.getByTestId('portal-error-email')).toHaveTextContent(/Please provide a valid email address/i)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('handles file attachments dropzone, enforces size and count constraints, and allows removal', async () => {
    const user = userEvent.setup()
    renderWithClient(<CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />)

    const fileInput = screen.getByTestId('portal-file-input')

    // Attach a valid file
    const file1 = new File(['hello world'], 'report.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file1)

    expect(screen.getByTestId('portal-attached-file-0')).toHaveTextContent('report.pdf')

    // Remove file
    const removeBtn = screen.getByTestId('portal-remove-file-0')
    await user.click(removeBtn)

    expect(screen.queryByTestId('portal-attached-file-0')).not.toBeInTheDocument()

    // Test file size limit (>10MB)
    const largeFile = new File([new Uint8Array(11 * 1024 * 1024)], 'huge-dump.txt', { type: 'text/plain' })

    await user.upload(fileInput, largeFile)
    expect(screen.getByTestId('portal-dropzone-error')).toHaveTextContent(/exceeds the maximum 10MB file limit/i)

    // Test max files limit (5 files)
    const validFiles = [
      new File(['1'], 'doc1.pdf', { type: 'application/pdf' }),
      new File(['2'], 'doc2.pdf', { type: 'application/pdf' }),
      new File(['3'], 'doc3.pdf', { type: 'application/pdf' }),
      new File(['4'], 'doc4.pdf', { type: 'application/pdf' }),
      new File(['5'], 'doc5.pdf', { type: 'application/pdf' }),
    ]
    await user.upload(fileInput, validFiles)
    expect(screen.getAllByTestId(/portal-attached-file-/)).toHaveLength(5)

    // Attempt to add 6th file
    const extraFile = new File(['6'], 'doc6.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, extraFile)
    expect(screen.getByTestId('portal-dropzone-error')).toHaveTextContent(/maximum of 5 files/i)
  })

  it('submits ticket intake with multipart form data and renders confirmation screen with sequential number and copyable link', async () => {
    const user = userEvent.setup()
    let capturedBody: FormData | null = null
    let capturedUrl: string | null = null

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/portal/tickets') && options?.method === 'POST') {
        capturedUrl = url
        capturedBody = options.body as FormData
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            message: 'Ticket created successfully.',
            token: 'hmac-signed-token-456',
            access_url: 'http://acme.localhost:8000/portal/tickets/1001?token=hmac-signed-token-456',
            ticket: {
              id: 'ticket-uuid-1001',
              ticket_number: 1001,
              subject: 'Unable to connect to database',
              status: 'new',
              priority: 'urgent',
            },
            customer: {
              id: 'cust-1',
              name: 'Alice Freeman',
              email: 'alice@example.com',
            },
          }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    renderWithClient(
      <CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />
    )

    await user.type(screen.getByTestId('portal-customer-name'), 'Alice Freeman')
    await user.type(screen.getByTestId('portal-customer-email'), 'alice@example.com')
    await user.type(screen.getByTestId('portal-ticket-subject'), 'Unable to connect to database')
    await user.selectOptions(screen.getByTestId('portal-ticket-priority'), 'urgent')
    await user.type(screen.getByTestId('portal-ticket-message'), 'Connection times out after 30 seconds.')

    // Add an attachment
    const file = new File(['log data content'], 'db-error.txt', { type: 'text/plain' })
    await user.upload(screen.getByTestId('portal-file-input'), file)

    await user.click(screen.getByTestId('portal-submit-btn'))

    // Verify submission network call
    await waitFor(() => {
      expect(capturedUrl).toBe('http://acme.localhost:8000/api/portal/tickets')
    })
    expect(capturedBody).toBeInstanceOf(FormData)
    expect(capturedBody!.get('name')).toBe('Alice Freeman')
    expect(capturedBody!.get('email')).toBe('alice@example.com')
    expect(capturedBody!.get('subject')).toBe('Unable to connect to database')
    expect(capturedBody!.get('priority')).toBe('urgent')
    expect(capturedBody!.get('message')).toBe('Connection times out after 30 seconds.')
    expect(capturedBody!.getAll('attachments[]')).toHaveLength(1)

    // Confirmation Screen assertions
    await waitFor(() => {
      expect(screen.getByTestId('portal-success-message')).toHaveTextContent(/Ticket submitted successfully/i)
    })

    expect(screen.getByTestId('portal-submitted-ticket-number')).toHaveTextContent('#1001')
    expect(screen.getByTestId('portal-confirmed-subject')).toHaveTextContent('Unable to connect to database')
    expect(screen.getByTestId('portal-access-link-input')).toHaveValue(
      'http://acme.localhost:8000/portal/tickets/1001?token=hmac-signed-token-456'
    )
    expect(screen.getByTestId('portal-access-token')).toHaveTextContent('hmac-signed-token-456')

    // Test Copy link functionality and visual feedback
    const copyBtn = screen.getByTestId('portal-copy-link-btn')
    expect(copyBtn).toHaveTextContent(/Copy Link/i)
    await user.click(copyBtn)

    expect(await navigator.clipboard.readText()).toBe(
      'http://acme.localhost:8000/portal/tickets/1001?token=hmac-signed-token-456'
    )
    expect(screen.getByTestId('portal-copy-link-btn')).toHaveTextContent(/Copied!/i)

    // Test Submit Another Inquiry reset
    await user.click(screen.getByTestId('portal-submit-another'))
    expect(screen.getByRole('heading', { name: /Submit a Support Request/i })).toBeInTheDocument()
    expect(screen.getByTestId('portal-customer-name')).toHaveValue('')
  })

  it('displays responsive error alert banner when intake submission fails', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/portal/tickets')) {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({
            message: 'Invalid file attachment or security check failed.',
          }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    renderWithClient(
      <CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" />
    )

    await user.type(screen.getByTestId('portal-customer-name'), 'Alice Freeman')
    await user.type(screen.getByTestId('portal-customer-email'), 'alice@example.com')
    await user.type(screen.getByTestId('portal-ticket-subject'), 'Test subject')
    await user.type(screen.getByTestId('portal-ticket-message'), 'Test message body')

    await user.click(screen.getByTestId('portal-submit-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('portal-error-message')).toBeInTheDocument()
    })
    expect(screen.getByTestId('portal-error-message')).toHaveTextContent(
      'Invalid file attachment or security check failed.'
    )
  })

  it('allows requesting magic links via email through Find My Tickets modal/view', async () => {
    const user = userEvent.setup()
    let capturedBody: string | null = null

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/portal/magic-link') && options?.method === 'POST') {
        capturedBody = options.body as string
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Magic link generated successfully.',
            token: 'magic-token-xyz',
          }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    renderWithClient(
      <CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" pathname="/portal" />
    )

    // Open modal via header button
    await user.click(screen.getByTestId('portal-find-tickets-btn'))

    expect(screen.getByRole('heading', { name: /Find My Tickets/i })).toBeInTheDocument()

    // Validate email in modal
    const emailInput = screen.getByTestId('portal-magic-link-email')
    const submitMagicBtn = screen.getByTestId('portal-magic-link-submit-btn')

    await user.type(emailInput, 'returning.customer@example.com')
    await user.click(submitMagicBtn)

    await waitFor(() => {
      expect(screen.getByTestId('portal-magic-link-success')).toBeInTheDocument()
    })

    expect(JSON.parse(capturedBody!)).toEqual({
      email: 'returning.customer@example.com',
    })
    expect(screen.getByText(/Magic link requested!/i)).toBeInTheDocument()
    expect(screen.getByText(/returning.customer@example.com/i)).toBeInTheDocument()

    // Click done to close modal
    await user.click(screen.getByTestId('portal-magic-link-done-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('portal-magic-link-success')).not.toBeInTheDocument()
    })
  })

  it('automatically opens Find My Tickets modal when route is /portal/history', () => {
    renderWithClient(
      <CustomerPortalView apiUrl="http://acme.localhost:8000" subdomain="acme" pathname="/portal/history" />
    )

    expect(screen.getByRole('heading', { name: /Find My Tickets/i })).toBeInTheDocument()
  })
})
