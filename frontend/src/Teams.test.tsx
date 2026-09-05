import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('Workspace Teams and Member Assignment', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.location.hostname = 'localhost'
    window.location.pathname = '/'
  })

  it('allows agent to view teams and members in read-only mode without mutation controls', async () => {
    const user = userEvent.setup()
    window.location.hostname = 'acme.localhost'
    localStorage.setItem('zeddesk_token', 'mock-agent-token')

    const mockTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'Tier 1 Support',
        description: 'First line incident response',
        created_at: '2026-09-05T12:00:00.000000Z',
        members: [
          {
            id: 20,
            organization_id: 1,
            user_id: 101,
            role: 'agent',
            user: { id: 101, name: 'Bob Agent', email: 'bob@acme.test' },
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
            user: { id: 101, name: 'Bob Agent', email: 'bob@acme.test' },
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

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    // Click Teams nav item
    const teamsNav = screen.getByTestId('nav-teams')
    await user.click(teamsNav)

    await waitFor(() => {
      expect(screen.getByTestId('teams-view')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
      expect(screen.getByTestId('team-description-1')).toHaveTextContent('First line incident response')
      expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('Bob Agent')
      expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('bob@acme.test')
    })

    // Agent must NOT see team creation form or mutation buttons
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-member-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-member-btn-1-20')).not.toBeInTheDocument()
  })

  it('allows admin to view, create, edit, delete teams and manage member assignments', async () => {
    const user = userEvent.setup()
    window.location.hostname = 'acme.localhost'
    localStorage.setItem('zeddesk_token', 'mock-admin-token')

    let mockTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'General Support',
        description: 'Default customer support team',
        created_at: '2026-09-05T12:00:00.000000Z',
        members: [
          {
            id: 10,
            organization_id: 1,
            user_id: 1,
            role: 'admin',
            user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
          },
        ],
      },
    ]

    const mockMembers = [
      {
        id: 10,
        organization_id: 1,
        user_id: 1,
        role: 'admin',
        user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
      },
      {
        id: 20,
        organization_id: 1,
        user_id: 2,
        role: 'agent',
        user: { id: 2, name: 'Bob Agent', email: 'bob@acme.test' },
      },
    ]

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
            user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }

      if (url.includes('/api/members')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ members: mockMembers }),
        } as Response)
      }

      // GET /api/teams
      if (url.endsWith('/api/teams') && (!init || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockTeams }),
        } as Response)
      }

      // POST /api/teams (create team)
      if (url.endsWith('/api/teams') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        const newTeam = {
          id: 2,
          organization_id: 1,
          name: body.name,
          description: body.description || null,
          created_at: '2026-09-05T12:30:00.000000Z',
          members: [],
        }
        mockTeams.push(newTeam)
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ message: 'Team created successfully.', team: newTeam }),
        } as Response)
      }

      // PUT /api/teams/2 (update team)
      if (url.includes('/api/teams/2') && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string)
        const target = mockTeams.find((t) => t.id === 2)
        if (target) {
          target.name = body.name
          target.description = body.description
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Team updated successfully.', team: target }),
        } as Response)
      }

      // POST /api/teams/1/members (assign member)
      if (url.includes('/api/teams/1/members') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        const memberToAdd = mockMembers.find((m) => m.id === body.organization_member_id)
        const targetTeam = mockTeams.find((t) => t.id === 1)
        if (targetTeam && memberToAdd) {
          targetTeam.members.push(memberToAdd)
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ message: 'Member added to team successfully.', team: targetTeam }),
        } as Response)
      }

      // DELETE /api/teams/1/members/20 (remove member)
      if (url.includes('/api/teams/1/members/20') && init?.method === 'DELETE') {
        const targetTeam = mockTeams.find((t) => t.id === 1)
        if (targetTeam) {
          targetTeam.members = targetTeam.members.filter((m) => m.id !== 20)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Member removed from team successfully.', team: targetTeam }),
        } as Response)
      }

      // DELETE /api/teams/2 (delete team)
      if (url.includes('/api/teams/2') && init?.method === 'DELETE') {
        mockTeams = mockTeams.filter((t) => t.id !== 2)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Team deleted successfully.' }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    // Navigate to Team Management
    const teamMgmtNav = screen.getByTestId('nav-team-management')
    await user.click(teamMgmtNav)

    await waitFor(() => {
      expect(screen.getByTestId('team-management-view')).toBeInTheDocument()
      expect(screen.getByTestId('create-team-form')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('General Support')
    })

    // Step 1: Create a new Team
    await user.type(screen.getByTestId('team-name-input'), 'Escalations Team')
    await user.type(screen.getByTestId('team-description-input'), 'High priority cases')
    await user.click(screen.getByTestId('team-create-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('team-create-success')).toHaveTextContent(/team created successfully/i)
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Escalations Team')
    })

    // Step 2: Edit the new Team
    await user.click(screen.getByTestId('edit-team-btn-2'))
    const nameEditInput = screen.getByTestId('edit-team-name-input-2')
    await user.clear(nameEditInput)
    await user.type(nameEditInput, 'Critical Escalations')
    await user.click(screen.getByTestId('save-team-btn-2'))

    await waitFor(() => {
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Critical Escalations')
    })

    // Step 3: Assign Member to Team 1
    const memberSelect = screen.getByTestId('add-member-select-1')
    await user.selectOptions(memberSelect, '20')
    await user.click(screen.getByTestId('add-member-btn-1'))

    await waitFor(() => {
      expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('Bob Agent')
    })

    // Step 4: Remove Member from Team 1
    await user.click(screen.getByTestId('remove-member-btn-1-20'))

    await waitFor(() => {
      expect(screen.queryByTestId('team-member-1-20')).not.toBeInTheDocument()
    })

    // Step 5: Delete Team 2
    await user.click(screen.getByTestId('delete-team-btn-2'))

    await waitFor(() => {
      expect(screen.queryByTestId('team-name-2')).not.toBeInTheDocument()
    })
  })
})
