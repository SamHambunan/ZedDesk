import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('End-to-End Tenancy & Seeded Baseline Verification', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders seeded acme workspace with admin controls for admin@acme.test', async () => {
    const user = userEvent.setup()
    localStorage.setItem('zeddesk_token', 'seeded-acme-admin-token')

    const mockTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'Support Tier 1',
        description: 'First-tier technical support and ticket triaging',
        created_at: '2026-09-06T10:00:00.000000Z',
        members: [
          {
            id: 2,
            organization_id: 1,
            user_id: 2,
            role: 'agent',
            user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' },
          },
        ],
      },
      {
        id: 2,
        organization_id: 1,
        name: 'Billing Support',
        description: 'Customer billing, subscription, and invoicing support',
        created_at: '2026-09-06T10:00:00.000000Z',
        members: [
          {
            id: 1,
            organization_id: 1,
            user_id: 1,
            role: 'admin',
            user: { id: 1, name: 'Acme Admin', email: 'admin@acme.test' },
          },
          {
            id: 2,
            organization_id: 1,
            user_id: 2,
            role: 'agent',
            user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' },
          },
        ],
      },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
            user: { id: 1, name: 'Acme Admin', email: 'admin@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }

      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockTeams }),
        } as Response)
      }

      if (url.includes('/api/members') || url.includes('/api/organization-members')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            members: [
              { id: 1, organization_id: 1, user_id: 1, role: 'admin', user: { id: 1, name: 'Acme Admin', email: 'admin@acme.test' } },
              { id: 2, organization_id: 1, user_id: 2, role: 'agent', user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' } },
            ],
          }),
        } as Response)
      }

      if (url.includes('/api/invitations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ invitations: [] }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    render(<App hostname="acme.localhost" />)

    // Workspace loads Acme Corporation
    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    expect(screen.getByTestId('workspace-user-name')).toHaveTextContent('Acme Admin')
    expect(screen.getByTestId('workspace-user-role')).toHaveTextContent('admin')

    // Navigate to Team Management
    const teamMgmtNav = screen.getByTestId('nav-team-management')
    await user.click(teamMgmtNav)

    // Team management view should be accessible and seeded teams rendered
    await waitFor(() => {
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('Support Tier 1')
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Billing Support')
    })

    // Admin should see management controls
    expect(screen.getByTestId('create-team-form')).toBeInTheDocument()
    expect(screen.getByTestId('team-name-input')).toBeInTheDocument()
  })

  it('renders seeded acme workspace for agent@acme.test with read-only controls', async () => {
    const user = userEvent.setup()
    localStorage.setItem('zeddesk_token', 'seeded-acme-agent-token')

    const mockTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'Support Tier 1',
        description: 'First-tier technical support and ticket triaging',
        created_at: '2026-09-06T10:00:00.000000Z',
        members: [
          {
            id: 2,
            organization_id: 1,
            user_id: 2,
            role: 'agent',
            user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' },
          },
        ],
      },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
            user: { id: 2, name: 'Acme Agent', email: 'agent@acme.test' },
            role: 'agent',
          }),
        } as Response)
      }

      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockTeams }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    expect(screen.getByTestId('workspace-user-name')).toHaveTextContent('Acme Agent')
    expect(screen.getByTestId('workspace-user-role')).toHaveTextContent('agent')

    // Navigate to Teams
    const teamsNav = screen.getByTestId('nav-teams')
    await user.click(teamsNav)

    // Agent can see team
    await waitFor(() => {
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('Support Tier 1')
    })

    // Agent cannot see team creation form
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('team-name-input')).not.toBeInTheDocument()
  })

  it('displays access denied when an acme user navigates to beta.localhost', async () => {
    localStorage.setItem('zeddesk_token', 'acme-user-token')

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

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    render(<App hostname="beta.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-403')).toBeInTheDocument()
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.getByText('You are not an Organization Member of this Organization.')).toBeInTheDocument()
    })
  })
})
