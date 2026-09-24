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

  it('renders high-density 40px table with JetBrains Mono tabular join dates and vertical alignment', () => {
    render(<MemberRosterTable members={mockMembers} />)

    const table = screen.getByTestId('members-roster-table')
    expect(table).toBeInTheDocument()

    const row1 = screen.getByTestId('member-row-1')
    expect(row1).toHaveClass('h-10')

    const joinedCell = screen.getByTestId('member-joined-1')
    expect(joinedCell).toHaveClass('tabular-nums')
    expect(joinedCell.closest('td')).toHaveClass('font-mono-data')
    expect(joinedCell.closest('td')).toHaveClass('tabular-nums')
    expect(joinedCell.closest('td')).toHaveClass('align-middle')
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

  it('renders distinct role badges with Amethyst Violet for admin and Tactical Graphite for agent', () => {
    render(<MemberRosterTable members={mockMembers} />)

    const adminBadge = screen.getByTestId('member-role-1')
    expect(adminBadge).toHaveTextContent('Admin')
    expect(adminBadge.className).toContain('bg-[#8B5CF6]/15')
    expect(adminBadge.className).toContain('text-[#C4B5FD]')

    const agentBadge = screen.getByTestId('member-role-2')
    expect(agentBadge).toHaveTextContent('Agent')
    expect(agentBadge.className).toContain('bg-surface-subpanel')
    expect(agentBadge.className).toContain('text-text-secondary')
  })

  it('renders team tags and online/offline status dots', () => {
    render(<MemberRosterTable members={mockMembers} />)

    expect(screen.getByText('Core Engineering')).toBeInTheDocument()
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Support Tier 1')).toBeInTheDocument()

    expect(screen.getByTestId('member-status-1')).toHaveTextContent('Online')
    expect(screen.getByTestId('member-status-2')).toHaveTextContent('Offline')
  })

  it('triggers onActionClick when action button is clicked by admin', () => {
    const handleAction = vi.fn()
    render(<MemberRosterTable members={mockMembers} isAdmin={true} onActionClick={handleAction} />)

    const actionBtn = screen.getByTestId('member-actions-btn-1')
    fireEvent.click(actionBtn)

    expect(handleAction).toHaveBeenCalledWith(mockMembers[0])
  })

  it('enforces strict RBAC visual elision: completely omits administrative action triggers when isAdmin is false', () => {
    render(<MemberRosterTable members={mockMembers} isAdmin={false} />)

    // Administrative action button triggers are completely absent from the DOM
    expect(screen.queryByTestId('member-actions-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-2')).not.toBeInTheDocument()

    // Actions column header is completely absent from the DOM
    expect(screen.queryByText(/actions/i)).not.toBeInTheDocument()
  })

  it('renders loading state and empty state correctly', () => {
    const { rerender } = render(<MemberRosterTable members={[]} isLoading={true} />)
    expect(screen.getByTestId('members-loading')).toBeInTheDocument()

    rerender(<MemberRosterTable members={[]} isLoading={false} />)
    expect(screen.getByTestId('members-empty')).toBeInTheDocument()
  })
})
