import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AssignMemberModal } from './AssignMemberModal'
import type { Team, OrganizationMember } from './types'

describe('AssignMemberModal Component', () => {
  const mockTeam: Team = {
    id: 5,
    organization_id: 1,
    name: 'Escalations Support',
    description: 'Tier 2 escalations',
    members: [
      {
        id: 10,
        organization_id: 1,
        user_id: 1,
        role: 'admin',
        user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
      },
    ],
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
      user: { id: 3, name: 'Charlie Rep', email: 'charlie@acme.test' },
    },
  ]

  it('does not render dialog when isOpen is false', () => {
    render(
      <AssignMemberModal
        isOpen={false}
        team={mockTeam}
        orgMembers={mockOrgMembers}
        onClose={vi.fn()}
        onAssignMember={vi.fn()}
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filters out already assigned members and lists only eligible organization members', () => {
    render(
      <AssignMemberModal
        isOpen={true}
        team={mockTeam}
        orgMembers={mockOrgMembers}
        onClose={vi.fn()}
        onAssignMember={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('assign-member-title')).toHaveTextContent(/assign member/i)

    const select = screen.getByTestId('assign-member-select')
    expect(select).toBeInTheDocument()

    // Alice Admin (id: 10) is already in mockTeam, so she should NOT be an option
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options.some((text) => text?.includes('Alice Admin'))).toBe(false)

    // Bob Agent (id: 20) and Charlie Rep (id: 30) should be available options
    expect(options.some((text) => text?.includes('Bob Agent'))).toBe(true)
    expect(options.some((text) => text?.includes('Charlie Rep'))).toBe(true)
  })

  it('validates selection and submits member assignment mutation via onAssignMember', async () => {
    const handleAssign = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <AssignMemberModal
        isOpen={true}
        team={mockTeam}
        orgMembers={mockOrgMembers}
        onClose={handleClose}
        onAssignMember={handleAssign}
      />
    )

    const submitBtn = screen.getByTestId('assign-member-submit')
    expect(submitBtn).toBeDisabled()

    // Select Bob Agent
    fireEvent.change(screen.getByTestId('assign-member-select'), {
      target: { value: '20' },
    })

    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(handleAssign).toHaveBeenCalledWith(5, 20)
      expect(handleClose).toHaveBeenCalled()
    })
  })

  it('displays error message when error prop or submission error occurs', () => {
    render(
      <AssignMemberModal
        isOpen={true}
        team={mockTeam}
        orgMembers={mockOrgMembers}
        onClose={vi.fn()}
        onAssignMember={vi.fn()}
        error="Member is already part of this team."
      />
    )

    expect(screen.getByTestId('assign-member-error')).toHaveTextContent(
      'Member is already part of this team.'
    )
  })

  it('shows empty state message when all organization members are already assigned', () => {
    const fullyAssignedTeam: Team = {
      id: 5,
      organization_id: 1,
      name: 'Full Team',
      description: 'Everyone is here',
      members: [
        {
          id: 10,
          organization_id: 1,
          user_id: 1,
          role: 'admin',
          user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
        },
      ],
    }

    render(
      <AssignMemberModal
        isOpen={true}
        team={fullyAssignedTeam}
        orgMembers={[mockOrgMembers[0]]} // Only Alice in org
        onClose={vi.fn()}
        onAssignMember={vi.fn()}
      />
    )

    expect(screen.getByTestId('no-eligible-members-message')).toHaveTextContent(
      /all organization members are already assigned/i
    )
    expect(screen.getByTestId('assign-member-submit')).toBeDisabled()
  })

  it('renders legacy inline form when isOpen is not provided (backward compatibility)', () => {
    const handleSelect = vi.fn()
    const handleAdd = vi.fn()

    render(
      <AssignMemberModal
        teamId={5}
        orgMembers={mockOrgMembers}
        currentMembers={mockTeam.members}
        selectedMemberId="20"
        onSelectMember={handleSelect}
        onAddMember={handleAdd}
      />
    )

    // Inline elements are present
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-member-select-5')).toBeInTheDocument()
    expect(screen.getByTestId('add-member-btn-5')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('add-member-btn-5'))
    expect(handleAdd).toHaveBeenCalledWith(5)
  })
})
