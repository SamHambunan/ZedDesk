import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TeamCard } from './TeamCard'
import type { Team } from './types'

describe('TeamCard Component', () => {
  const mockTeam: Team = {
    id: 1,
    organization_id: 1,
    name: 'Tier 1 Support',
    description: 'First line incident response and triage',
    members: [
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
        role: 'admin',
        user: { id: 102, name: 'Alice Walker', email: 'alice@acme.test' },
      },
    ],
  }

  it('renders team name, description, and agent count chip with JetBrains Mono tabular figures', () => {
    render(<TeamCard team={mockTeam} isAdmin={false} />)

    expect(screen.getByTestId('team-name-1')).toHaveTextContent('Tier 1 Support')
    expect(screen.getByTestId('team-description-1')).toHaveTextContent('First line incident response and triage')

    const countChip = screen.getByTestId('team-agent-count-1')
    expect(countChip).toHaveTextContent('2')
    expect(countChip).toHaveClass('tabular-nums')
    expect(countChip.className).toMatch(/font-mono|JetBrains/)
  })

  it('displays preview list of assigned Organization Members with role badges', () => {
    render(<TeamCard team={mockTeam} isAdmin={false} />)

    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('Bob Agent')
    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent('bob@acme.test')
    expect(screen.getByTestId('team-member-1-20')).toHaveTextContent(/agent/i)

    expect(screen.getByTestId('team-member-1-21')).toHaveTextContent('Alice Walker')
    expect(screen.getByTestId('team-member-1-21')).toHaveTextContent(/admin/i)
  })

  it('enforces RBAC: omits mutation actions when isAdmin is false', () => {
    render(<TeamCard team={mockTeam} isAdmin={false} />)

    expect(screen.queryByTestId('edit-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-team-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-member-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-member-btn-1-20')).not.toBeInTheDocument()
  })

  it('renders management controls when isAdmin is true', () => {
    render(
      <TeamCard
        team={mockTeam}
        isAdmin={true}
        orgMembers={[]}
      />
    )

    expect(screen.getByTestId('edit-team-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-team-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('add-member-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('remove-member-btn-1-20')).toBeInTheDocument()
  })

  it('renders "+ Assign Member" action and triggers onOpenAssignModal for admin', () => {
    const handleOpenAssignModal = vi.fn()
    render(
      <TeamCard
        team={mockTeam}
        isAdmin={true}
        onOpenAssignModal={handleOpenAssignModal}
      />
    )

    const assignBtn = screen.getByTestId('add-member-btn-1')
    expect(assignBtn).toHaveTextContent(/assign member/i)

    fireEvent.click(assignBtn)
    expect(handleOpenAssignModal).toHaveBeenCalledWith(mockTeam)
  })

  it('triggers onOpenDeleteModal when delete button is clicked and callback is provided', () => {
    const handleOpenDeleteModal = vi.fn()
    render(
      <TeamCard
        team={mockTeam}
        isAdmin={true}
        onOpenDeleteModal={handleOpenDeleteModal}
      />
    )

    fireEvent.click(screen.getByTestId('delete-team-btn-1'))
    expect(handleOpenDeleteModal).toHaveBeenCalledWith(mockTeam)
  })
})
