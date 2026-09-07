import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CentralHubView } from './CentralHubView'

describe('CentralHubView (Seam 2)', () => {
  let queryClient: QueryClient
  const originalFetch = global.fetch
  const originalLocation = window.location

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    // Mock window.location
    delete (window as unknown as { location?: unknown }).location
    window.location = {
      ...originalLocation,
      href: 'http://localhost:5173',
      hostname: 'localhost',
      port: '5173',
      protocol: 'http:',
      pathname: '/',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    } as unknown as Location
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.location = originalLocation
  })

  const renderView = (initialToken?: string, initialUser?: { id: number; name: string; email: string }) => {
    if (initialToken) {
      localStorage.setItem('zeddesk_token', initialToken)
    }
    if (initialUser) {
      localStorage.setItem('zeddesk_user', JSON.stringify(initialUser))
    }

    return render(
      <QueryClientProvider client={queryClient}>
        <CentralHubView />
      </QueryClientProvider>
    )
  }

  it('renders unauthenticated state with Kinetic Operational Dark AuthCard by default', () => {
    renderView()

    expect(screen.getByRole('heading', { name: /^zeddesk$/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /log in/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /register/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('submits login credentials to POST /api/login, handles success, and transitions to authenticated hub', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/login') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 1, name: 'Alex Vance', email: 'alex.vance@example.com' },
            token: 'test-sanctum-token',
          }),
        } as Response)
      }

      if (url.endsWith('/api/organizations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 101, name: 'Acme Support', slug: 'acme', role: 'admin', agents_count: 14 },
            { id: 102, name: 'Cyberdyne Systems', slug: 'cyberdyne', role: 'agent', agents_count: 8 },
          ],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView()

    await user.type(screen.getByLabelText(/email/i), 'alex.vance@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'Password123!')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(localStorage.getItem('zeddesk_token')).toBe('test-sanctum-token')
      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      expect(screen.getByText('Acme Support')).toBeInTheDocument()
      expect(screen.getByText('Cyberdyne Systems')).toBeInTheDocument()
    })
  })

  it('validates registration form, submits to POST /api/register, and establishes session', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/register') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            user: { id: 2, name: 'Sarah Connor', email: 'sarah@example.com' },
            token: 'sarah-token',
          }),
        } as Response)
      }

      if (url.endsWith('/api/organizations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView()

    // Switch to Register tab
    await user.click(screen.getByRole('tab', { name: /register/i }))

    await user.type(screen.getByLabelText(/name/i), 'Sarah Connor')
    await user.type(screen.getByLabelText(/^email/i), 'sarah@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'Password123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123!')

    await user.click(screen.getByRole('button', { name: /^register$/i }))

    await waitFor(() => {
      expect(localStorage.getItem('zeddesk_token')).toBe('sarah-token')
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })
  })

  it('displays organization cards with role pills and launches workspace to tenant subdomain', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/organizations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 10, name: 'Acme Support', slug: 'acme', role: 'admin', agents_count: 14 },
          ],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

    await waitFor(() => {
      const orgCard = screen.getByTestId('org-card-acme')
      expect(within(orgCard).getByText('Acme Support')).toBeInTheDocument()
      expect(within(orgCard).getByText('acme.zeddesk.app')).toBeInTheDocument()
      expect(within(orgCard).getByText('admin')).toBeInTheDocument()
    })

    const launchButton = screen.getByRole('button', { name: /launch workspace for acme support/i })
    await user.click(launchButton)

    expect(window.location.href).toBe('http://acme.localhost:5173')
  })

  it('calls POST /api/logout and clears session state when user logs out', async () => {
    const user = userEvent.setup()
    let logoutCalled = false

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/organizations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response)
      }

      if (url.endsWith('/api/logout') && init?.method === 'POST') {
        logoutCalled = true
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: 'Logged out successfully' }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

    await waitFor(() => {
      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
    })

    const logoutBtn = screen.getByRole('button', { name: /log out/i })
    await user.click(logoutBtn)

    await waitFor(() => {
      expect(logoutCalled).toBe(true)
      expect(localStorage.getItem('zeddesk_token')).toBeNull()
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
    })
  })
})
