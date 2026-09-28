import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DeleteTeamModal } from './DeleteTeamModal'
import type { Team } from './types'

describe('DeleteTeamModal Component', () => {
  const emptyTeam: Team = {
    id: 10,
    organization_id: 1,
    name: 'Empty Team',
    description: 'No members assigned',
    members: [],
  }

  const teamWithMembers: Team = {
    id: 11,
    organization_id: 1,
    name: 'Active Support',
    description: 'Frontline support',
    members: [
      {
        id: 101,
        organization_id: 1,
        user_id: 1,
        role: 'agent',
        user: { id: 1, name: 'Agent Alice', email: 'alice@example.com' },
      },
      {
        id: 102,
        organization_id: 1,
        user_id: 2,
        role: 'agent',
        user: { id: 2, name: 'Agent Bob', email: 'bob@example.com' },
      },
    ],
  }

  it('does not render modal when isOpen is false', () => {
    render(<DeleteTeamModal isOpen={false} team={emptyTeam} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders confirmation text when team has 0 members and confirms deletion', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <DeleteTeamModal
        isOpen={true}
        team={emptyTeam}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('delete-team-title')).toHaveTextContent(/delete team/i)
    expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent(
      /this team has no assigned members/i
    )
    expect(screen.getByTestId('delete-team-confirmation-text')).toHaveTextContent('Empty Team')

    const confirmBtn = screen.getByTestId('confirm-delete-team-btn')
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith(10)
    })
  })

  it('displays warning and prevents deletion when team has active members', () => {
    const handleConfirm = vi.fn()

    render(
      <DeleteTeamModal
        isOpen={true}
        team={teamWithMembers}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const warning = screen.getByTestId('delete-team-members-warning')
    expect(warning).toBeInTheDocument()
    expect(warning).toHaveTextContent(/2 active member/i)
    expect(warning).toHaveTextContent(/reassign/i)

    const confirmBtn = screen.getByTestId('confirm-delete-team-btn')
    expect(confirmBtn).toBeDisabled()

    fireEvent.click(confirmBtn)
    expect(handleConfirm).not.toHaveBeenCalled()
  })

  it('displays error message when error prop is provided', () => {
    render(
      <DeleteTeamModal
        isOpen={true}
        team={emptyTeam}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        error="Failed to delete team due to server error."
      />
    )

    expect(screen.getByTestId('delete-team-error')).toHaveTextContent(
      'Failed to delete team due to server error.'
    )
  })

  it('calls onClose when cancel button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <DeleteTeamModal
        isOpen={true}
        team={emptyTeam}
        onClose={handleClose}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('cancel-delete-team-btn'))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
