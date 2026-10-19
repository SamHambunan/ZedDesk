import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TicketCockpit } from './TicketCockpit'
import { INITIAL_MOCK_TICKETS } from './mockData'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('reuses the request key after an ambiguous failure and creates a new key for a new message', async () => {
  const user = userEvent.setup()
  const requests: RequestInit[] = []
  let attempts = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/messages') && init?.method === 'POST') {
      requests.push(init)
      attempts++
      if (attempts <= 2) throw new TypeError('Network failed after commit')
    }
    return { ok: true, status: 201, json: async () => ({ data: [] }) }
  }))

  render(
    <TicketCockpit.Provider apiUrl="http://acme.localhost" token="member-token" tickets={INITIAL_MOCK_TICKETS} selectedTicketId="ticket-1">
      <TicketCockpit.Detail />
    </TicketCockpit.Provider>
  )

  const textarea = screen.getByTestId('composer-textarea')
  const submit = screen.getByTestId('composer-submit-btn')
  await user.type(textarea, 'Retry this reply')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(1))
  expect(textarea).toHaveValue('Retry this reply')

  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(2))
  const firstKey = (requests[0].headers as Record<string, string>)['Idempotency-Key']
  expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i)
  expect((requests[1].headers as Record<string, string>)['Idempotency-Key']).toBe(firstKey)

  await user.type(textarea, ' changed')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(3))
  const changedKey = (requests[2].headers as Record<string, string>)['Idempotency-Key']
  expect(changedKey).not.toBe(firstKey)
  await waitFor(() => expect(textarea).toHaveValue(''))

  await user.type(textarea, 'Another reply')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(4))
  expect((requests[3].headers as Record<string, string>)['Idempotency-Key']).not.toBe(changedKey)
})

it('keeps the key with the same multipart file and status, then changes it when either changes', async () => {
  const user = userEvent.setup()
  const requests: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/messages') && init?.method === 'POST') {
      requests.push(init)
      if (requests.length <= 3) throw new TypeError('Response lost')
    }
    return { ok: true, status: 201, json: async () => ({ data: [] }) }
  }))

  render(
    <TicketCockpit.Provider apiUrl="http://acme.localhost" token="member-token" tickets={INITIAL_MOCK_TICKETS} selectedTicketId="ticket-1">
      <TicketCockpit.Detail />
    </TicketCockpit.Provider>
  )

  await user.type(screen.getByTestId('composer-textarea'), 'Attached reply')
  await user.selectOptions(screen.getByTestId('composer-next-status'), 'resolved')
  await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['first bytes'], 'proof.txt', { type: 'text/plain' }))
  const submit = screen.getByTestId('composer-submit-btn')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(1))
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(2))

  const requestKey = (index: number) => (requests[index].headers as Record<string, string>)['Idempotency-Key']
  const body = (index: number) => requests[index].body as FormData
  expect(requestKey(1)).toBe(requestKey(0))
  expect(body(0).get('target_status')).toBe('resolved')
  expect((body(0).get('attachments[]') as File).name).toBe('proof.txt')
  expect((body(1).get('attachments[]') as File).name).toBe('proof.txt')

  await user.selectOptions(screen.getByTestId('composer-next-status'), 'open')
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(3))
  expect(requestKey(2)).not.toBe(requestKey(1))
  expect(body(2).get('target_status')).toBe('open')

  await user.click(screen.getByTitle('Remove attachment'))
  await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['different bytes'], 'replacement.txt', { type: 'text/plain' }))
  await user.click(submit)
  await waitFor(() => expect(requests).toHaveLength(4))
  expect(requestKey(3)).not.toBe(requestKey(2))
  expect((body(3).get('attachments[]') as File).name).toBe('replacement.txt')
})
