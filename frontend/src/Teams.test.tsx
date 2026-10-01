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
      expect(screen.getByTestId('teams-tabular-ledger')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
      expect(screen.getByTestId('team-description-1')).toHaveTextContent('First line incident response')
      const countChip = screen.getByTestId('team-member-count-1')
      expect(countChip).toHaveTextContent('1')
      expect(countChip).toHaveClass('tabular-nums')
    })

    // Agent must NOT see team creation button, form, or mutation buttons
    expect(screen.queryByTestId('create-team-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-members-btn-1')).not.toBeInTheDocument()
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

    // Navigate to Teams
    const teamsNav = screen.getByTestId('nav-teams')
    await user.click(teamsNav)

    await waitFor(() => {
      expect(screen.getByTestId('teams-view')).toBeInTheDocument()
      expect(screen.getByTestId('teams-tabular-ledger')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('General Support')
    })

    // Step 1: Create a new Team via compound modal
    await user.click(screen.getByTestId('create-team-btn'))
    await user.type(screen.getByTestId('team-name-input'), 'Escalations Team')
    await user.type(screen.getByTestId('team-description-input'), 'High priority cases')
    await user.click(screen.getByTestId('team-create-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Escalations Team')
    })

    // Step 2: Edit the new Team via EditTeamModal
    await user.click(screen.getByTestId('edit-team-btn-2'))
    const nameEditInput = screen.getByTestId('edit-team-name-input')
    await user.clear(nameEditInput)
    await user.type(nameEditInput, 'Critical Escalations')
    await user.click(screen.getByTestId('save-team-submit-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Critical Escalations')
    })

    // Step 3: Assign Member to Team 1 via TeamInspectorModal autocomplete
    await user.click(screen.getByTestId('manage-members-btn-1'))
    await waitFor(() => {
      expect(screen.getByTestId('inspector-modal-title')).toBeInTheDocument()
    })
    const searchInput = screen.getByTestId('autocomplete-search-input')
    await user.type(searchInput, 'Bob')
    await user.click(screen.getByTestId('assign-member-btn-20'))

    // Step 4: Detach Member from Team 1 in Inspector
    await waitFor(() => {
      expect(screen.getByTestId('subledger-member-20')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('detach-member-btn-20'))

    await waitFor(() => {
      expect(screen.queryByTestId('subledger-member-20')).not.toBeInTheDocument()
    })

    // Close Inspector
    await user.click(screen.getByRole('button', { name: /done/i }))

    // Step 5: Delete Team 2 via DeleteTeamModal
    await user.click(screen.getByTestId('delete-team-btn-2'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-team-btn')).not.toBeDisabled()
    })
    await user.click(screen.getByTestId('confirm-delete-team-btn'))

    await waitFor(() => {
      expect(screen.queryByTestId('team-name-2')).not.toBeInTheDocument()
    })
  }, 15000)

  it('allows admin to view teams tabular ledger, open compound modal, validate inputs, and create a team via POST /api/teams', async () => {
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
          json: async () => ({ members: [] }),
        } as Response)
      }

      if (url.endsWith('/api/teams') && (!init || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockTeams }),
        } as Response)
      }

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

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App hostname="acme.localhost" />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
    })

    // Click Teams nav item to navigate to /teams
    const teamsNav = screen.getByTestId('nav-teams')
    await user.click(teamsNav)

    await waitFor(() => {
      expect(screen.getByTestId('teams-view')).toBeInTheDocument()
      expect(screen.getByTestId('teams-tabular-ledger')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('General Support')
      const countChip = screen.getByTestId('team-member-count-1')
      expect(countChip).toHaveTextContent('1')
      expect(countChip).toHaveClass('tabular-nums')
    })

    // Admin sees "+ Create Team" action button
    const createBtn = screen.getByTestId('create-team-btn')
    expect(createBtn).toBeInTheDocument()

    // Clicking "+ Create Team" opens compound modal
    await user.click(createBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('create-team-form')).toBeInTheDocument()
    })

    // Validate required fields: submit empty name
    const submitBtn = screen.getByTestId('team-create-submit')
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByTestId('team-create-error')).toHaveTextContent(/team name is required/i)
    })

    // Enter valid team info and submit
    await user.type(screen.getByTestId('team-name-input'), 'Customer Success')
    await user.type(screen.getByTestId('team-description-input'), 'Enterprise client onboarding')
    await user.click(submitBtn)

    // Modal closes and new team appears in table
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Customer Success')
      expect(screen.getByTestId('team-description-2')).toHaveTextContent('Enterprise client onboarding')
    })
  }, 15000)

  it('allows admin on /teams view to manage member assignments via compound modal, remove members optimistically, and delete teams with member validation', async () => {
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
      {
        id: 2,
        organization_id: 1,
        name: 'Empty Team',
        description: 'No active members',
        created_at: '2026-09-05T12:30:00.000000Z',
        members: [],
      },
    ]

    const mockOrgMembers = [
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
      {
        id: 30,
        organization_id: 1,
        user_id: 3,
        role: 'agent',
        user: { id: 3, name: 'Charlie Rep', email: 'charlie@acme.test' },
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
          json: async () => ({ members: mockOrgMembers }),
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

      // POST /api/teams/1/members (assign member)
      if (url.includes('/api/teams/1/members') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        const memberToAdd = mockOrgMembers.find((m) => m.id === body.organization_member_id)
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

    // Navigate to /teams
    const teamsNav = screen.getByTestId('nav-teams')
    await user.click(teamsNav)

    await waitFor(() => {
      expect(screen.getByTestId('teams-view')).toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toHaveTextContent('General Support')
      expect(screen.getByTestId('team-name-2')).toHaveTextContent('Empty Team')
      expect(screen.getByTestId('team-member-count-1')).toHaveTextContent('1')
      expect(screen.getByTestId('team-member-count-2')).toHaveTextContent('0')
    })

    // 1. Assign Member via TeamInspectorModal
    const manageBtn = screen.getByTestId('manage-members-btn-1')
    await user.click(manageBtn)

    await waitFor(() => {
      expect(screen.getByTestId('inspector-modal-title')).toHaveTextContent(/general support/i)
    })

    // Verify Bob Agent is in unassigned candidates
    const searchInput = screen.getByTestId('autocomplete-search-input')
    await user.type(searchInput, 'Bob')
    expect(screen.getByTestId('candidate-member-20')).toHaveTextContent('Bob Agent')

    // Click 1-click assign
    await user.click(screen.getByTestId('assign-member-btn-20'))

    // Roster updates
    await waitFor(() => {
      expect(screen.getByTestId('subledger-member-20')).toHaveTextContent('Bob Agent')
      expect(screen.getByTestId('team-member-count-1')).toHaveTextContent('2')
    })

    // 2. Remove Member with 1-click Detach in Inspector
    const detachBtn = screen.getByTestId('detach-member-btn-20')
    await user.click(detachBtn)

    await waitFor(() => {
      expect(screen.queryByTestId('subledger-member-20')).not.toBeInTheDocument()
      expect(screen.getByTestId('team-member-count-1')).toHaveTextContent('1')
    })

    // Close Inspector
    await user.click(screen.getByRole('button', { name: /done/i }))

    // 3. Delete Team with Active Members (Validation prevents deletion)
    await user.click(screen.getByTestId('delete-team-btn-1'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('delete-team-members-warning')).toBeInTheDocument()
      expect(screen.getByTestId('delete-team-members-warning')).toHaveTextContent(/1 active member/i)
      expect(screen.getByTestId('confirm-delete-team-btn')).toBeDisabled()
    })

    // Close modal
    await user.click(screen.getByTestId('cancel-delete-team-btn'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // 4. Delete Empty Team (Team 2)
    await user.click(screen.getByTestId('delete-team-btn-2'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent(/empty team/i)
      expect(screen.getByTestId('confirm-delete-team-btn')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('confirm-delete-team-btn'))

    // Team 2 is deleted and removed from the table
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByTestId('team-name-2')).not.toBeInTheDocument()
      expect(screen.getByTestId('team-name-1')).toBeInTheDocument()
    })
  }, 15000)
})
