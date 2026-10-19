import { afterEach, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSubmitTicketMutation } from '../../hooks/useCustomerPortal'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

it('preserves each uncertain intake key across remount and rotates completed submissions', async () => {
  const requests: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(init)
    if (requests.length <= 2) throw new TypeError('Response lost')
    return { ok: true, status: 201, json: async () => ({ ticket: { id: 'ticket-1' } }) } as Response
  }))

  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const payload = { name: 'Alice', email: 'alice@example.test', subject: 'Help', message: 'Please help', attachments: [new File(['proof'], 'proof.txt', { type: 'text/plain' })] }
  const first = renderHook(() => useSubmitTicketMutation('http://acme.localhost:8000'), { wrapper })

  await act(async () => { await expect(first.result.current.mutateAsync(payload)).rejects.toThrow('Response lost') })
  const key = (index: number) => (requests[index].headers as Record<string, string>)['Idempotency-Key']
  expect(key(0)).toMatch(/^[0-9a-f-]{36}$/i)
  first.unmount()

  const retry = renderHook(() => useSubmitTicketMutation('http://acme.localhost:8000'), { wrapper })
  await act(async () => { await expect(retry.result.current.mutateAsync(payload)).rejects.toThrow('Response lost') })
  expect(key(1)).toBe(key(0))
  expect((requests[1].body as FormData).get('attachments[]')).toBeInstanceOf(File)

  await act(async () => { await retry.result.current.mutateAsync({ ...payload, message: 'Changed inquiry' }) })
  expect(key(2)).not.toBe(key(1))
  retry.unmount()

  const recovered = renderHook(() => useSubmitTicketMutation('http://acme.localhost:8000'), { wrapper })
  await act(async () => { await recovered.result.current.mutateAsync(payload) })
  expect(key(3)).toBe(key(0))
  await act(async () => { await recovered.result.current.mutateAsync({ ...payload, message: 'Changed inquiry' }) })
  expect(key(4)).not.toBe(key(2))
})
