import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamsView } from './TeamsView'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Team } from './types'

function renderWithClient(ui: React.ReactElement, client = new QueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TeamsView Component', () => {
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
  ]

  it('renders title, stats, and a responsive grid of Team cards with JetBrains Mono agent counts', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={true} />)

    expect(screen.getByTestId('teams-view-title')).toBeInTheDocument()
    expect(screen.getByTestId('teams-stats')).toHaveTextContent('2')

    // Responsive grid
    const grid = screen.getByTestId('teams-grid')
    expect(grid).toBeInTheDocument()
    expect(grid.className).toContain('grid')

    // Team 1
    expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
    expect(screen.getByTestId('team-description-1')).toHaveTextContent('First line incident response')
    const countChip1 = screen.getByTestId('team-agent-count-1')
    expect(countChip1).toHaveTextContent('1')
    expect(countChip1).toHaveClass('tabular-nums')

    // Team 2
    expect(screen.getByTestId('team-name-2')).toHaveTextContent('Tier 2 Escalations')
    expect(screen.getByTestId('team-description-2')).toHaveTextContent('Complex technical troubleshooting')
    const countChip2 = screen.getByTestId('team-agent-count-2')
    expect(countChip2).toHaveTextContent('2')
    expect(countChip2).toHaveClass('tabular-nums')
  })

  it('displays a preview list of assigned Organization Members on each team card', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={true} />)

    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('Bob Agent')
    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('bob@acme.test')
    expect(screen.getByTestId('team-member-2-21')).toHaveTextContent('Alice Walker')
    expect(screen.getByTestId('team-member-2-22')).toHaveTextContent('Charlie Lead')
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

  it('enforces strict RBAC visual elision: completely omits "+ Create Team" button and modal for agent', () => {
    renderWithClient(<TeamsView teams={mockTeams} isAdmin={false} />)

    // Strict RBAC: All create triggers and modals are completely absent from DOM
    expect(screen.queryByTestId('create-team-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Cards and data are still visible to agent
    expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('Bob Agent')
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
  })
})
