import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShiftRoster } from './components/overview/ShiftRoster'
import { WorkspaceOverview } from './components/overview/WorkspaceOverview'
import { MembersView } from './components/members/MembersView'
import { CustomerPortalView } from './components/portal/CustomerPortalView'
import { createMockLiveClient } from './lib/live-client'
import { queryClient } from './lib/query-client'
import type { OverviewAgent } from './components/overview/types'
import type { Member, PendingInvitation } from './components/members/types'

const MOCK_AGENTS: OverviewAgent[] = [
  {
    id: 1,
    name: 'Sarah Connor',
    role: 'Tier 2 Agent',
    status: 'active',
    ticket_load: 4,
    teams: ['Tier 2 Support', 'Escalations'],
  },
  {
    id: 2,
    name: 'John Doe',
    role: 'Triage Specialist',
    status: 'triage',
    ticket_load: 7,
    teams: ['Frontline Triage'],
  },
]

const MOCK_ROSTER_MEMBERS: Member[] = [
  {
    id: 1,
    organization_id: 1,
    user_id: 101,
    role: 'agent',
    user: {
      id: 101,
      name: 'Sarah Connor',
      email: 'sarah@acme.test',
    },
    teams: ['Tier 2 Support'],
    joined_date: '2026-01-15',
    status: 'offline',
  },
  {
    id: 2,
    organization_id: 1,
    user_id: 102,
    role: 'admin',
    user: {
      id: 102,
      name: 'John Doe',
      email: 'john@acme.test',
    },
    teams: ['Frontline Triage'],
    joined_date: '2026-02-01',
    status: 'offline',
  },
]

describe('Organization Member Presence and Roster Integration (Issue #151)', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  it('renders connected Organization Members in an Online subsection separate from On-Duty and workload indicators', () => {
    const onlineMembers = [
      { member_id: 1, name: 'Sarah Connor' },
      { member_id: 3, name: 'Kyle Reese' },
    ]

    render(
      <ShiftRoster
        agents={MOCK_AGENTS}
        onlineMembers={onlineMembers}
      />
    )

    // 1. On-Duty Shift Roster retains on-duty agents, on-duty status dot, and ticket load
    expect(screen.getByTestId('on-duty-shift-roster')).toBeInTheDocument()
    expect(screen.getByTestId('shift-agent-1')).toBeInTheDocument()
    expect(screen.getByTestId('agent-status-dot-1')).toHaveAttribute('title', 'On-duty status: active')
    expect(screen.getByTestId('agent-load-1')).toHaveTextContent('4')

    // 2. Online subsection is explicitly rendered separately from On-Duty / workload
    const onlineSubsection = screen.getByTestId('online-members-subsection')
    expect(onlineSubsection).toBeInTheDocument()
    expect(screen.getByTestId('online-members-count')).toHaveTextContent('(2)')
    expect(screen.getByText(/transient presence, distinct from on-duty schedule or ticket workload/i)).toBeInTheDocument()

    // 3. Online members listed with Connected badge and no ticket load
    expect(screen.getByTestId('online-member-1')).toBeInTheDocument()
    expect(screen.getByTestId('online-member-name-1')).toHaveTextContent('Sarah Connor')
    expect(screen.getByTestId('online-member-badge-1')).toHaveTextContent('Connected')

    expect(screen.getByTestId('online-member-3')).toBeInTheDocument()
    expect(screen.getByTestId('online-member-name-3')).toHaveTextContent('Kyle Reese')
    expect(screen.getByTestId('online-member-badge-3')).toHaveTextContent('Connected')

    // Verify online member items do not contain ticket load elements
    expect(screen.queryByTestId('agent-load-3')).not.toBeInTheDocument()
  })

  it('renders empty state in Online subsection when no members are connected', () => {
    render(
      <ShiftRoster
        agents={MOCK_AGENTS}
        onlineMembers={[]}
      />
    )

    expect(screen.getByTestId('online-members-subsection')).toBeInTheDocument()
    expect(screen.getByTestId('online-members-count')).toHaveTextContent('(0)')
    expect(screen.getByTestId('online-members-empty')).toHaveTextContent('No members currently online.')
  })

  it('WorkspaceOverview dynamically subscribes to liveClient organization presence and renders online members', async () => {
    const liveClient = createMockLiveClient()

    render(
      <WorkspaceOverview
        agents={MOCK_AGENTS}
        subdomain="acme"
        role="admin"
        liveClient={liveClient}
      />
    )

    // Initially 0 online
    expect(screen.getByTestId('online-members-count')).toHaveTextContent('(0)')

    // Emit live presence signal
    act(() => {
      liveClient.emitOrganizationPresence([
        { member_id: 1, name: 'Sarah Connor' },
        { member_id: 2, name: 'John Doe' },
      ])
    })

    await waitFor(() => {
      expect(screen.getByTestId('online-members-count')).toHaveTextContent('(2)')
      expect(screen.getByTestId('online-member-1')).toBeInTheDocument()
      expect(screen.getByTestId('online-member-2')).toBeInTheDocument()
    })
  })

  it('MembersView displays Online subsection and updates member table status based on connected presence', () => {
    const onlineMembers = [{ member_id: 1, name: 'Sarah Connor' }]

    render(
      <MembersView
        members={MOCK_ROSTER_MEMBERS}
        pendingInvitations={[] as PendingInvitation[]}
        onlineMembers={onlineMembers}
      />
    )

    // Online subsection in MembersView
    expect(screen.getByTestId('online-members-subsection')).toBeInTheDocument()
    expect(screen.getByTestId('online-member-1')).toBeInTheDocument()

    // Member 1 is online in the roster table, Member 2 is offline
    expect(screen.getByTestId('member-status-1')).toHaveTextContent('Online')
    expect(screen.getByTestId('member-status-2')).toHaveTextContent('Offline')
  })

  it('Customers never receive or view staff Presence in Customer Portal', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={qc}>
        <CustomerPortalView subdomain="acme" apiUrl="https://acme.test" />
      </QueryClientProvider>
    )

    // Staff presence is completely absent from customer portal
    expect(screen.queryByTestId('online-members-subsection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-viewers')).not.toBeInTheDocument()
    expect(screen.queryByTestId('on-duty-shift-roster')).not.toBeInTheDocument()
  })
})
