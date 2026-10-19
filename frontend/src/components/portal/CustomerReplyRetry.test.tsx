import { afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerPortalTicketDetail } from './CustomerPortalTicketDetail'
import { createMockLiveClient } from '../../lib/live-client'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

it('keeps the reply key and draft after a lost response, then uses a fresh key for changed and new replies', async () => {
  const user = userEvent.setup()
  const requests: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/reply') && init?.method === 'POST') {
      requests.push(init)
      if (requests.length <= 2) throw new TypeError('Response lost')
      return {
        ok: true,
        status: 201,
        json: async () => ({
          reply: { id: `reply-${requests.length}`, ticket_id: 'ticket-1', message_type: 'public_reply', body: (init.body as FormData).get('message'), created_at: new Date().toISOString() },
          ticket: { id: 'ticket-1', status: 'open' },
        }),
      } as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ticket: { id: 'ticket-1', ticket_number: 1, subject: 'Help', status: 'open', priority: 'medium' },
        customer: { id: 'customer-1', name: 'Customer', email: 'customer@acme.test' },
        messages: [],
      }),
    } as Response
  }))

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <CustomerPortalTicketDetail
        apiUrl="http://acme.localhost:8000"
        ticketUuid="ticket-1"
        initialToken="signed-token"
        onOpenHistory={() => {}}
        liveClient={createMockLiveClient()}
      />
    </QueryClientProvider>
  )

  const textarea = await screen.findByTestId('composer-textarea')
  const submit = screen.getByTestId('composer-submit-btn')
  await user.type(textarea, 'Please help')
  await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['receipt'], 'proof.txt', { type: 'text/plain' }))
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(1))
  expect(textarea).toHaveValue('Please help')

  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(2))
  const key = (index: number) => (requests[index].headers as Record<string, string>)['Idempotency-Key']
  expect(key(0)).toMatch(/^[0-9a-f-]{36}$/i)
  expect(key(1)).toBe(key(0))
  expect((requests[1].body as FormData).get('attachments[]')).toBeInstanceOf(File)

  await user.type(textarea, ' changed')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(3))
  expect(key(2)).not.toBe(key(1))
  await waitFor(() => expect(textarea).toHaveValue(''))

  await user.type(textarea, 'Another reply')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(4))
  expect(key(3)).not.toBe(key(2))
})

it('retains an uncertain multipart key after remount and shows a live-refetched reply only once', async () => {
  const user = userEvent.setup()
  const requests: RequestInit[] = []
  const reply = { id: 'committed-reply', ticket_id: 'ticket-1', message_type: 'public_reply', body: 'Receipt attached', created_at: new Date().toISOString() }
  const ticket = { id: 'ticket-1', ticket_number: 1, subject: 'Help', status: 'open', priority: 'medium' }
  const customer = { id: 'customer-1', name: 'Customer', email: 'customer@acme.test' }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/reply') && init?.method === 'POST') {
      requests.push(init)
      if (requests.length === 1) throw new TypeError('Response lost after commit')
      return { ok: true, status: 201, json: async () => ({ reply, ticket }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({ ticket, customer, messages: [] }) } as Response
  }))

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <CustomerPortalTicketDetail
        apiUrl="http://acme.localhost:8000"
        ticketUuid="ticket-1"
        initialToken="signed-token"
        onOpenHistory={() => {}}
        liveClient={createMockLiveClient()}
      />
    </QueryClientProvider>
  )
  const firstView = render(view())
  await user.type(await screen.findByTestId('composer-textarea'), 'Receipt attached')
  await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['same bytes'], 'receipt.txt', { type: 'text/plain' }))
  await user.click(screen.getByTestId('composer-submit-btn'))
  await waitFor(() => expect(requests).toHaveLength(1))
  const firstKey = (requests[0].headers as Record<string, string>)['Idempotency-Key']
  firstView.unmount()

  render(view())
  await user.type(await screen.findByTestId('composer-textarea'), 'Receipt attached')
  await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['same bytes'], 'receipt.txt', { type: 'text/plain' }))
  act(() => queryClient.setQueryData(['portal-ticket', 'ticket-1', 'signed-token'], { ticket, customer, messages: [reply] }))
  await waitFor(() => expect(screen.getAllByText('Receipt attached')).toHaveLength(1))
  await user.click(screen.getByTestId('composer-submit-btn'))
  await waitFor(() => expect(requests).toHaveLength(2))
  expect((requests[1].headers as Record<string, string>)['Idempotency-Key']).toBe(firstKey)
  await waitFor(() => expect(screen.getAllByText('Receipt attached')).toHaveLength(1))
})
