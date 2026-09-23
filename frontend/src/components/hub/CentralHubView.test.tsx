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
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        href: 'http://localhost:5173',
        hostname: 'localhost',
        port: '5173',
        protocol: 'http:',
        pathname: '/',
        assign: vi.fn(),
        replace: vi.fn(),
        reload: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  const renderView = (
    initialToken?: string,
    initialUser?: { id: number; name: string; email: string },
    initialInvitations?: any[]
  ) => {
    if (initialToken) {
      localStorage.setItem('zeddesk_token', initialToken)
    }
    if (initialUser) {
      localStorage.setItem('zeddesk_user', JSON.stringify(initialUser))
    }

    return render(
      <QueryClientProvider client={queryClient}>
        <CentralHubView initialInvitations={initialInvitations} />
      </QueryClientProvider>
    )
  }


  it('renders unauthenticated state on Industrial Graphite canvas (#0F1012) with focused 480px AuthCard and segmented tabs', () => {
    const { container } = renderView()

    // Industrial Graphite canvas (#0F1012)
    const canvas = container.firstChild as HTMLElement
    expect(canvas.className).toContain('bg-[#0F1012]')

    // 480px card
    const cardBox = screen.getByTestId('auth-card')
    expect(cardBox).toBeInTheDocument()
    const cardWrapper = cardBox.parentElement as HTMLElement
    expect(cardWrapper.className).toContain('max-w-[480px]')

    // Heading and segmented tabs
    expect(screen.getByRole('heading', { name: /^zeddesk$/i })).toBeInTheDocument()
    const tablist = screen.getByRole('tablist')
    expect(tablist.className).toContain('grid-cols-2')
    expect(tablist.className).toContain('bg-[#121316]')
    expect(tablist.className).toContain('border-[#282A33]')

    expect(screen.getByRole('tab', { name: /log in/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('renders recessed dark inputs (#121316) with luminous amber focus glow rings and displays crimson borders on validation error', async () => {
    const user = userEvent.setup()
    renderView()

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/^password/i)

    // Recessed dark fills (#121316), 1px micro-borders, and luminous amber focus glow rings
    expect(emailInput.className).toContain('bg-[#121316]')
    expect(emailInput.className).toContain('border-[#282A33]')
    expect(emailInput.className).toContain('focus:ring-[#F59E0B]')

    // Submit empty Sign In form triggers validation
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(emailInput.className).toContain('border-[#EF4444]')
    expect(passwordInput.className).toContain('border-[#EF4444]')
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()

    // Test email format validation
    await user.type(emailInput, 'invalid-email')
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()

    // Switch to Register tab and verify registration validation errors
    await user.click(screen.getByRole('tab', { name: /register/i }))
    await user.click(screen.getByRole('button', { name: /^register$/i }))

    expect(screen.getByText('Full name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByText('Please confirm your password.')).toBeInTheDocument()

    // Password length validation
    await user.type(screen.getByLabelText(/^password/i), 'short')
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()

    // Password confirmation mismatch
    await user.clear(screen.getByLabelText(/^password/i))
    await user.type(screen.getByLabelText(/^password/i), 'ValidPass123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'DifferentPass123!')
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
  })

  it('detects existing session from localStorage and directly renders authenticated workspace hub', async () => {
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
            { id: 101, name: 'Acme Support', slug: 'acme', role: 'admin', agents_count: 14 },
          ],
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    // Pre-populate localStorage
    renderView('persisted-token', { id: 99, name: 'Existing User', email: 'existing@example.com' })

    // Skips login card
    expect(screen.queryByTestId('auth-card')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /log in/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Existing User')).toBeInTheDocument()
      expect(screen.getByText('Acme Support')).toBeInTheDocument()
    })
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

    expect(window.location.href).toContain('http://acme.localhost:5173/overview')
  })

  it('renders empty state when authenticated user has no organizations', async () => {
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
          json: async () => [],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

    await waitFor(() => {
      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      expect(screen.getByText(/no workspaces found/i)).toBeInTheDocument()
    })
  })

  it('renders dismissible Cadmium Amber alert banner at the top of Central Hub when pending invitations exist', async () => {
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

    const pendingInvites = [
      {
        id: 99,
        organizationName: 'Initech Systems',
        role: 'agent',
      },
    ]

    renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' }, pendingInvites)

    await waitFor(() => {
      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
    })

    // Banner is rendered at top
    const banner = screen.getByRole('region', { name: /pending invitations/i })
    expect(banner).toBeInTheDocument()
    expect(banner.className).toMatch(/sentiment-warning|F59E0B/)
    expect(within(banner).getByText(/Initech Systems/i)).toBeInTheDocument()

    // Dismiss banner
    const dismissBtn = within(banner).getByRole('button', { name: /dismiss/i })
    await user.click(dismissBtn)

    expect(screen.queryByRole('region', { name: /pending invitations/i })).not.toBeInTheDocument()
  })

  it('fetches pending invitations for authenticated user from /api/user/invitations and renders banner', async () => {
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

      if (url.endsWith('/api/user/invitations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 42,
              email: 'alex@example.com',
              role: 'agent',
              organization: { id: 2, name: 'Umbrella Corp', slug: 'umbrella' },
            },
          ],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

    await waitFor(() => {
      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      expect(screen.getByText(/Umbrella Corp/i)).toBeInTheDocument()
    })

    const banner = screen.getByRole('region', { name: /pending invitations/i })
    expect(banner).toBeInTheDocument()
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

  describe('Organization Creation Flow (Ticket #17)', () => {
    it('+ Create New Organization button opens the accessible modal dialog and previews URL in real-time', async () => {
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
            json: async () => [],
          } as Response)
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

      await waitFor(() => {
        expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      })

      // Modal should not be in document initially
      expect(screen.queryByRole('dialog', { name: /create new organization/i })).not.toBeInTheDocument()

      // Click "+ Create New Organization" button
      const createButton = screen.getByRole('button', { name: /\+? ?create new organization/i })
      await user.click(createButton)

      // Modal is opened
      const modal = screen.getByRole('dialog', { name: /create new organization/i })
      expect(modal).toBeInTheDocument()

      // Form inputs exist
      const orgNameInput = within(modal).getByLabelText(/organization name/i)
      const slugInput = within(modal).getByLabelText(/workspace subdomain url/i)

      // Typing organization name auto-generates slug and updates real-time preview
      await user.type(orgNameInput, 'Stark Industries')
      expect(slugInput).toHaveValue('stark-industries')
      expect(within(modal).getByText('https://stark-industries.zeddesk.app')).toBeInTheDocument()
      expect(within(modal).getByText('Subdomain is valid and available')).toBeInTheDocument()

      // Can close modal via Cancel button
      await user.click(within(modal).getByRole('button', { name: /cancel/i }))
      expect(screen.queryByRole('dialog', { name: /create new organization/i })).not.toBeInTheDocument()
    })

    it('validates against reserved and invalid slugs client-side in the creation modal', async () => {
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
            json: async () => [],
          } as Response)
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

      await waitFor(() => {
        expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /\+? ?create new organization/i }))

      const modal = screen.getByRole('dialog', { name: /create new organization/i })
      const orgNameInput = within(modal).getByLabelText(/organization name/i)
      const slugInput = within(modal).getByLabelText(/workspace subdomain url/i)
      const submitButton = within(modal).getByRole('button', { name: /create organization & launch/i })

      await user.type(orgNameInput, 'Admin Operations')
      // Manually set reserved slug
      await user.clear(slugInput)
      await user.type(slugInput, 'admin')

      expect(within(modal).getByText(/reserved by the system/i)).toBeInTheDocument()
      expect(submitButton).toBeDisabled()

      // Test invalid characters (regex /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      await user.clear(slugInput)
      await user.type(slugInput, '-invalid-')
      expect(within(modal).getByText(/lowercase alphanumeric/i)).toBeInTheDocument()
      expect(submitButton).toBeDisabled()
    })

    it('submits payload to POST /api/organizations, invalidates cache, and automatically navigates to subdomain', async () => {
      const user = userEvent.setup()
      let organizationsFetchCount = 0
      let postPayload: unknown = null
      let authHeader: string | null = null

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
          } as Response)
        }

        if (url.endsWith('/api/organizations') && (!init?.method || init.method.toUpperCase() === 'GET')) {
          organizationsFetchCount++
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 101, name: 'Acme Support', slug: 'acme', role: 'admin', agents_count: 14 },
            ],
          } as Response)
        }

        if (url.endsWith('/api/organizations') && init?.method === 'POST') {
          postPayload = JSON.parse(init.body as string)
          authHeader = (init.headers as Record<string, string>)['Authorization'] || null
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              organization: {
                id: 200,
                name: 'Wayne Enterprises',
                slug: 'wayne-enterprises',
              },
              role: 'admin',
            }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

      await waitFor(() => {
        expect(screen.getByText('Acme Support')).toBeInTheDocument()
      })

      const initialFetchCount = organizationsFetchCount

      // Open modal
      await user.click(screen.getByRole('button', { name: /\+? ?create new organization/i }))
      const modal = screen.getByRole('dialog', { name: /create new organization/i })

      // Fill in org name
      await user.type(within(modal).getByLabelText(/organization name/i), 'Wayne Enterprises')

      // Submit
      const submitButton = within(modal).getByRole('button', { name: /create organization & launch/i })
      await user.click(submitButton)

      await waitFor(() => {
        // Assert payload sent
        expect(postPayload).toEqual({
          name: 'Wayne Enterprises',
          slug: 'wayne-enterprises',
        })
        expect(authHeader).toBe('Bearer valid-token')

        // Assert query cache invalidated (refetched organizations)
        expect(organizationsFetchCount).toBeGreaterThan(initialFetchCount)

        // Assert automatic navigation to tenant subdomain
        expect(window.location.href).toContain('http://wayne-enterprises.localhost:5173')

        // Assert modal closed
        expect(screen.queryByRole('dialog', { name: /create new organization/i })).not.toBeInTheDocument()
      })
    })

    it('handles server-side 422 conflict and displays error in modal', async () => {
      const user = userEvent.setup()

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
          } as Response)
        }

        if (url.endsWith('/api/organizations') && (!init?.method || init.method.toUpperCase() === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response)
        }

        if (url.endsWith('/api/organizations') && init?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 422,
            json: async () => ({
              message: 'The slug has already been taken.',
              errors: {
                slug: ['The slug has already been taken.'],
              },
            }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      renderView('valid-token', { id: 1, name: 'Alex Vance', email: 'alex@example.com' })

      await waitFor(() => {
        expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /\+? ?create new organization/i }))
      const modal = screen.getByRole('dialog', { name: /create new organization/i })

      await user.type(within(modal).getByLabelText(/organization name/i), 'Duplicate Org')
      await user.click(within(modal).getByRole('button', { name: /create organization & launch/i }))

      await waitFor(() => {
        expect(within(modal).getByRole('alert')).toHaveTextContent(/slug has already been taken/i)
      })

      // Navigation should not have occurred
      expect(window.location.href).toBe('http://localhost:5173')
    })
  })
})
