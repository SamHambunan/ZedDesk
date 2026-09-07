import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { queryClient } from './lib/query-client'

describe('Tenant Subdomain Workspace Shell', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    queryClient.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    // Reset window.location
    window.location.hostname = 'localhost'
  })

  it('loads workspace shell at tenant subdomain and displays organization name and user profile for admin', async () => {
    window.location.hostname = 'acme.localhost'
    localStorage.setItem('zeddesk_token', 'mock-admin-token')

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/workspace')) {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer mock-admin-token',
        })

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: {
              id: 1,
              name: 'Acme Corporation',
              slug: 'acme',
            },
            user: {
              id: 10,
              name: 'Alice Admin',
              email: 'admin@acme.test',
            },
            role: 'admin',
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
      expect(screen.getByTestId('workspace-slug')).toHaveTextContent('acme')
      expect(screen.getByTestId('workspace-user-name')).toHaveTextContent('Alice Admin')
      expect(screen.getByTestId('workspace-user-email')).toHaveTextContent('admin@acme.test')
      expect(screen.getByTestId('workspace-user-role')).toHaveTextContent(/admin/i)
    })

    // Role-aware navigation: Admin sees administrative sections
    expect(screen.getByTestId('nav-tickets')).toBeInTheDocument()
    expect(screen.getByTestId('nav-teams')).toBeInTheDocument()
    expect(screen.getByTestId('nav-admin-section')).toBeInTheDocument()
    expect(screen.getByTestId('nav-org-settings')).toBeInTheDocument()
    expect(screen.getByTestId('nav-invitations')).toBeInTheDocument()
    expect(screen.getByTestId('nav-team-management')).toBeInTheDocument()
  })

  it('hides administrative navigation sections when user holds agent role', async () => {
    window.location.hostname = 'acme.localhost'
    localStorage.setItem('zeddesk_token', 'mock-agent-token')

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: {
              id: 1,
              name: 'Acme Corporation',
              slug: 'acme',
            },
            user: {
              id: 11,
              name: 'Bob Agent',
              email: 'agent@acme.test',
            },
            role: 'agent',
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
      expect(screen.getByTestId('workspace-user-role')).toHaveTextContent(/agent/i)
    })

    // Common navigation sections are visible
    expect(screen.getByTestId('nav-tickets')).toBeInTheDocument()
    expect(screen.getByTestId('nav-teams')).toBeInTheDocument()

    // Administrative sections must NOT be in the document
    expect(screen.queryByTestId('nav-admin-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-org-settings')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-invitations')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-team-management')).not.toBeInTheDocument()
  })

  it('displays authentication required notice when accessing subdomain without token', async () => {
    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-unauthenticated')).toBeInTheDocument()
      expect(screen.getByText(/authentication required/i)).toBeInTheDocument()
    })
  })

  it('displays access denied message when user is not an organization member (403)', async () => {
    localStorage.setItem('zeddesk_token', 'mock-foreign-token')

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({
            message: 'Forbidden. You are not an Organization Member of this Organization.',
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-403')).toBeInTheDocument()
      expect(screen.getByText(/you are not an organization member/i)).toBeInTheDocument()
    })
  })

  it('displays not found error when organization subdomain does not exist (404)', async () => {
    localStorage.setItem('zeddesk_token', 'mock-token')

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({
            message: 'Organization not found.',
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="nonexistent.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-404')).toBeInTheDocument()
      expect(screen.getByText(/organization not found/i)).toBeInTheDocument()
    })
  })

  it('detects subdomain with port {slug}.localhost:5173 and mounts Workspace Shell with Operational Overview dashboard', async () => {
    localStorage.setItem('zeddesk_token', 'mock-port-admin-token')

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: {
              id: 1,
              name: 'Acme Corp Support',
              slug: 'acme',
            },
            user: {
              id: 10,
              name: 'Alice Admin',
              email: 'admin@acme.test',
            },
            role: 'admin',
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost:5173" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corp Support')
      expect(screen.getByTestId('workspace-slug')).toHaveTextContent('acme')
    })

    // Stitch Screen 58931638cff14be4843b2db8e097606c: Operational Overview Dashboard elements
    expect(screen.getByText('Operational Overview')).toBeInTheDocument()
    expect(screen.getByText('Invite Member')).toBeInTheDocument()

    // Telemetry metric cards
    expect(screen.getByText('Total Members')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('+2 this week')).toBeInTheDocument()
    expect(screen.getByText('Active Teams')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Open Tickets')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('SLA Status')).toBeInTheDocument()
    expect(screen.getByText('99.4%')).toBeInTheDocument()

    // Recent activity & quick routing
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.getByText('Sarah Jenkins joined the workspace.')).toBeInTheDocument()
    expect(screen.getByText('Quick Routing')).toBeInTheDocument()
    expect(screen.getAllByText('Support Tier 1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('12 active agents • 8 tickets open')).toBeInTheDocument()

    // Active route highlight on Overview with 2px #6366F1 border
    const overviewBtn = screen.getByTestId('nav-overview')
    expect(overviewBtn).toHaveClass('border-[#6366F1]')
    expect(overviewBtn).toHaveClass('border-l-2')
  })

  it('ingests token from URL search param (?token=url-token), persists to localStorage, and authenticates workspace', async () => {
    // Ensure localStorage starts empty on this origin
    expect(localStorage.getItem('zeddesk_token')).toBeNull()

    // Simulate arriving with ?token=url-admin-token
    window.location.search = '?token=url-admin-token'

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/workspace')) {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer url-admin-token',
        })

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Handshake', slug: 'acme' },
            user: { id: 10, name: 'Admin Handshake', email: 'admin@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" search="?token=url-admin-token" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Handshake')
      expect(localStorage.getItem('zeddesk_token')).toBe('url-admin-token')
    })

    // Clean up
    window.location.search = ''
  })
})
