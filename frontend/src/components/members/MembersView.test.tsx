import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MembersView } from './MembersView'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Member, PendingInvitation } from './types'

describe('MembersView Component', () => {
  const mockMembers: Member[] = [
    {
      id: 1,
      organization_id: 1,
      user_id: 10,
      role: 'admin',
      user: { id: 10, name: 'Sarah Connor', email: 'sarah@acme.corp' },
      teams: ['Core'],
      joined_date: '2023-01-01',
      status: 'online',
    },
    {
      id: 2,
      organization_id: 1,
      user_id: 20,
      role: 'agent',
      user: { id: 20, name: 'John Doe', email: 'john@acme.corp' },
      teams: ['Support'],
      joined_date: '2023-02-01',
      status: 'offline',
    },
  ]

  const mockInvitations: PendingInvitation[] = [
    {
      id: 101,
      email: 'pending@acme.corp',
      role: 'agent',
      token: 'tok-101',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
  ]

  it('renders title, stats, and member roster', () => {
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={true}
      />
    )

    expect(screen.getByTestId('members-view-title')).toBeInTheDocument()
    expect(screen.getByTestId('members-stats')).toHaveTextContent('2')
    expect(screen.getByTestId('members-stats')).toHaveTextContent('1')
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })

  it('renders admin controls when isAdmin is true (invite button, pending invitations, and roster actions)', () => {
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={true}
      />
    )

    expect(screen.getByTestId('invite-member-btn')).toBeInTheDocument()
    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument()
    expect(screen.getByTestId('member-actions-btn-1')).toBeInTheDocument()
    expect(screen.getByTestId('member-actions-btn-2')).toBeInTheDocument()
  })

  it('enforces strict RBAC elision: completely omits all administrative controls when isAdmin is false', () => {
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={false}
      />
    )

    // Strict RBAC: All administrative actions are completely absent from the DOM
    expect(screen.queryByTestId('invite-member-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending-invitations-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-2')).not.toBeInTheDocument()

    // Roster data is still accessible to agent
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    const adminBadge = screen.getByTestId('member-role-1')
    expect(adminBadge).toHaveClass('bg-[#8B5CF6]/15')
    expect(adminBadge).toHaveClass('text-[#C4B5FD]')
    const agentBadge = screen.getByTestId('member-role-2')
    expect(agentBadge).toHaveClass('bg-surface-subpanel')
    expect(agentBadge).toHaveClass('text-text-secondary')
  })

  it('filters members list by search query', () => {
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={true}
      />
    )

    const searchInput = screen.getByTestId('members-search-input')
    fireEvent.change(searchInput, { target: { value: 'john' } })

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument()
  })

  it('filters members list by role dropdown', () => {
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={true}
      />
    )

    const roleFilter = screen.getByTestId('members-role-filter')
    fireEvent.change(roleFilter, { target: { value: 'admin' } })

    expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
  })

  it('opens invite modal when + Invite Member is clicked and submits', async () => {
    const handleInviteSubmit = vi.fn()
    render(
      <MembersView
        members={mockMembers}
        pendingInvitations={mockInvitations}
        isAdmin={true}
        onInviteSubmit={handleInviteSubmit}
      />
    )

    fireEvent.click(screen.getByTestId('invite-member-btn'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('invite-email-input'), {
      target: { value: 'new@acme.corp' },
    })
    fireEvent.submit(screen.getByTestId('invite-form'))

    expect(handleInviteSubmit).toHaveBeenCalledWith('new@acme.corp', 'agent')
  })

  it('correctly resolves role-based authorization state from WorkspaceShellContext when isAdmin is omitted', () => {
    // When role is agent in WorkspaceShellContext
    const { rerender } = render(
      <WorkspaceShellContext.Provider
        value={
          {
            organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
            user: { id: 20, name: 'Agent Smith', email: 'agent@acme.corp' },
            role: 'agent',
            subdomain: 'acme',
            token: 'agent-token',
            isSidebarCollapsed: false,
            toggleSidebar: () => {},
            setSidebarCollapsed: () => {},
            activeRoute: 'members',
            apiUrl: 'http://localhost:8000',
            organizations: [],
          } as any
        }
      >
        <MembersView
          members={mockMembers}
          pendingInvitations={mockInvitations}
        />
      </WorkspaceShellContext.Provider>
    )

    // Agent has administrative triggers elided
    expect(screen.queryByTestId('invite-member-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending-invitations-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-actions-btn-1')).not.toBeInTheDocument()

    // When role is admin in WorkspaceShellContext
    rerender(
      <WorkspaceShellContext.Provider
        value={
          {
            organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
            user: { id: 10, name: 'Admin Alice', email: 'alice@acme.corp' },
            role: 'admin',
            subdomain: 'acme',
            token: 'admin-token',
            isSidebarCollapsed: false,
            toggleSidebar: () => {},
            setSidebarCollapsed: () => {},
            activeRoute: 'members',
            apiUrl: 'http://localhost:8000',
            organizations: [],
          } as any
        }
      >
        <MembersView
          members={mockMembers}
          pendingInvitations={mockInvitations}
        />
      </WorkspaceShellContext.Provider>
    )

    // Admin has administrative triggers rendered
    expect(screen.getByTestId('invite-member-btn')).toBeInTheDocument()
    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument()
    expect(screen.getByTestId('member-actions-btn-1')).toBeInTheDocument()
  })
})
