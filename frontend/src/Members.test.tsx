import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { queryClient } from './lib/query-client'

describe('Organization Member Roster & RBAC Inspection Flow', () => {
  const originalFetch = global.fetch

  const mockAdminWorkspace = {
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
  }

  const mockAgentWorkspace = {
    organization: {
      id: 1,
      name: 'Acme Corporation',
      slug: 'acme',
    },
    user: {
      id: 20,
      name: 'Bob Agent',
      email: 'agent@acme.test',
    },
    role: 'agent',
  }

  const mockMembers = [
    {
      id: 1,
      organization_id: 1,
      user_id: 10,
      role: 'admin',
      created_at: '2024-01-15T09:00:00.000000Z',
      user: {
        id: 10,
        name: 'Alice Admin',
        email: 'admin@acme.test',
        avatar_url: null,
      },
    },
    {
      id: 2,
      organization_id: 1,
      user_id: 20,
      role: 'agent',
      created_at: '2024-03-22T14:30:00.000000Z',
      user: {
        id: 20,
        name: 'Bob Agent',
        email: 'agent@acme.test',
        avatar_url: 'https://example.com/bob.jpg',
      },
    },
  ]

  const mockTeams = [
    {
      id: 1,
      organization_id: 1,
      name: 'Support Tier 1',
      description: 'First line support',
      members: [
        {
          id: 2,
          organization_id: 1,
          user_id: 20,
          role: 'agent',
          user: { id: 20, name: 'Bob Agent', email: 'agent@acme.test' },
        },
      ],
    },
  ]

  const mockInvitations = [
    {
      id: 101,
      email: 'pending@acme.test',
      role: 'agent',
      token: 'tok-101',
      expires_at: '2026-10-01T00:00:00.000000Z',
      created_at: '2026-09-20T00:00:00.000000Z',
      invited_by: { id: 10, name: 'Alice Admin', email: 'admin@acme.test' },
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    queryClient.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.location.hostname = 'localhost'
    window.location.pathname = '/'
  })

  function setupFetchMock(workspacePayload: typeof mockAdminWorkspace) {
    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      const urlStr = String(url)

      if (urlStr.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => workspacePayload,
        } as Response)
      }

      if (urlStr.includes('/api/members')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ members: mockMembers }),
        } as Response)
      }

      if (urlStr.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockTeams }),
        } as Response)
      }

      if (urlStr.includes('/api/invitations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ invitations: mockInvitations }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL in test: ${urlStr}`))
    })
  }

  it('renders member roster in compound table with 40px rows, JetBrains Mono tabular figures, Amethyst Violet and Tactical Graphite role badges for admin', async () => {
    window.location.hostname = 'acme.localhost'
    window.location.pathname = '/members'
    localStorage.setItem('zeddesk_token', 'mock-admin-token')
    setupFetchMock(mockAdminWorkspace)

    render(<App hostname="acme.localhost" pathname="/members" />)

    await waitFor(() => {
      expect(screen.getByTestId('members-roster-table')).toBeInTheDocument()
      expect(screen.getByTestId('member-name-1')).toHaveTextContent('Alice Admin')
      expect(screen.getByTestId('member-name-2')).toHaveTextContent('Bob Agent')
    })

    // 40px flush row heights
    const row1 = screen.getByTestId('member-row-1')
    expect(row1).toHaveClass('h-10')
    const row2 = screen.getByTestId('member-row-2')
    expect(row2).toHaveClass('h-10')

    // Names and emails
    expect(screen.getByTestId('member-name-1')).toHaveTextContent('Alice Admin')
    expect(screen.getByTestId('member-email-1')).toHaveTextContent('admin@acme.test')
    expect(screen.getByTestId('member-name-2')).toHaveTextContent('Bob Agent')
    expect(screen.getByTestId('member-email-2')).toHaveTextContent('agent@acme.test')

    // JetBrains Mono tabular figures formatting for join dates with vertical alignment
    const joinDate1 = screen.getByTestId('member-joined-1')
    expect(joinDate1).toHaveClass('tabular-nums')
    expect(joinDate1.closest('td')).toHaveClass('font-mono-data')
    expect(joinDate1.closest('td')).toHaveClass('tabular-nums')
    expect(joinDate1.closest('td')).toHaveClass('align-middle')

    // Role Badges: Admin in Amethyst Violet (#8B5CF6/15 text-[#C4B5FD])
    const adminBadge = screen.getByTestId('member-role-1')
    expect(adminBadge).toHaveTextContent('Admin')
    expect(adminBadge).toHaveClass('bg-[#8B5CF6]/15')
    expect(adminBadge).toHaveClass('text-[#C4B5FD]')

    // Role Badges: Agent in Tactical Graphite (bg-surface-subpanel text-text-secondary)
    const agentBadge = screen.getByTestId('member-role-2')
    expect(agentBadge).toHaveTextContent('Agent')
    expect(agentBadge).toHaveClass('bg-surface-subpanel')
    expect(agentBadge).toHaveClass('text-text-secondary')

    // Administrative controls are rendered for admin
    expect(screen.getByTestId('invite-member-btn')).toBeInTheDocument()
    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument()
    expect(screen.getByTestId('member-actions-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('member-actions-btn-2')).toBeInTheDocument()
  })

  it('enforces strict RBAC visual elision: completely omits administrative action triggers when authenticated as agent', async () => {
    window.location.hostname = 'acme.localhost'
    window.location.pathname = '/members'
    localStorage.setItem('zeddesk_token', 'mock-agent-token')
    setupFetchMock(mockAgentWorkspace)

    render(<App hostname="acme.localhost" pathname="/members" />)

    // Wait for workspace and members to load
    await waitFor(() => {
      expect(screen.getByTestId('members-roster-table')).toBeInTheDocument()
      expect(screen.getByTestId('member-name-1')).toHaveTextContent('Alice Admin')
      expect(screen.getByTestId('member-name-2')).toHaveTextContent('Bob Agent')
    })

    // Strict RBAC: All administrative action triggers are completely absent from the DOM
    expect(screen.queryByTestId('invite-member-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending-invitations-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-2')).not.toBeInTheDocument()
    expect(screen.queryByText(/actions/i)).not.toBeInTheDocument()

    // Administrative navigation sections in sidebar are also omitted for agent
    expect(screen.queryByTestId('nav-admin-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-invitations')).not.toBeInTheDocument()
  })

  it('filters roster members by search input and role filter dropdown', async () => {
    const user = userEvent.setup()
    window.location.hostname = 'acme.localhost'
    window.location.pathname = '/members'
    localStorage.setItem('zeddesk_token', 'mock-admin-token')
    setupFetchMock(mockAdminWorkspace)

    render(<App hostname="acme.localhost" pathname="/members" />)

    await waitFor(() => {
      expect(screen.getByTestId('members-search-input')).toBeInTheDocument()
    })

    // Search query filtering
    const searchInput = screen.getByTestId('members-search-input')
    await user.type(searchInput, 'Bob')

    expect(screen.getByTestId('member-name-2')).toHaveTextContent('Bob Agent')
    expect(screen.queryByTestId('member-name-1')).not.toBeInTheDocument()

    await user.clear(searchInput)
    expect(screen.getByTestId('member-name-1')).toHaveTextContent('Alice Admin')

    // Role filtering
    const roleSelect = screen.getByTestId('members-role-filter')
    fireEvent.change(roleSelect, { target: { value: 'admin' } })

    expect(screen.getByTestId('member-name-1')).toHaveTextContent('Alice Admin')
    expect(screen.queryByTestId('member-name-2')).not.toBeInTheDocument()
  })
})
