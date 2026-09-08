import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemberRosterTable } from './MemberRosterTable'
import type { Member } from './types'

describe('MemberRosterTable Component', () => {
  const mockMembers: Member[] = [
    {
      id: 1,
      organization_id: 10,
      user_id: 101,
      role: 'admin',
      user: {
        id: 101,
        name: 'Sarah Connor',
        email: 'sarah@acme.corp',
        avatar_url: null,
      },
      teams: ['Core Engineering', 'Leadership'],
      joined_date: '2023-01-15',
      status: 'online',
    },
    {
      id: 2,
      organization_id: 10,
      user_id: 102,
      role: 'agent',
      user: {
        id: 102,
        name: 'John Doe',
        email: 'john@acme.corp',
        avatar_url: 'https://example.com/john.jpg',
      },
      teams: ['Support Tier 1'],
      joined_date: '2023-04-22',
      status: 'offline',
    },
  ]

  it('renders high-density 40px table with tabular numbers', () => {
    render(<MemberRosterTable members={mockMembers} />)

    const table = screen.getByTestId('members-roster-table')
    expect(table).toBeInTheDocument()

    const row1 = screen.getByTestId('member-row-1')
    expect(row1).toHaveClass('h-10')

    const joinedCell = screen.getByTestId('member-joined-1')
    expect(joinedCell.closest('td')).toHaveClass('tabular-nums')
  })

  it('renders member avatar, initials fallback, full name, and email', () => {
    render(<MemberRosterTable members={mockMembers} />)

    // Member 1 has initials fallback
    expect(screen.getByText('SC')).toBeInTheDocument()
    expect(screen.getByTestId('member-name-1')).toHaveTextContent('Sarah Connor')
    expect(screen.getByTestId('member-email-1')).toHaveTextContent('sarah@acme.corp')

    // Member 2 has avatar image
    const avatarImg = screen.getByAltText('John Doe')
    expect(avatarImg).toHaveAttribute('src', 'https://example.com/john.jpg')
    expect(screen.getByTestId('member-name-2')).toHaveTextContent('John Doe')
  })

  it('renders assigned Role pill with Admin in violet and Agent in indigo', () => {
    render(<MemberRosterTable members={mockMembers} />)

    const adminPill = screen.getByTestId('member-role-1')
    expect(adminPill).toHaveTextContent('Admin')
    expect(adminPill).toHaveClass('text-purple-300')

    const agentPill = screen.getByTestId('member-role-2')
    expect(agentPill).toHaveTextContent('Agent')
    expect(agentPill).toHaveClass('text-indigo-300')
  })

  it('renders team tags and online/offline status dots', () => {
    render(<MemberRosterTable members={mockMembers} />)

    expect(screen.getByText('Core Engineering')).toBeInTheDocument()
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Support Tier 1')).toBeInTheDocument()

    expect(screen.getByTestId('member-status-1')).toHaveTextContent('Online')
    expect(screen.getByTestId('member-status-2')).toHaveTextContent('Offline')
  })

  it('triggers onActionClick when action button is clicked', () => {
    const handleAction = vi.fn()
    render(<MemberRosterTable members={mockMembers} onActionClick={handleAction} />)

    const actionBtn = screen.getByTestId('member-actions-btn-1')
    fireEvent.click(actionBtn)

    expect(handleAction).toHaveBeenCalledWith(mockMembers[0])
  })

  it('renders loading state and empty state correctly', () => {
    const { rerender } = render(<MemberRosterTable members={[]} isLoading={true} />)
    expect(screen.getByTestId('members-loading')).toBeInTheDocument()

    rerender(<MemberRosterTable members={[]} isLoading={false} />)
    expect(screen.getByTestId('members-empty')).toBeInTheDocument()
  })
})
