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
