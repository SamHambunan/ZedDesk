import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceOverview } from './components/overview/WorkspaceOverview'
import type { OverviewTeam, OverviewAgent, OverviewTicket, OverviewInvitation } from './components/overview/types'

describe('WorkspaceOverview Console', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Slice 1: Bilateral 65/35 Layout, Context Ribbon & Admin Invite CTA', () => {
    it('renders the 65/35 bilateral console with context ribbon throughput metrics and Cadmium Amber invite button for admin', () => {
      const handleInvite = vi.fn()
      const mockTeams: OverviewTeam[] = [
        { id: 1, name: 'Tier 1 Support', members: [{ id: 1, name: 'Alice' }] },
        { id: 2, name: 'Tier 2 Escalations', members: [{ id: 2, name: 'Bob' }] },
        { id: 3, name: 'Billing & Accounts', members: [{ id: 3, name: 'Charlie' }] },
      ]
      const mockAgents: OverviewAgent[] = [
        { id: 1, name: 'Alice Agent', status: 'active', teams: ['Tier 1 Support'], ticket_load: 3 },
        { id: 2, name: 'Bob Dispatch', status: 'triage', teams: ['Tier 2 Escalations'], ticket_load: 5 },
        { id: 3, name: 'Charlie Tech', status: 'active', teams: ['Billing & Accounts'], ticket_load: 2 },
        { id: 4, name: 'Dana Support', status: 'active', teams: ['Tier 1 Support'], ticket_load: 1 },
      ]

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          role="admin"
          teams={mockTeams}
          agents={mockAgents}
          onInviteMemberClick={handleInvite}
        />
      )

      // Bilateral 65/35 split-pane console
      const overviewConsole = screen.getByTestId('workspace-overview')
      expect(overviewConsole).toBeInTheDocument()

      const operationsLedger = screen.getByTestId('operations-ledger-65')
      const actionDispatchLedger = screen.getByTestId('action-dispatch-ledger-35')
      expect(operationsLedger).toBeInTheDocument()
      expect(actionDispatchLedger).toBeInTheDocument()

      // Context Ribbon: Organization name and Subdomain badge
      expect(screen.getByTestId('context-ribbon-org-name')).toHaveTextContent('Acme Operations Corp')
      expect(screen.getByTestId('context-ribbon-subdomain')).toHaveTextContent('acme.zeddesk.app')

      // Throughput metrics: "3 Ingestion Lanes Active • 4 Agents On-Duty • 99.4% SLA"
      expect(screen.getByTestId('context-ribbon-throughput')).toHaveTextContent(
        '3 Ingestion Lanes Active • 4 Agents On-Duty • 99.4% SLA'
      )

      // Admin primary Cadmium Amber "+ Invite Member" button with WCAG AAA 10.4:1 contrast
      const inviteBtn = screen.getByRole('button', { name: /\+ Invite Member/i })
      expect(inviteBtn).toBeInTheDocument()
      expect(inviteBtn).toHaveClass('bg-[#F59E0B]')

      fireEvent.click(inviteBtn)
      expect(handleInvite).toHaveBeenCalledTimes(1)
    })

    it('hides the Cadmium Amber + Invite Member action button when user holds agent role', () => {
      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          role="agent"
          teams={[{ id: 1, name: 'Tier 1 Support', members: [{ id: 1 }] }]}
          agents={[{ id: 1, name: 'Agent Smith', status: 'active', teams: ['Tier 1'], ticket_load: 2 }]}
        />
      )

      expect(screen.queryByRole('button', { name: /\+ Invite Member/i })).not.toBeInTheDocument()
    })
  })

  describe('Slice 2: Team Capacity Lanes & Threshold Colors', () => {
    it('renders team capacity lanes with horizontal progress bars honoring threshold colors (emerald <70%, amber 70-85%, rose >85%), overlapping avatars, and tabular figures', () => {
      const mockTeams: OverviewTeam[] = [
        {
          id: 10,
          name: 'Customer Support Tier 1',
          capacity_percentage: 45,
          open_tickets_count: 9,
          sla_target: '99.5% SLA',
          members: [
            { id: 1, name: 'Sarah Jenkins' },
            { id: 2, name: 'Alex Rivera' },
          ],
        },
        {
          id: 20,
          name: 'Technical Escalations',
          capacity_percentage: 78,
          open_tickets_count: 18,
          sla_target: '98.8% SLA',
          members: [
            { id: 3, name: 'Marcus Brody' },
          ],
        },
        {
          id: 30,
          name: 'Critical Incidents Response',
          capacity_percentage: 92,
          open_tickets_count: 24,
          sla_target: '99.9% SLA',
          members: [
            { id: 4, name: 'Elena Rostova' },
            { id: 5, name: 'Devon Miles' },
            { id: 6, name: 'Chen Wei' },
          ],
        },
      ]

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          teams={mockTeams}
          members={[{ id: 1 }, { id: 2 }, { id: 3 }]}
        />
      )

      const capacityLanesSection = screen.getByTestId('team-capacity-lanes')
      expect(capacityLanesSection).toBeInTheDocument()

      // Team 1: 45% (<70%) -> Emerald threshold
      const team1Progress = screen.getByTestId('capacity-bar-10')
      expect(team1Progress).toBeInTheDocument()
      expect(team1Progress).toHaveClass('bg-sentiment-positive')
      expect(team1Progress).toHaveStyle({ width: '45%' })

      // Team 2: 78% (70-85%) -> Amber threshold
      const team2Progress = screen.getByTestId('capacity-bar-20')
      expect(team2Progress).toBeInTheDocument()
      expect(team2Progress).toHaveClass('bg-sentiment-warning')
      expect(team2Progress).toHaveStyle({ width: '78%' })

      // Team 3: 92% (>85%) -> Rose threshold
      const team3Progress = screen.getByTestId('capacity-bar-30')
      expect(team3Progress).toBeInTheDocument()
      expect(team3Progress).toHaveClass('bg-sentiment-critical')
      expect(team3Progress).toHaveStyle({ width: '92%' })

      // Tabular ticket numbers
      const ticketCounts = screen.getAllByTestId(/team-ticket-count-/)
      expect(ticketCounts[0]).toHaveTextContent('9')
      expect(ticketCounts[0]).toHaveClass('tabular-nums')
      expect(ticketCounts[1]).toHaveTextContent('18')
      expect(ticketCounts[2]).toHaveTextContent('24')

      // SLA targets
      expect(screen.getByText('99.5% SLA')).toBeInTheDocument()
      expect(screen.getByText('98.8% SLA')).toBeInTheDocument()
      expect(screen.getByText('99.9% SLA')).toBeInTheDocument()

      // Overlapping avatar stacks with member initials
      const avatarStack = screen.getByTestId('avatar-stack-10')
      expect(avatarStack).toBeInTheDocument()
      expect(avatarStack).toHaveTextContent('SJ')
      expect(avatarStack).toHaveTextContent('AR')
    })
  })

  describe('Slice 3: Stage 2 Triage Queue Bridge & 1-Click Claim & Route', () => {
    it('renders triage counters, preview ticket rows, handles 1-click Claim & Route, and links directly to /tickets', async () => {
      const handleClaim = vi.fn().mockResolvedValue(undefined)
      const handleNavigate = vi.fn()

      const mockTickets: OverviewTicket[] = [
        {
          id: 't-101',
          ticket_number: 101,
          subject: 'Database connection pool exhausted during peak',
          priority: 'urgent',
          status: 'open',
          customer: { name: 'Acme Payments', email: 'billing@acme.com' },
          wait_time: '8m wait',
          assigned_member_id: null,
        },
        {
          id: 't-102',
          ticket_number: 102,
          subject: 'SAML SSO certificate expiration warning',
          priority: 'high',
          status: 'open',
          customer: { name: 'Enterprise Corp', email: 'sso@enterprise.com' },
          wait_time: '24m wait',
          assigned_member_id: null,
        },
        {
          id: 't-103',
          ticket_number: 103,
          subject: 'Typo in customer receipt email template',
          priority: 'low',
          status: 'open',
          customer: { name: 'Retail Store', email: 'support@retail.com' },
          wait_time: '1h wait',
          assigned_member_id: null,
        },
      ]

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          teams={[{ id: 1, name: 'Support', capacity_percentage: 50, members: [{ id: 1 }, { id: 2 }] }]}
          members={[{ id: 1 }, { id: 2 }]}
          tickets={mockTickets}
          onClaimTicket={handleClaim}
          onNavigate={handleNavigate}
        />
      )

      // Bridge element
      const queueBridge = screen.getByTestId('stage2-triage-queue-bridge')
      expect(queueBridge).toBeInTheDocument()

      // Triage counters
      expect(screen.getByTestId('counter-unassigned')).toHaveTextContent('3')
      expect(screen.getByTestId('counter-p0p1')).toHaveTextContent('2') // urgent + high
      expect(screen.getByTestId('counter-avg-wait')).toHaveTextContent(/avg wait/i)

      // Preview ticket rows
      expect(screen.getByText('#101')).toBeInTheDocument()
      expect(screen.getByText('Database connection pool exhausted during peak')).toBeInTheDocument()
      expect(screen.getByText('#102')).toBeInTheDocument()

      // 1-Click "Claim & Route" button
      const claimButtons = screen.getAllByRole('button', { name: /Claim & Route/i })
      expect(claimButtons.length).toBeGreaterThanOrEqual(1)

      fireEvent.click(claimButtons[0])
      await waitFor(() => {
        expect(handleClaim).toHaveBeenCalledWith('t-101')
      })

      // Immediate optimistic unassigned counter decrement and direct route to claimed ticket
      expect(screen.getByTestId('counter-unassigned')).toHaveTextContent('2')
      expect(handleNavigate).toHaveBeenCalledWith('tickets/101')

      // Direct link to /tickets with unassigned preset pre-selected
      const viewAllLink = screen.getByTestId('view-all-tickets-link')
      expect(viewAllLink).toBeInTheDocument()
      fireEvent.click(viewAllLink)
      expect(handleNavigate).toHaveBeenCalledWith('tickets?preset=unassigned')
    })
  })

  describe('Slice 4: Guided Command Deck (0-State Transition Logic)', () => {
    it('automatically renders Guided Command Deck with 3-step setup pipeline when teams = 0 (or 1 member)', () => {
      const handleCreateTeam = vi.fn()
      const handleInvite = vi.fn()
      const handleNavigate = vi.fn()

      const { rerender } = render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Fresh Tenant', slug: 'acme' }}
          subdomain="acme"
          role="admin"
          teams={[]} // teams = 0
          members={[{ id: 1 }]} // 1 member
          onCreateTeamClick={handleCreateTeam}
          onInviteMemberClick={handleInvite}
          onNavigate={handleNavigate}
        />
      )

      // Guided Command Deck should be rendered instead of capacity lanes
      const commandDeck = screen.getByTestId('guided-command-deck')
      expect(commandDeck).toBeInTheDocument()
      expect(screen.queryByTestId('team-capacity-lanes')).not.toBeInTheDocument()

      // 3-step setup pipeline:
      // 1. Create Functional Routing Lanes
      expect(screen.getAllByText(/Create Functional Routing Lanes/i).length).toBeGreaterThanOrEqual(1)
      const createLaneBtn = screen.getByTestId('step-trigger-routing-lanes')
      fireEvent.click(createLaneBtn)
      expect(handleCreateTeam).toHaveBeenCalledTimes(1)

      // 2. Onboard Dispatch Agents
      expect(screen.getAllByText(/Onboard Dispatch Agents/i).length).toBeGreaterThanOrEqual(1)
      const onboardAgentsBtn = screen.getByTestId('step-trigger-dispatch-agents')
      fireEvent.click(onboardAgentsBtn)
      expect(handleInvite).toHaveBeenCalledTimes(1)

      // 3. Verify Customer Intake Ingestion
      expect(screen.getAllByText(/Verify Customer Intake Ingestion/i).length).toBeGreaterThanOrEqual(1)
      const verifyIntakeBtn = screen.getByTestId('step-trigger-customer-intake')
      fireEvent.click(verifyIntakeBtn)
      expect(handleNavigate).toHaveBeenCalledWith('portal')

      // Now rerender with teams > 0 and members > 1: Command Deck dissolves into live capacity bars
      rerender(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Fresh Tenant', slug: 'acme' }}
          subdomain="acme"
          role="admin"
          teams={[
            { id: 1, name: 'Support', capacity_percentage: 60, members: [{ id: 1 }, { id: 2 }] },
          ]}
          members={[{ id: 1 }, { id: 2 }]}
          onCreateTeamClick={handleCreateTeam}
          onInviteMemberClick={handleInvite}
          onNavigate={handleNavigate}
        />
      )

      expect(screen.queryByTestId('guided-command-deck')).not.toBeInTheDocument()
      expect(screen.getByTestId('team-capacity-lanes')).toBeInTheDocument()
    })
  })

  describe('Slice 5: Right 35% Action & Dispatch Ledger - On-Duty Shift Roster', () => {
    it('renders on-duty shift roster with initials pills, assigned routing lanes, tabular ticket load, and live status dots', () => {
      const mockAgents: OverviewAgent[] = [
        {
          id: 1,
          name: 'Sarah Connor',
          role: 'Lead Dispatcher',
          teams: ['Tier 1 Support', 'Billing'],
          ticket_load: 6,
          status: 'active',
        },
        {
          id: 2,
          name: 'John Connor',
          role: 'Triage Specialist',
          teams: ['Critical Incidents'],
          ticket_load: 12,
          status: 'triage',
        },
      ]

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          teams={[{ id: 1, name: 'Tier 1 Support' }]}
          agents={mockAgents}
        />
      )

      const shiftRoster = screen.getByTestId('on-duty-shift-roster')
      expect(shiftRoster).toBeInTheDocument()

      // Initials pill
      expect(screen.getByTestId('agent-initials-1')).toHaveTextContent('SC')
      expect(screen.getByTestId('agent-initials-2')).toHaveTextContent('JC')

      // Names and routing lanes
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
      expect(screen.getByText('Tier 1 Support, Billing')).toBeInTheDocument()
      expect(screen.getByText('John Connor')).toBeInTheDocument()
      expect(screen.getByText('Critical Incidents')).toBeInTheDocument()

      // Tabular ticket load
      const loadAgent1 = screen.getByTestId('agent-load-1')
      expect(loadAgent1).toHaveTextContent('6')
      expect(loadAgent1).toHaveClass('tabular-nums')

      const loadAgent2 = screen.getByTestId('agent-load-2')
      expect(loadAgent2).toHaveTextContent('12')
      expect(loadAgent2).toHaveClass('tabular-nums')

      // Live status dots: active emerald, triage amber
      const statusDot1 = screen.getByTestId('agent-status-dot-1')
      expect(statusDot1).toHaveClass('bg-sentiment-positive')

      const statusDot2 = screen.getByTestId('agent-status-dot-2')
      expect(statusDot2).toHaveClass('bg-sentiment-warning')
    })
  })

  describe('Slice 6: Pending Invitations Ledger, 2s Copy Toast & Quick Dispatch Shortcuts', () => {
    it('renders pending invitations ledger, copies link with 2-second tactile toast, revokes invitation, and provides quick dispatch shortcuts', async () => {
      vi.useFakeTimers()
      const handleRevoke = vi.fn().mockResolvedValue(undefined)
      const handleIssueInvite = vi.fn()
      const handleNavigate = vi.fn()

      // Mock navigator.clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      const mockInvitations: OverviewInvitation[] = [
        {
          id: 401,
          email: 'newagent@company.com',
          role: 'agent',
          token: 'token-abc-401',
          created_at: '2026-10-01T10:00:00Z',
        },
        {
          id: 402,
          email: 'admin2@company.com',
          role: 'admin',
          token: 'token-xyz-402',
          created_at: '2026-10-01T11:00:00Z',
        },
      ]

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Operations Corp', slug: 'acme' }}
          subdomain="acme"
          role="admin"
          teams={[{ id: 1, name: 'Tier 1' }]}
          invitations={mockInvitations}
          onRevokeInvitation={handleRevoke}
          onInviteMemberClick={handleIssueInvite}
          onNavigate={handleNavigate}
        />
      )

      // Pending invitations ledger
      expect(screen.getByTestId('pending-invitations-ledger')).toBeInTheDocument()
      expect(screen.getByText('newagent@company.com')).toBeInTheDocument()
      expect(screen.getByText('admin2@company.com')).toBeInTheDocument()

      // Role badges
      expect(screen.getByTestId('invitation-role-401')).toHaveTextContent(/agent/i)
      expect(screen.getByTestId('invitation-role-402')).toHaveTextContent(/admin/i)

      // 1-Click "Copy Link" action triggering a 2-second tactile toast
      const copyBtn = screen.getByTestId('copy-invite-401')
      act(() => {
        fireEvent.click(copyBtn)
      })

      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('token-abc-401'))

      // 2-second tactile toast is visible
      const toast = screen.getByTestId('tactical-toast')
      expect(toast).toBeInTheDocument()
      expect(toast).toHaveTextContent(/copied/i)

      // Advance timers by 2000ms inside act -> toast dismisses
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(screen.queryByTestId('tactical-toast')).not.toBeInTheDocument()

      // Revoke button with optimistic removal
      const revokeBtn = screen.getByTestId('revoke-invite-402')
      await act(async () => {
        fireEvent.click(revokeBtn)
      })
      expect(handleRevoke).toHaveBeenCalledWith(402)
      expect(screen.queryByText('admin2@company.com')).not.toBeInTheDocument()

      // "+ Issue New Invitation" button
      const issueBtn = screen.getByTestId('issue-new-invitation-btn')
      fireEvent.click(issueBtn)
      expect(handleIssueInvite).toHaveBeenCalledTimes(1)

      // Quick Dispatch Shortcuts
      const shortcuts = screen.getByTestId('quick-dispatch-shortcuts')
      expect(shortcuts).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('dispatch-shortcut-members'))
      expect(handleNavigate).toHaveBeenCalledWith('members')

      fireEvent.click(screen.getByTestId('dispatch-shortcut-teams'))
      expect(handleNavigate).toHaveBeenCalledWith('teams')

      fireEvent.click(screen.getByTestId('dispatch-shortcut-portal'))
      expect(handleNavigate).toHaveBeenCalledWith('portal')

      fireEvent.click(screen.getByTestId('dispatch-shortcut-tickets'))
      expect(handleNavigate).toHaveBeenCalledWith('tickets')

      vi.useRealTimers()
    })
  })
})
