import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamsTabularLedger } from './components/teams/TeamsTabularLedger'
import { TeamInspectorModal } from './components/teams/TeamInspectorModal'
import { EditTeamModal } from './components/teams/EditTeamModal'
import { DeleteTeamModal } from './components/teams/DeleteTeamModal'
import type { Team, OrganizationMember } from './components/teams/types'

function renderWithClient(ui: React.ReactElement, client = new QueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockOrgMembers: OrganizationMember[] = [
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
    user: { id: 3, name: 'Charlie Dave', email: 'charlie@acme.test' },
  },
  {
    id: 40,
    organization_id: 1,
    user_id: 4,
    role: 'agent',
    user: { id: 4, name: 'Dana Evans', email: 'dana@acme.test' },
  },
  {
    id: 50,
    organization_id: 1,
    user_id: 5,
    role: 'agent',
    user: { id: 5, name: 'Edward Fox', email: 'edward@acme.test' },
  },
]

const mockTeams: Team[] = [
  {
    id: 1,
    organization_id: 1,
    name: 'Tier 1 Triage',
    description: 'First response and general queue',
    members: [
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
        user: { id: 3, name: 'Charlie Dave', email: 'charlie@acme.test' },
      },
      {
        id: 40,
        organization_id: 1,
        user_id: 4,
        role: 'agent',
        user: { id: 4, name: 'Dana Evans', email: 'dana@acme.test' },
      },
    ],
  },
  {
    id: 2,
    organization_id: 1,
    name: 'Tier 2 Escalations',
    description: 'Complex technical troubleshooting',
    members: [
      {
        id: 50,
        organization_id: 1,
        user_id: 5,
        role: 'agent',
        user: { id: 5, name: 'Edward Fox', email: 'edward@acme.test' },
      },
    ],
  },
  {
    id: 3,
    organization_id: 1,
    name: 'Unassigned Holding',
    description: 'Standby pool with no active agents',
    members: [],
  },
]

describe('TeamsTabularLedger Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 40px flush data table with required columns: Team Name, Routing Description, Avatar Stack, Tabular Member Count, and Actions Menu', () => {
    renderWithClient(
      <TeamsTabularLedger
        teams={mockTeams}
        orgMembers={mockOrgMembers}
        isAdmin={true}
      />
    )

    // Verify table root
    const table = screen.getByTestId('teams-tabular-ledger')
    expect(table).toBeInTheDocument()

    // Verify column headers
    expect(screen.getByRole('columnheader', { name: 'Team Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Routing Description' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Assigned Agents' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()

    // Verify Row 1: Tier 1 Triage
    const row1 = screen.getByTestId('team-row-1')
    expect(row1).toBeInTheDocument()
    expect(within(row1).getByTestId('team-name-1')).toHaveTextContent('Tier 1 Triage')
    expect(within(row1).getByTestId('team-description-1')).toHaveTextContent('First response and general queue')

    // Tabular member count with JetBrains Mono tabular-nums
    const count1 = within(row1).getByTestId('team-member-count-1')
    expect(count1).toHaveTextContent('4')
    expect(count1).toHaveClass('tabular-nums')

    // Avatar stack with [AA][BA] and overflow +2
    const avatarStack1 = within(row1).getByTestId('team-avatar-stack-1')
    expect(avatarStack1).toBeInTheDocument()
    expect(within(avatarStack1).getByText('AA')).toBeInTheDocument()
    expect(within(avatarStack1).getByText('BA')).toBeInTheDocument()
    expect(within(avatarStack1).getByText('+2')).toBeInTheDocument()

    // Row 2: Tier 2 Escalations (1 member: EF)
    const row2 = screen.getByTestId('team-row-2')
    expect(within(row2).getByTestId('team-name-2')).toHaveTextContent('Tier 2 Escalations')
    expect(within(row2).getByTestId('team-member-count-2')).toHaveTextContent('1')
    const avatarStack2 = within(row2).getByTestId('team-avatar-stack-2')
    expect(within(avatarStack2).getByText('EF')).toBeInTheDocument()

    // Row 3: Unassigned Holding (0 members)
    const row3 = screen.getByTestId('team-row-3')
    expect(within(row3).getByTestId('team-name-3')).toHaveTextContent('Unassigned Holding')
    expect(within(row3).getByTestId('team-member-count-3')).toHaveTextContent('0')
  })

  it('opens TeamInspectorModal when clicking avatar stack or selecting Manage Members', async () => {
    const user = userEvent.setup()
    const handleInspect = vi.fn()

    renderWithClient(
      <TeamsTabularLedger
        teams={mockTeams}
        orgMembers={mockOrgMembers}
        isAdmin={true}
        onInspectTeam={handleInspect}
      />
    )

    // Click avatar stack on Team 1
    const avatarBtn = screen.getByTestId('team-avatar-stack-1')
    await user.click(avatarBtn)
    expect(handleInspect).toHaveBeenCalledWith(mockTeams[0])

    // Click "Manage Members" on Team 2
    const manageBtn = screen.getByTestId('manage-members-btn-2')
    await user.click(manageBtn)
    expect(handleInspect).toHaveBeenCalledWith(mockTeams[1])
  })

  it('renders TeamInspectorModal with subledger of assigned members and unassigned autocomplete', () => {
    renderWithClient(
      <TeamInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[0]}
        orgMembers={mockOrgMembers}
        isAdmin={true}
      />
    )

    expect(screen.getByTestId('inspector-modal-title')).toHaveTextContent('Team Inspector: Tier 1 Triage')
    expect(screen.getByTestId('inspector-modal-desc')).toHaveTextContent('First response and general queue')
    expect(screen.getByTestId('inspector-member-count')).toHaveTextContent('4')

    // Subledger rows
    expect(screen.getByTestId('subledger-member-10')).toHaveTextContent('Alice Admin')
    expect(screen.getByTestId('subledger-member-20')).toHaveTextContent('Bob Agent')
    expect(screen.getByTestId('subledger-member-30')).toHaveTextContent('Charlie Dave')
    expect(screen.getByTestId('subledger-member-40')).toHaveTextContent('Dana Evans')

    // 1-click Detach buttons
    expect(screen.getByTestId('detach-member-btn-10')).toBeInTheDocument()
    expect(screen.getByTestId('detach-member-btn-20')).toBeInTheDocument()

    // Autocomplete for unassigned members: Only Edward Fox (id: 50) is unassigned for Team 1
    const autocompleteInput = screen.getByTestId('autocomplete-search-input')
    expect(autocompleteInput).toBeInTheDocument()
    expect(screen.getByTestId('candidate-member-50')).toHaveTextContent('Edward Fox')
    expect(screen.getByTestId('assign-member-btn-50')).toBeInTheDocument()
  })

  it('triggers onDetachMember when 1-click Detach button is clicked in TeamInspectorModal', async () => {
    const user = userEvent.setup()
    const handleDetach = vi.fn()

    renderWithClient(
      <TeamInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[0]}
        orgMembers={mockOrgMembers}
        isAdmin={true}
        onDetachMember={handleDetach}
      />
    )

    const detachBtn = screen.getByTestId('detach-member-btn-20')
    await user.click(detachBtn)

    expect(handleDetach).toHaveBeenCalledTimes(1)
    expect(handleDetach).toHaveBeenCalledWith(1, 20)
  })

  it('filters unassigned members by query and triggers onAssignMember with 1 click in TeamInspectorModal', async () => {
    const user = userEvent.setup()
    const handleAssign = vi.fn()

    // Team 2 has only Edward Fox (id: 50) assigned.
    // Unassigned members: Alice Admin (10), Bob Agent (20), Charlie Dave (30), Dana Evans (40).
    renderWithClient(
      <TeamInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[1]}
        orgMembers={mockOrgMembers}
        isAdmin={true}
        onAssignMember={handleAssign}
      />
    )

    const input = screen.getByTestId('autocomplete-search-input')
    await user.type(input, 'Dana')

    // Dana Evans should be displayed, Bob Agent should be filtered out
    expect(screen.getByTestId('candidate-member-40')).toHaveTextContent('Dana Evans')
    expect(screen.queryByTestId('candidate-member-20')).not.toBeInTheDocument()

    // Click "Assign" button
    const assignBtn = screen.getByTestId('assign-member-btn-40')
    await user.click(assignBtn)

    expect(handleAssign).toHaveBeenCalledTimes(1)
    expect(handleAssign).toHaveBeenCalledWith(2, 40)
  })

  it('supports modal-driven team updates via EditTeamModal, without inline table inputs', async () => {
    const user = userEvent.setup()
    const handleSave = vi.fn()

    renderWithClient(
      <EditTeamModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[0]}
        onSave={handleSave}
      />
    )

    expect(screen.getByTestId('edit-team-modal-title')).toHaveTextContent('Edit Team')
    const nameInput = screen.getByTestId('edit-team-name-input')
    const descInput = screen.getByTestId('edit-team-desc-input')

    expect(nameInput).toHaveValue('Tier 1 Triage')
    expect(descInput).toHaveValue('First response and general queue')

    await user.clear(nameInput)
    await user.type(nameInput, 'Tier 1 Rapid Triage')
    await user.click(screen.getByTestId('save-team-submit-btn'))

    expect(handleSave).toHaveBeenCalledWith(1, {
      name: 'Tier 1 Rapid Triage',
      description: 'First response and general queue',
    })
  })

  it('strictly omits administrative mutation controls from the DOM when user is an agent', () => {
    renderWithClient(
      <TeamsTabularLedger
        teams={mockTeams}
        orgMembers={mockOrgMembers}
        isAdmin={false}
      />
    )

    // Admin mutation controls must be completely absent from the DOM
    expect(screen.queryByTestId('manage-members-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-members-btn-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()

    // Also assert within TeamInspectorModal that Detach buttons and Assign autocomplete are omitted
    renderWithClient(
      <TeamInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[0]}
        orgMembers={mockOrgMembers}
        isAdmin={false}
      />
    )

    expect(screen.queryByTestId('detach-member-btn-10')).not.toBeInTheDocument()
    expect(screen.queryByTestId('detach-member-btn-20')).not.toBeInTheDocument()
    expect(screen.queryByTestId('inspector-assign-autocomplete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('autocomplete-search-input')).not.toBeInTheDocument()
  })

  it('confirms deletion for empty teams and displays warning preventing deletion for teams with members', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    // 1. Team with members (Team 1)
    const { unmount } = renderWithClient(
      <DeleteTeamModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[0]}
        onConfirm={handleDelete}
      />
    )

    expect(screen.getByTestId('delete-team-members-warning')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-delete-team-btn')).toBeDisabled()

    unmount()

    // 2. Empty team (Team 3: Unassigned Holding)
    renderWithClient(
      <DeleteTeamModal
        isOpen={true}
        onClose={vi.fn()}
        team={mockTeams[2]}
        onConfirm={handleDelete}
      />
    )

    expect(screen.queryByTestId('delete-team-members-warning')).not.toBeInTheDocument()
    expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent('Unassigned Holding')
    const confirmBtn = screen.getByTestId('confirm-delete-team-btn')
    expect(confirmBtn).not.toBeDisabled()

    await user.click(confirmBtn)
    expect(handleDelete).toHaveBeenCalledWith(3)
  })
})

describe('Live Wiring on {slug}.localhost:5173/teams via WorkspaceShell', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('wires 40px tabular ledger into WorkspaceShell on /teams and omits admin mutation controls for agents', async () => {
    localStorage.setItem('zeddesk_token', 'mock-agent-token')

    const mockLiveTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'First Response',
        description: 'Triage and dispatching queue',
        members: [
          {
            id: 201,
            organization_id: 1,
            user_id: 2,
            role: 'agent',
            user: { id: 2, name: 'Agent Smith', email: 'smith@acme.test' },
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
            organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
            user: { id: 2, name: 'Agent Smith', email: 'smith@acme.test' },
            role: 'agent',
          }),
        } as Response)
      }
      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: mockLiveTeams }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    const { default: App } = await import('./App')
    render(<App hostname="acme.localhost" pathname="/teams" />)

    // Wait for workspace and teams table to render
    await screen.findByTestId('teams-tabular-ledger')

    // Table rows render 40px flush columns
    expect(screen.getByTestId('team-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('team-name-1')).toHaveTextContent('First Response')
    expect(screen.getByTestId('team-description-1')).toHaveTextContent('Triage and dispatching queue')
    expect(screen.getByTestId('team-member-count-1')).toHaveTextContent('1')

    // Deprecated floating card grid and inline inputs are permanently purged
    expect(screen.queryByTestId('teams-grid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-name-input-1')).not.toBeInTheDocument()

    // Agent RBAC: Admin mutation controls are completely absent from the DOM
    expect(screen.queryByTestId('create-team-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-members-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()
  })

  it('allows admin on /teams to open TeamInspectorModal, detach members, assign unassigned members, and edit team via modals', async () => {
    const user = userEvent.setup()
    localStorage.setItem('zeddesk_token', 'mock-admin-token')

    let liveTeams = [
      {
        id: 1,
        organization_id: 1,
        name: 'Tier 1 Support',
        description: 'Customer triage',
        members: [
          {
            id: 101,
            organization_id: 1,
            user_id: 1,
            role: 'admin',
            user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
          },
          {
            id: 102,
            organization_id: 1,
            user_id: 2,
            role: 'agent',
            user: { id: 2, name: 'Bob Agent', email: 'bob@acme.test' },
          },
        ],
      },
    ]

    const liveOrgMembers = [
      {
        id: 101,
        organization_id: 1,
        user_id: 1,
        role: 'admin',
        user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
      },
      {
        id: 102,
        organization_id: 1,
        user_id: 2,
        role: 'agent',
        user: { id: 2, name: 'Bob Agent', email: 'bob@acme.test' },
      },
      {
        id: 103,
        organization_id: 1,
        user_id: 3,
        role: 'agent',
        user: { id: 3, name: 'Charlie Lead', email: 'charlie@acme.test' },
      },
    ]

    let detachCalled = false
    let assignCalled = false
    let editCalled = false

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
            user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }
      if (url.includes('/api/members')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ members: liveOrgMembers }),
        } as Response)
      }
      if (url.endsWith('/api/teams') && (!init || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ teams: liveTeams }),
        } as Response)
      }
      // Detach member DELETE /api/teams/1/members/102
      if (url.includes('/api/teams/1/members/102') && init?.method === 'DELETE') {
        detachCalled = true
        liveTeams[0].members = liveTeams[0].members.filter((m) => m.id !== 102)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Member detached.' }),
        } as Response)
      }
      // Assign member POST /api/teams/1/members
      if (url.includes('/api/teams/1/members') && init?.method === 'POST') {
        assignCalled = true
        const body = JSON.parse(init.body as string)
        const added = liveOrgMembers.find((m) => m.id === body.organization_member_id)
        if (added) liveTeams[0].members.push(added)
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ message: 'Member assigned.', team: liveTeams[0] }),
        } as Response)
      }
      // Edit team PUT /api/teams/1
      if (url.includes('/api/teams/1') && init?.method === 'PUT') {
        editCalled = true
        const body = JSON.parse(init.body as string)
        liveTeams[0].name = body.name
        liveTeams[0].description = body.description
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Team updated.', team: liveTeams[0] }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    const { default: App } = await import('./App')
    render(<App hostname="acme.localhost" pathname="/teams" />)

    await screen.findByTestId('teams-tabular-ledger')
    expect(screen.getByTestId('create-team-btn')).toBeInTheDocument()

    // 1. Click avatar stack to open TeamInspectorModal
    await user.click(screen.getByTestId('team-avatar-stack-1'))
    expect(await screen.findByTestId('inspector-modal-title')).toHaveTextContent('Team Inspector: Tier 1 Support')
    expect(screen.getByTestId('subledger-member-102')).toHaveTextContent('Bob Agent')

    // 2. 1-click Detach Bob Agent
    await user.click(screen.getByTestId('detach-member-btn-102'))
    expect(detachCalled).toBe(true)

    // 3. Autocomplete search and 1-click Assign Charlie Lead
    const searchInput = screen.getByTestId('autocomplete-search-input')
    await user.type(searchInput, 'Charlie')
    expect(screen.getByTestId('candidate-member-103')).toHaveTextContent('Charlie Lead')
    await user.click(screen.getByTestId('assign-member-btn-103'))
    expect(assignCalled).toBe(true)

    // Close Inspector
    await user.click(screen.getByRole('button', { name: /close modal/i }))

    // 4. Edit Team via EditTeamModal
    await user.click(screen.getByTestId('edit-team-btn-1'))
    expect(await screen.findByTestId('edit-team-modal-title')).toBeInTheDocument()
    const nameInput = screen.getByTestId('edit-team-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Global Triage Network')
    await user.click(screen.getByTestId('save-team-submit-btn'))
    expect(editCalled).toBe(true)
  })
})


