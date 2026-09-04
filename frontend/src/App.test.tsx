import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('ZedDesk Frontend Baseline Shell', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders ZedDesk branding and system baseline status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        services: {
          database: 'connected',
          redis: 'connected',
        },
      }),
    } as Response)

    render(<App />)

    expect(screen.getByText('ZedDesk')).toBeInTheDocument()
    expect(screen.getByText('Multi-tenant AI-Powered Helpdesk')).toBeInTheDocument()
    expect(screen.getByTestId('frontend-status')).toHaveTextContent('Operational')

    await waitFor(() => {
      expect(screen.getByTestId('backend-status')).toHaveTextContent('OK')
      expect(screen.getByTestId('db-status')).toHaveTextContent('connected')
      expect(screen.getByTestId('redis-status')).toHaveTextContent('connected')
    })
  })

  it('displays degraded status when API returns partial service failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        status: 'degraded',
        services: {
          database: 'connected',
          redis: 'error: Connection refused',
        },
      }),
    } as Response)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('backend-status')).toHaveTextContent('DEGRADED')
      expect(screen.getByTestId('db-status')).toHaveTextContent('connected')
      expect(screen.getByTestId('redis-status')).toHaveTextContent(/error/)
    })
  })

  it('displays unavailable indicator when API fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('backend-status')).toHaveTextContent(/Unavailable/)
    })
  })
})
