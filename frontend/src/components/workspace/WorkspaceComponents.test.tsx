import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { TelemetryMetricCard } from './TelemetryMetricCard'
import { RecentActivityFeed } from './RecentActivityFeed'
import { QuickRoutingShortcuts } from './QuickRoutingShortcuts'
import { PerimeterErrorCard } from './PerimeterErrorCard'

describe('WorkspaceHeader Component', () => {
  it('renders fixed 64px top navigation with brand, AI badge, search, Copilot trigger, tenant badge, and user avatar with online dot', () => {
    const handleCopilot = vi.fn()
    const handleLogout = vi.fn()
    const handleSearch = vi.fn()

    render(
      <WorkspaceHeader
        organizationName="Acme Corp Support"
        organizationSlug="acme"
        user={{
          name: 'Jane Administrator',
          email: 'jane@acme.com',
          avatarUrl: 'https://example.com/jane.jpg',
        }}
        role="admin"
        onCopilotClick={handleCopilot}
        onSearch={handleSearch}
        onLogout={handleLogout}
      />
    )

    // Header element has 64px height and border
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('h-[64px]')
    expect(header).toHaveClass('border-b')

    // Brand and violet AI badge
    expect(screen.getByText('ZedDesk')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()

    // ⌘K command search bar
    const searchInput = screen.getByPlaceholderText(/search\.\.\./i)
    expect(searchInput).toBeInTheDocument()
    expect(screen.getByText('⌘K')).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'ticket' } })
    expect(handleSearch).toHaveBeenCalledWith('ticket')

    // Luminous AI Copilot button
    const copilotBtn = screen.getByRole('button', { name: /ai copilot/i })
    expect(copilotBtn).toBeInTheDocument()
    fireEvent.click(copilotBtn)
    expect(handleCopilot).toHaveBeenCalledTimes(1)

    // Tenant switcher link to Central Hub
    const tenantLink = screen.getByTestId('central-hub-link')
    expect(tenantLink).toBeInTheDocument()
    expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corp Support')

    // User avatar with online status indicator dot
    const onlineDot = screen.getByLabelText(/online status/i)
    expect(onlineDot).toBeInTheDocument()
    expect(onlineDot).toHaveClass('bg-sentiment-positive')

    expect(screen.getByTestId('workspace-user-name')).toHaveTextContent('Jane Administrator')
    expect(screen.getByTestId('workspace-user-email')).toHaveTextContent('jane@acme.com')
    expect(screen.getByTestId('workspace-user-role')).toHaveTextContent('admin')
  })
})

describe('WorkspaceSidebar Component', () => {
  it('renders navigation links with active 2px left indicator bar in #6366F1', () => {
    const handleNavigate = vi.fn()
    const handleToggle = vi.fn()

    const { rerender } = render(
      <WorkspaceSidebar
        organizationName="Acme Corp Support"
        organizationSlug="acme"
        activeRoute="overview"
        role="admin"
        onNavigate={handleNavigate}
        onToggleCollapse={handleToggle}
      />
    )

    // Subdomain slug
    expect(screen.getByTestId('workspace-slug')).toHaveTextContent('acme')

    // Navigation links
    const overviewNav = screen.getByTestId('nav-overview')
    const ticketsNav = screen.getByTestId('nav-tickets')
    const teamsNav = screen.getByTestId('nav-teams')
    const orgSettingsNav = screen.getByTestId('nav-org-settings')
    const invitesNav = screen.getByTestId('nav-invitations')
    const teamMgmtNav = screen.getByTestId('nav-team-management')
    const kbNav = screen.getByTestId('nav-knowledge-base')
    const settingsNav = screen.getByTestId('nav-settings')

    expect(overviewNav).toBeInTheDocument()
    expect(ticketsNav).toBeInTheDocument()
    expect(teamsNav).toBeInTheDocument()
    expect(orgSettingsNav).toBeInTheDocument()
    expect(invitesNav).toBeInTheDocument()
    expect(teamMgmtNav).toBeInTheDocument()
    expect(kbNav).toBeInTheDocument()
    expect(settingsNav).toBeInTheDocument()

    // Active route has 2px left indicator bar in #6366F1
    expect(overviewNav).toHaveClass('border-[#6366F1]')
    expect(overviewNav).toHaveClass('border-l-2')
    expect(ticketsNav).toHaveClass('border-transparent')

    // Click tickets nav
    fireEvent.click(ticketsNav)
    expect(handleNavigate).toHaveBeenCalledWith('tickets')

    // Rerender with activeRoute="tickets"
    rerender(
      <WorkspaceSidebar
        organizationName="Acme Corp Support"
        organizationSlug="acme"
        activeRoute="tickets"
        role="admin"
        onNavigate={handleNavigate}
        onToggleCollapse={handleToggle}
      />
    )
    expect(ticketsNav).toHaveClass('border-[#6366F1]')
    expect(overviewNav).toHaveClass('border-transparent')

    // Collapse toggle button
    const collapseBtn = screen.getByTestId('sidebar-collapse-btn')
    fireEvent.click(collapseBtn)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('hides administration section for agent role', () => {
    render(
      <WorkspaceSidebar
        organizationName="Acme Corp Support"
        organizationSlug="acme"
        activeRoute="overview"
        role="agent"
      />
    )

    expect(screen.getByTestId('nav-tickets')).toBeInTheDocument()
    expect(screen.getByTestId('nav-teams')).toBeInTheDocument()

    expect(screen.queryByTestId('nav-admin-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-org-settings')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-invitations')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-team-management')).not.toBeInTheDocument()
  })
})

describe('TelemetryMetricCard Component', () => {
  it('renders operational metric values with tabular numbers and status indicators', () => {
    render(
      <TelemetryMetricCard
        title="Open Tickets"
        value={24}
        priorityIndicators={[
          { color: 'critical', label: 'High Priority' },
          { color: 'warning', label: 'Medium Priority' },
        ]}
        testId="card-tickets"
      />
    )

    expect(screen.getByTestId('card-tickets')).toBeInTheDocument()
    expect(screen.getByText('Open Tickets')).toBeInTheDocument()
    expect(screen.getByText('24')).toHaveClass('tabular-nums')
    expect(screen.getByTitle('High Priority')).toHaveClass('bg-sentiment-critical')
    expect(screen.getByTitle('Medium Priority')).toHaveClass('bg-sentiment-warning')
  })

  it('renders positive SLA status with positive styling', () => {
    render(
      <TelemetryMetricCard
        title="SLA Status"
        value="99.4%"
        valueColor="positive"
        testId="card-sla"
      />
    )

    const valueEl = screen.getByText('99.4%')
    expect(valueEl).toHaveClass('text-sentiment-positive')
    expect(valueEl).toHaveClass('tabular-nums')
  })
})

describe('RecentActivityFeed Component', () => {
  it('renders recent activities with timeline node indicators', () => {
    const activities = [
      {
        id: 1,
        description: 'Sarah Jenkins joined the workspace.',
        timestamp: '2 hours ago',
        iconType: 'person' as const,
      },
      {
        id: 2,
        description: 'Alex Chen assigned to',
        highlight: 'Support Tier 1',
        timestamp: '5 hours ago',
        iconType: 'group' as const,
      },
    ]

    render(<RecentActivityFeed activities={activities} />)

    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.getByText('Sarah Jenkins joined the workspace.')).toBeInTheDocument()
    expect(screen.getByText('Support Tier 1')).toBeInTheDocument()
    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
    expect(screen.getByText('5 hours ago')).toBeInTheDocument()
  })
})

describe('QuickRoutingShortcuts Component', () => {
  it('renders quick routing shortcuts with agent and ticket counts', () => {
    const handleTeamClick = vi.fn()
    const handleInvitesClick = vi.fn()

    const teams = [
      {
        id: 't1',
        name: 'Support Tier 1',
        activeAgentsCount: 12,
        openTicketsCount: 8,
        iconType: 'tier1' as const,
      },
      {
        id: 't2',
        name: 'Billing',
        activeAgentsCount: 4,
        openTicketsCount: 16,
        iconType: 'billing' as const,
      },
    ]

    render(
      <QuickRoutingShortcuts
        teams={teams}
        pendingInvitationsCount={2}
        onTeamClick={handleTeamClick}
        onPendingInvitationsClick={handleInvitesClick}
      />
    )

    expect(screen.getByText('Quick Routing')).toBeInTheDocument()
    expect(screen.getByText('Support Tier 1')).toBeInTheDocument()
    expect(screen.getByText('12 active agents • 8 tickets open')).toBeInTheDocument()

    const tier1Btn = screen.getByText('Support Tier 1').closest('[role="button"]')
    expect(tier1Btn).toBeInTheDocument()
    fireEvent.click(tier1Btn!)
    expect(handleTeamClick).toHaveBeenCalledWith('t1')

    const pendingCard = screen.getByText('Pending Invitations').closest('[role="button"]')
    expect(pendingCard).toBeInTheDocument()
    fireEvent.click(pendingCard!)
    expect(handleInvitesClick).toHaveBeenCalledTimes(1)
  })
})

describe('PerimeterErrorCard Component', () => {
  it('renders 401 unauthorized perimeter error with login link', () => {
    render(<PerimeterErrorCard status={401} subdomain="acme" />)

    expect(screen.getByTestId('workspace-unauthenticated')).toBeInTheDocument()
    expect(screen.getByText('Authentication Required')).toBeInTheDocument()
    expect(screen.getByTestId('login-redirect-btn')).toHaveTextContent('Log In at Central Hub')
  })

  it('renders 403 forbidden access denied error', () => {
    render(<PerimeterErrorCard status={403} subdomain="beta" />)

    expect(screen.getByTestId('workspace-403')).toBeInTheDocument()
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByText('You are not an Organization Member of this Organization.')).toBeInTheDocument()
    expect(screen.getByText('Return to Central Hub')).toBeInTheDocument()
  })

  it('renders 404 organization not found error', () => {
    render(<PerimeterErrorCard status={404} subdomain="unknown-org" />)

    expect(screen.getByTestId('workspace-404')).toBeInTheDocument()
    expect(screen.getByText('Organization Not Found')).toBeInTheDocument()
    expect(screen.getByText(/the organization subdomain/i)).toBeInTheDocument()
    expect(screen.getByText('unknown-org')).toBeInTheDocument()
    expect(screen.getByText('Return to Central Hub')).toBeInTheDocument()
  })
})
