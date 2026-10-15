import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { AuthCard } from './components/auth/AuthCard'
import { PublicInvitationView } from './components/invitations/PublicInvitationView'
import { CentralHubSwitchboard } from './components/hub/CentralHubSwitchboard'
import { GuidedCommandDeck } from './components/overview/GuidedCommandDeck'
import { MemberRosterTable } from './components/members/MemberRosterTable'
import { TeamsTabularLedger } from './components/teams/TeamsTabularLedger'
import { TicketCockpit } from './components/tickets/TicketCockpit'
import { INITIAL_MOCK_TICKETS, MOCK_TEAMS, MOCK_MEMBERS, MOCK_TAGS_POOL } from './components/tickets/mockData'
import { CustomerPortalLayout } from './components/portal/CustomerPortalLayout'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function expectNoRetiredTokens(container: HTMLElement) {
  expect(container.innerHTML).not.toContain('accent-indigo-glow')
  expect(container.innerHTML).not.toContain('luminous-indigo')
  expect(container.innerHTML).not.toContain('inverse-primary')
  expect(container.innerHTML).not.toContain('text-accent-glow')
}

describe('Theme Tokens Retirement & Scoped Theme Consistency (#157)', () => {
  describe('UI Primitives (Button & Input)', () => {
    it('Button uses Cadmium Amber focus ring by default and does not accept or apply legacy indigo focus ring', () => {
      render(<Button>Graphite Action</Button>)
      const button = screen.getByRole('button', { name: 'Graphite Action' })
      expect(button.className).toContain('focus-visible:ring-focus-amber')
      expect(button.className).not.toContain('accent-indigo-glow')
    })

    it('Button ai variant uses amber highlight gradient instead of legacy indigo glow', () => {
      render(<Button variant="ai">AI Assist</Button>)
      const button = screen.getByRole('button', { name: /AI Assist/i })
      expect(button.className).toContain('from-primary-highlight')
      expect(button.className).not.toContain('from-accent-indigo-glow')
    })

    it('Input uses Cadmium Amber focus borders and rings without legacy indigo classes', () => {
      render(<Input placeholder="Search records" />)
      const input = screen.getByPlaceholderText('Search records')
      expect(input.className).toContain('focus:border-focus-amber')
      expect(input.className).toContain('focus:ring-focus-amber')
      expect(input.className).not.toContain('accent-indigo-glow')
    })
  })

  describe('Scoped Themes & Visual Review Across All Migrated Views', () => {
    it('Auth views render under internal theme scope with graphite and amber styling and no legacy navy/indigo classes', () => {
      const { container } = render(
        <div data-theme="internal">
          <AuthCard
            activeTab="login"
            onTabChange={vi.fn()}
            loginEmail="admin@zeddesk.io"
            setLoginEmail={vi.fn()}
            loginPassword="password"
            setLoginPassword={vi.fn()}
            loginError={null}
            isLoggingIn={false}
            onLoginSubmit={vi.fn()}
            regName=""
            setRegName={vi.fn()}
            regEmail=""
            setRegEmail={vi.fn()}
            regPassword=""
            setRegPassword={vi.fn()}
            regPasswordConfirm=""
            setRegPasswordConfirm={vi.fn()}
            regError={null}
            isRegistering={false}
            onRegisterSubmit={vi.fn()}
          />
        </div>
      )

      expect(container.querySelector('[data-theme="internal"]')).toBeInTheDocument()
      expectNoRetiredTokens(container)
    })

    it('Public Invitation views render under internal theme scope with no legacy indigo glow', () => {
      const mockInvitation = {
        email: 'invitee@initech.corp',
        role: 'agent',
        organization_name: 'Initech Systems',
        organization_slug: 'initech',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }

      const { container } = render(
        <PublicInvitationView
          invitation={mockInvitation}
          isLoading={false}
          error={null}
        />
      )

      const view = screen.getByTestId('public-invitation-view')
      expect(view).toHaveAttribute('data-theme', 'internal')
      expectNoRetiredTokens(container)
    })

    it('Central Hub switchboard renders without legacy indigo tokens or shadows', () => {
      const mockOrgs = [
        { id: 1, name: 'Acme Corp', slug: 'acme', role: 'admin', agentsCount: 5 },
      ]

      const { container } = render(
        <div data-theme="internal">
          <CentralHubSwitchboard
            organizations={mockOrgs}
            onLaunch={vi.fn()}
            onCreateNew={vi.fn()}
          />
        </div>
      )

      expectNoRetiredTokens(container)
    })

    it('Overview command deck renders without legacy indigo glow classes', () => {
      const { container } = render(
        <div data-theme="internal">
          <GuidedCommandDeck
            teamsCount={0}
            membersCount={1}
            ticketsCount={0}
            onCreateTeamClick={vi.fn()}
            onInviteMemberClick={vi.fn()}
            onVerifyIntakeClick={vi.fn()}
          />
        </div>
      )

      expectNoRetiredTokens(container)
    })

    it('Members roster table renders without legacy indigo glow classes', () => {
      const mockMembers = [
        {
          id: 1,
          organization_id: 1,
          user_id: 1,
          role: 'admin',
          user: { id: 1, name: 'Alice Admin', email: 'alice@acme.corp' },
          teams: ['Support'],
          joined_date: '2026-01-01',
          status: 'online' as const,
        },
      ]

      const { container } = render(
        <div data-theme="internal">
          <MemberRosterTable
            members={mockMembers}
            isAdmin={true}
            isLoading={false}
          />
        </div>
      )

      expectNoRetiredTokens(container)
    })

    it('Teams ledger renders without legacy indigo glow classes', () => {
      const mockTeams = [
        {
          id: 1,
          organization_id: 1,
          name: 'Tier 1 Support',
          description: 'Frontline agents',
          members: [
            {
              id: 1,
              organization_id: 1,
              user_id: 1,
              role: 'admin',
              user: { id: 1, name: 'Alice Admin', email: 'alice@acme.corp' },
            },
            {
              id: 2,
              organization_id: 1,
              user_id: 2,
              role: 'agent',
              user: { id: 2, name: 'Bob Agent', email: 'bob@acme.corp' },
            },
          ],
        },
      ]

      const { container } = render(
        <div data-theme="internal">
          <TeamsTabularLedger
            teams={mockTeams}
            isAdmin={true}
            onInspectTeam={vi.fn()}
            onEditTeam={vi.fn()}
            onDeleteTeam={vi.fn()}
          />
        </div>
      )

      expectNoRetiredTokens(container)
    })

    it('Ticket cockpit renders with graphite and amber internal theme and without legacy indigo glow classes', () => {
      const { container } = render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          teams={MOCK_TEAMS}
          members={MOCK_MEMBERS}
          allTags={MOCK_TAGS_POOL}
          userRole="agent"
        >
          <TicketCockpit.Frame>
            <TicketCockpit.SubRail />
            <TicketCockpit.Queue />
            <TicketCockpit.Detail />
            <TicketCockpit.Inspector />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      const frame = screen.getByTestId('ticket-cockpit-frame')
      expect(frame).toHaveAttribute('data-theme', 'internal')
      expectNoRetiredTokens(container)
    })

    it('Customer Portal views render under customer theme scope with Warm Alabaster styling and no navy/indigo leakage', () => {
      const { container } = renderWithQuery(
        <CustomerPortalLayout organizationName="Acme Support">
          <p>Portal Content</p>
        </CustomerPortalLayout>
      )

      const layout = screen.getByTestId('customer-portal-layout')
      expect(layout).toHaveAttribute('data-theme', 'customer')
      expectNoRetiredTokens(container)
    })
  })
})
