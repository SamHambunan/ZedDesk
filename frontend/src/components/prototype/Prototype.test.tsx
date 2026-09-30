import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PrototypeSwitcher,
  OverviewVariantA,
  OverviewVariantB,
  OverviewVariantC,
  CentralHubSwitchboardPreview,
  TeamsTabularLedgerPreview,
} from './index'
import type { Team, OrganizationMember } from '../teams/types'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Frontend Hard Revamp Prototype Suite', () => {
  const mockOrg = { id: 1, name: 'Acme Corp', slug: 'acme' }

  describe('PrototypeSwitcher', () => {
    it('renders prototype switcher with variant indicators and zero-state toggle', () => {
      const onVariantChange = vi.fn()
      const onToggleZeroState = vi.fn()

      render(
        <PrototypeSwitcher
          currentVariant="A"
          onVariantChange={onVariantChange}
          isZeroState={false}
          onToggleZeroState={onToggleZeroState}
        />
      )

      expect(screen.getByTestId('prototype-switcher')).toBeInTheDocument()
      expect(screen.getByText('PROTOTYPE')).toBeInTheDocument()
      expect(screen.getByTestId('variant-btn-A')).toHaveTextContent('VA')
      expect(screen.getByTestId('variant-btn-B')).toHaveTextContent('VB')
      expect(screen.getByTestId('variant-btn-C')).toHaveTextContent('VC')

      // Click next variant
      fireEvent.click(screen.getByTestId('variant-btn-B'))
      expect(onVariantChange).toHaveBeenCalledWith('B')

      // Click zero-state toggle
      fireEvent.click(screen.getByTestId('toggle-zero-state-btn'))
      expect(onToggleZeroState).toHaveBeenCalled()
    })
  })

  describe('OverviewVariantA (65/35 Split-Pane Console)', () => {
    it('renders bilateral 65/35 layout with routing lanes, triage bridge, and health pulse', () => {
      render(
        <OverviewVariantA
          organization={mockOrg}
          isZeroState={false}
          onNavigate={vi.fn()}
        />
      )

      // Context Ribbon
      expect(screen.getByText('Acme Corp Operations Cockpit')).toBeInTheDocument()
      expect(screen.getByText('acme.zeddesk.app')).toBeInTheDocument()

      // 65% Operations Ledger: Routing Lanes
      expect(screen.getByText('Team Capacity & Routing Lanes')).toBeInTheDocument()
      expect(screen.getAllByText('Tier-1 Support').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Billing & Operations').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Critical Escalations').length).toBeGreaterThan(0)

      // Stage 2 Triage Queue Bridge
      expect(screen.getByText('Stage 2 Triage Queue Bridge')).toBeInTheDocument()
      expect(screen.getByText('4 Awaiting Triage')).toBeInTheDocument()
      expect(screen.getByText('#1048')).toBeInTheDocument()

      // 35% Action & Pulse: Tenant Health & Pending Invites
      expect(screen.getByText('Tenant Health Pulse')).toBeInTheDocument()
      expect(screen.getByText('PostgreSQL 16')).toBeInTheDocument()
      expect(screen.getByText('Pending Invites')).toBeInTheDocument()
    })

    it('renders Guided Command Deck when zero-state is enabled (Directive 2)', () => {
      render(
        <OverviewVariantA
          organization={mockOrg}
          isZeroState={true}
          onNavigate={vi.fn()}
        />
      )

      expect(screen.getByText(/Guided Command Deck/i)).toBeInTheDocument()
      expect(screen.getByText(/Create Functional Routing Lanes/i)).toBeInTheDocument()
      expect(screen.getByText(/Onboard Dispatch Agents/i)).toBeInTheDocument()
      expect(screen.getByText(/Verify Customer Intake Ingestion/i)).toBeInTheDocument()
    })
  })

  describe('OverviewVariantB (Unified Command Stream)', () => {
    it('renders continuous full-width operational telemetry HUD ribbon and 70/30 workload matrix', () => {
      render(
        <OverviewVariantB
          organization={mockOrg}
          isZeroState={false}
          onNavigate={vi.fn()}
        />
      )

      // HUD Telemetry Ribbon
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Routing Lanes')).toBeInTheDocument()
      expect(screen.getByText('Triage Queue')).toBeInTheDocument()
      expect(screen.getByText('SLA Reliability')).toBeInTheDocument()

      // Workload Matrix
      expect(screen.getByText('Operational Routing Matrix')).toBeInTheDocument()
      expect(screen.getByText('Live Triage Dispatch Stream')).toBeInTheDocument()
    })
  })

  describe('OverviewVariantC (Tri-Pane Multi-Monitor Cockpit)', () => {
    it('renders 25/50/25 tri-pane dispatcher layout', () => {
      render(
        <OverviewVariantC
          organization={mockOrg}
          isZeroState={false}
          onNavigate={vi.fn()}
        />
      )

      expect(screen.getByText('Tri-Pane Multi-Monitor Cockpit')).toBeInTheDocument()
      expect(screen.getByText(/Routing Lanes/)).toBeInTheDocument()
      expect(screen.getByText('Operational Triage Deck')).toBeInTheDocument()
      expect(screen.getByText('Infrastructure')).toBeInTheDocument()
    })
  })

  describe('CentralHubSwitchboardPreview (Decision 2)', () => {
    const mockOrgs = [
      { id: 1, name: 'Acme Support', slug: 'acme', role: 'admin', agentsCount: 14 },
      { id: 2, name: 'Globex Help', slug: 'globex', role: 'agent', agentsCount: 8 },
    ]

    it('renders high-density 40px tenant switchboard table with search filter and mono figures', () => {
      const onLaunch = vi.fn()
      render(
        <CentralHubSwitchboardPreview
          organizations={mockOrgs}
          onCreateNew={vi.fn()}
          onLaunch={onLaunch}
        />
      )

      expect(screen.getByTestId('central-hub-switchboard')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Search workspaces by name or slug/i)).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-acme')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-globex')).toBeInTheDocument()
      expect(screen.getByText('14 members')).toBeInTheDocument()

      // Click launch
      fireEvent.click(screen.getByTestId('workspace-row-acme'))
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[0])
    })
  })

  describe('TeamsTabularLedgerPreview (Decision 3)', () => {
    const mockTeams: Team[] = [
      {
        id: 1,
        organization_id: 1,
        name: 'Tier-1 Support',
        description: 'First response desk',
        members: [
          {
            id: 101,
            organization_id: 1,
            user_id: 1,
            role: 'agent',
            user: { id: 1, name: 'Jane Doe', email: 'jane@acme.com' },
          },
        ],
      },
    ]

    const mockOrgMembers: OrganizationMember[] = [
      {
        id: 1,
        organization_id: 1,
        user_id: 1,
        role: 'agent',
        user: { id: 1, name: 'Jane Doe', email: 'jane@acme.com' },
      },
      {
        id: 2,
        organization_id: 1,
        user_id: 2,
        role: 'admin',
        user: { id: 2, name: 'Marcus Vance', email: 'marcus@acme.com' },
      },
    ]

    it('renders 40px flush tabular ledger with clickable agent stack and modal inspector', () => {
      render(
        <TeamsTabularLedgerPreview
          teams={mockTeams}
          orgMembers={mockOrgMembers}
          isAdmin={true}
          onCreateTeam={vi.fn()}
        />
      )

      expect(screen.getByTestId('teams-tabular-ledger')).toBeInTheDocument()
      expect(screen.getByText('Tier-1 Support')).toBeInTheDocument()
      expect(screen.getByText('First response desk')).toBeInTheDocument()
      expect(screen.getByText('1 member')).toBeInTheDocument()

      // Clicking agent stack triggers modal inspector
      fireEvent.click(screen.getByTitle(/Click to manage team members in inspector modal/i))
      expect(screen.getByText('Manage Team: Tier-1 Support')).toBeInTheDocument()
      expect(screen.getByText('Add Staff Member to Team')).toBeInTheDocument()
    })
  })
})
