import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamsView } from './TeamsView'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Team, OrganizationMember } from './types'

function renderWithClient(ui: React.ReactElement, client = new QueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TeamsView Component', () => {
  const mockOrgMembers: OrganizationMember[] = [
    {
      id: 20,
      organization_id: 1,
      user_id: 101,
      role: 'agent',
      user: { id: 101, name: 'Bob Agent', email: 'bob@acme.test' },
    },
    {
      id: 21,
      organization_id: 1,
      user_id: 102,
      role: 'agent',
      user: { id: 102, name: 'Alice Walker', email: 'alice@acme.test' },
    },
    {
      id: 22,
      organization_id: 1,
      user_id: 103,
      role: 'admin',
      user: { id: 103, name: 'Charlie Lead', email: 'charlie@acme.test' },
    },
    {
      id: 23,
      organization_id: 1,
      user_id: 104,
      role: 'agent',
      user: { id: 104, name: 'Diana Prince', email: 'diana@acme.test' },
    },
  ]

  const mockTeams: Team[] = [
    {
      id: 1,
      organization_id: 1,
      name: 'Tier 1 Support',
      description: 'First line incident response',
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
    {
      id: 2,
      organization_id: 1,
      name: 'Tier 2 Escalations',
      description: 'Complex technical troubleshooting',
      members: [
        {
          id: 21,
          organization_id: 1,
          user_id: 102,
          role: 'agent',
          user: { id: 102, name: 'Alice Walker', email: 'alice@acme.test' },
        },
        {
          id: 22,
          organization_id: 1,
          user_id: 103,
          role: 'admin',
          user: { id: 103, name: 'Charlie Lead', email: 'charlie@acme.test' },
        },
      ],
    },
    {
      id: 3,
      organization_id: 1,
      name: 'Unassigned Queue',
      description: 'Empty holding team',
      members: [],
    },
  ]

  it('renders title, stats, and a 40px flush data table with JetBrains Mono agent counts', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={true} />)

    expect(screen.getByTestId('teams-view-title')).toBeInTheDocument()
    expect(screen.getByTestId('teams-stats')).toHaveTextContent('3')

    // 40px flush tabular ledger
    const ledger = screen.getByTestId('teams-tabular-ledger')
    expect(ledger).toBeInTheDocument()

    // Team 1
    expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
    expect(screen.getByTestId('team-description-1')).toHaveTextContent('First line incident response')
    const countChip1 = screen.getByTestId('team-member-count-1')
    expect(countChip1).toHaveTextContent('1')
    expect(countChip1).toHaveClass('tabular-nums')

    // Team 2
    expect(screen.getByTestId('team-name-2')).toHaveTextContent('Tier 2 Escalations')
    expect(screen.getByTestId('team-description-2')).toHaveTextContent('Complex technical troubleshooting')
    const countChip2 = screen.getByTestId('team-member-count-2')
    expect(countChip2).toHaveTextContent('2')
    expect(countChip2).toHaveClass('tabular-nums')
  })

  it('displays avatar stacks for assigned members on each team row', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={true} />)

    const stack1 = screen.getByTestId('team-avatar-stack-1')
    expect(stack1).toBeInTheDocument()
    expect(stack1).toHaveTextContent('BA')

    const stack2 = screen.getByTestId('team-avatar-stack-2')
    expect(stack2).toBeInTheDocument()
    expect(stack2).toHaveTextContent('AW')
    expect(stack2).toHaveTextContent('CL')
  })

  it('renders "+ Create Team" action button when isAdmin is true', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={true} />)

    expect(screen.getByTestId('create-team-btn')).toBeInTheDocument()
    expect(screen.getByTestId('create-team-btn')).toHaveTextContent(/create team/i)
  })

  it('opens compound modal when "+ Create Team" is clicked and completes team creation flow', async () => {
    const handleCreateTeam = vi.fn().mockResolvedValue(undefined)
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderWithClient(
      <TeamsView
        teams={mockTeams}
        isAdmin={true}
        onCreateTeam={handleCreateTeam}
      />,
      client
    )

    // Modal is initially not rendered
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Click "+ Create Team"
    fireEvent.click(screen.getByTestId('create-team-btn'))

    // Compound modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('create-team-form')).toBeInTheDocument()

    // Validation: submitting empty name fails without calling API
    fireEvent.submit(screen.getByTestId('create-team-form'))
    expect(handleCreateTeam).not.toHaveBeenCalled()
    expect(screen.getByTestId('team-create-error')).toHaveTextContent(/team name is required/i)

    // Enter valid details and submit
    fireEvent.change(screen.getByTestId('team-name-input'), {
      target: { value: 'Infrastructure Ops' },
    })
    fireEvent.change(screen.getByTestId('team-description-input'), {
      target: { value: 'Cloud infrastructure and uptime' },
    })
    fireEvent.submit(screen.getByTestId('create-team-form'))

    await waitFor(() => {
      expect(handleCreateTeam).toHaveBeenCalledWith({
        name: 'Infrastructure Ops',
        description: 'Cloud infrastructure and uptime',
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams'] })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens TeamInspectorModal from Manage Members action button and assigns member via autocomplete', async () => {
    const handleAssignMember = vi.fn().mockResolvedValue(undefined)
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderWithClient(
      <TeamsView
        teams={mockTeams}
        orgMembers={mockOrgMembers}
        isAdmin={true}
        onAssignMember={handleAssignMember}
      />,
      client
    )

    // Click "Members" action on Team 1 (Tier 1 Support)
    const manageBtn = screen.getByTestId('manage-members-btn-1')
    fireEvent.click(manageBtn)

    // Team Inspector modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-modal-title')).toHaveTextContent(/tier 1 support/i)

    // Autocomplete search input
    const searchInput = screen.getByTestId('autocomplete-search-input')
    expect(searchInput).toBeInTheDocument()

    // Diana Prince (id: 23) is unassigned for Team 1
    const candidateDiana = screen.getByTestId('candidate-member-23')
    expect(candidateDiana).toHaveTextContent('Diana Prince')

    // Click 1-click assign
    const assignBtn = screen.getByTestId('assign-member-btn-23')
    fireEvent.click(assignBtn)

    await waitFor(() => {
      expect(handleAssignMember).toHaveBeenCalledWith(1, 23)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams'] })
    })
  })

  it('triggers "Remove Member" action and detaches member from team in TeamInspectorModal', async () => {
    const handleRemoveMember = vi.fn().mockResolvedValue(undefined)

    renderWithClient(
      <TeamsView
        teams={mockTeams}
        orgMembers={mockOrgMembers}
        isAdmin={true}
        onRemoveMember={handleRemoveMember}
      />
    )

    // Click avatar stack to inspect Team 1
    fireEvent.click(screen.getByTestId('team-avatar-stack-1'))

    // Subledger shows Bob Agent (id: 20) with 1-click Detach button
    expect(screen.getByTestId('subledger-member-20')).toHaveTextContent('Bob Agent')
    const detachBtn = screen.getByTestId('detach-member-btn-20')
    expect(detachBtn).toBeInTheDocument()

    fireEvent.click(detachBtn)

    await waitFor(() => {
      expect(handleRemoveMember).toHaveBeenCalledWith(1, 20)
    })
  })

  it('opens "Delete Team" modal and deletes empty team with query cache invalidation', async () => {
    const handleDelete = vi.fn().mockResolvedValue(undefined)
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderWithClient(
      <TeamsView
        teams={mockTeams}
        isAdmin={true}
        onDelete={handleDelete}
      />,
      client
    )

    // Modal initially not open
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Team 3 is empty (0 members)
    fireEvent.click(screen.getByTestId('delete-team-btn-3'))

    // Delete Team compound modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('delete-team-title')).toBeInTheDocument()
    expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent(/unassigned queue/i)
    expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent(
      /this team has no assigned members/i
    )

    const confirmBtn = screen.getByTestId('confirm-delete-team-btn')
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledWith(3)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams'] })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens "Delete Team" modal for team with active members, displays warning, and prevents deletion', () => {
    const handleDelete = vi.fn()

    renderWithClient(
      <TeamsView
        teams={mockTeams}
        isAdmin={true}
        onDelete={handleDelete}
      />
    )

    // Team 2 has 2 active members
    fireEvent.click(screen.getByTestId('delete-team-btn-2'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const warning = screen.getByTestId('delete-team-members-warning')
    expect(warning).toBeInTheDocument()
    expect(warning).toHaveTextContent(/2 active members/i)
    expect(warning).toHaveTextContent(/reassign/i)

    const confirmBtn = screen.getByTestId('confirm-delete-team-btn')
    expect(confirmBtn).toBeDisabled()

    fireEvent.click(confirmBtn)
    expect(handleDelete).not.toHaveBeenCalled()
  })

  it('enforces strict RBAC: "+ Create Team", "Members", "Edit", and "Delete" are completely absent from DOM for agent', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={false} />)

    // Strict RBAC: All mutation triggers are completely omitted
    expect(screen.queryByTestId('create-team-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-members-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-3')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Table rows are still visible in read-only mode
    expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
    expect(screen.getByTestId('team-member-count-1')).toHaveTextContent('1')
  })

  it('correctly resolves role-based authorization from WorkspaceShellContext when isAdmin is omitted', () => {
    // When role is agent
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceShellContext.Provider
          value={
            {
              organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
              user: { id: 101, name: 'Bob Agent', email: 'bob@acme.test' },
              role: 'agent',
              subdomain: 'acme',
              token: 'agent-token',
              isSidebarCollapsed: false,
              toggleSidebar: () => {},
              setSidebarCollapsed: () => {},
              activeRoute: 'teams',
              apiUrl: 'http://localhost:8000',
              organizations: [],
            } as any
          }
        >
          <TeamsView teams={mockTeams} />
        </WorkspaceShellContext.Provider>
      </QueryClientProvider>
    )

    expect(screen.queryByTestId('create-team-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-members-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()

    // When role is admin
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceShellContext.Provider
          value={
            {
              organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
              user: { id: 103, name: 'Charlie Lead', email: 'charlie@acme.test' },
              role: 'admin',
              subdomain: 'acme',
              token: 'admin-token',
              isSidebarCollapsed: false,
              toggleSidebar: () => {},
              setSidebarCollapsed: () => {},
              activeRoute: 'teams',
              apiUrl: 'http://localhost:8000',
              organizations: [],
            } as any
          }
        >
          <TeamsView teams={mockTeams} />
        </WorkspaceShellContext.Provider>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('create-team-btn')).toBeInTheDocument()
    expect(screen.getByTestId('manage-members-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-team-btn-1')).toBeInTheDocument()
  })
})
