import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createQueryClient, queryClient } from './query-client'

function QueryConsumer() {
  const { data, isLoading } = useQuery({
    queryKey: ['test-key'],
    queryFn: async () => 'tanstack-query-success',
  })

  if (isLoading) return <span>Loading...</span>
  return <span>{data}</span>
}

describe('TanStack Query Client Configuration', () => {
  it('creates configured QueryClient with sensible defaults', () => {
    const client = createQueryClient()
    const defaultOptions = client.getDefaultOptions()
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaultOptions.queries?.retry).toBe(1)
    expect(defaultOptions.mutations?.retry).toBe(false)
  })

  it('successfully executes queries inside QueryClientProvider', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QueryConsumer />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('tanstack-query-success')).toBeInTheDocument()
    })
  })
})
