import React, { useState, useContext } from 'react'
import { Plus, Users, Network, Inbox, Gauge } from 'lucide-react'
import { QueryClientContext, QueryClientProvider } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import { useWorkspace } from '../../hooks/useWorkspace'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { TelemetryMetricCard } from './TelemetryMetricCard'
import { RecentActivityFeed } from './RecentActivityFeed'
import { QuickRoutingShortcuts } from './QuickRoutingShortcuts'
import { PerimeterErrorCard } from './PerimeterErrorCard'
import { workspaceContentData } from '../../data/mockData'

function SafeQueryProvider({ children }: { children: React.ReactNode }) {
  const client = useContext(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

export interface WorkspaceShellProps {
  readonly subdomain: string
  readonly token?: string | null
  readonly activeView?: string
  readonly onNavigate?: (view: string) => void
  readonly onLogout?: () => void
  readonly onInviteMemberClick?: () => void
  readonly children?: React.ReactNode
  readonly className?: string
}

const WorkspaceShellContent: React.FC<WorkspaceShellProps> = ({
  subdomain,
  token = null,
  activeView: controlledActiveView,
  onNavigate,
  onLogout,
  onInviteMemberClick,
  children,
  className = '',
}) => {
  const [internalActiveView, setInternalActiveView] = useState('overview')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const activeView = controlledActiveView ?? internalActiveView

  const handleNavigate = (view: string) => {
    setInternalActiveView(view)
    onNavigate?.(view)
  }

  // TanStack Query workspace resolution
  const {
    data: workspaceData,
    isLoading: loadingWorkspace,
    error: queryError,
  } = useWorkspace(subdomain, token)

  // Subdomain Perimeter Access Guards
  const isUnauthenticated = !token || queryError?.status === 401

  if (loadingWorkspace) {
    return (
      <div
        data-testid="workspace-loading"
        className="min-h-screen bg-canvas-base flex items-center justify-center text-text-muted font-body-default"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-glow border-t-transparent rounded-full animate-spin" />
          <span>Loading workspace...</span>
        </div>
      </div>
    )
  }

  if (isUnauthenticated) {
    return (
      <div className="min-h-screen bg-canvas-base flex flex-col justify-center items-center p-4">
        <PerimeterErrorCard
          status={401}
          subdomain={subdomain}
          message={queryError?.message}
        />
      </div>
    )
  }

  if (queryError) {
    return (
      <div className="min-h-screen bg-canvas-base flex flex-col justify-center items-center p-4">
        <PerimeterErrorCard
          status={queryError.status}
          subdomain={subdomain}
          message={queryError.message}
        />
      </div>
    )
  }

  if (!workspaceData) {
    return null
  }

  const { organization, user, role } = workspaceData

  return (
    <div
      className={`min-h-screen bg-canvas-base text-text-primary font-body-default flex flex-col ${className}`}
    >
      {/* Fixed 64px Workspace Top Navigation Bar */}
      <WorkspaceHeader
        organizationName={organization.name}
        organizationSlug={organization.slug}
        user={user}
        role={role}
        onLogout={onLogout}
      />

      <div className="flex flex-1 pt-[64px]">
        {/* Collapsible Left Navigation Sidebar */}
        <WorkspaceSidebar
          organizationName={organization.name}
          organizationSlug={organization.slug}
          activeRoute={activeView}
          role={role}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onNavigate={handleNavigate}
        />

        {/* Main Content Area */}
        <main
          className={`flex-1 overflow-y-auto p-4 md:p-8 bg-canvas-base relative transition-all duration-200 ${
            isSidebarCollapsed ? 'md:ml-16' : 'md:ml-[240px]'
          }`}
        >
          {/* If custom view slotted in, render children */}
          {React.Children.toArray(children).length > 0 ? (
            children
          ) : activeView === 'overview' ? (
            /* Stitch Screen 58931638cff14be4843b2db8e097606c: Operational Overview Dashboard */
            <div className="max-w-7xl mx-auto space-y-6 relative z-10">
              {/* Workspace Hero */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-subtle pb-6">
                <div>
                  <h1 className="text-headline-md font-headline-md font-semibold text-text-primary tracking-tight">
                    {workspaceContentData.hero.title}
                  </h1>
                  <p className="text-body-default font-body-default text-text-secondary mt-1 font-mono-data">
                    {organization.slug}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onInviteMemberClick) {
                      onInviteMemberClick()
                    } else {
                      handleNavigate('invitations')
                    }
                  }}
                  className="h-[32px] px-4 bg-primary-container hover:bg-primary-dark rounded text-label-regular font-label-regular text-white transition-colors shadow-keylight flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{workspaceContentData.hero.inviteMember}</span>
                </button>
              </div>

              {/* Telemetry Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TelemetryMetricCard
                  title={workspaceContentData.telemetry.totalMembers}
                  value={workspaceContentData.telemetry.totalMembersValue}
                  icon={<Users className="w-4 h-4 text-text-secondary" />}
                  trend={{
                    text: workspaceContentData.telemetry.totalMembersTrend,
                    isPositive: true,
                  }}
                />

                <TelemetryMetricCard
                  title={workspaceContentData.telemetry.activeTeams}
                  value={workspaceContentData.telemetry.activeTeamsValue}
                  icon={<Network className="w-4 h-4 text-text-secondary" />}
                />

                <TelemetryMetricCard
                  title={workspaceContentData.telemetry.openTickets}
                  value={workspaceContentData.telemetry.openTicketsValue}
                  icon={<Inbox className="w-4 h-4 text-text-secondary" />}
                  priorityIndicators={[
                    { color: 'critical', label: 'High Priority' },
                    { color: 'warning', label: 'Medium Priority' },
                  ]}
                />

                <TelemetryMetricCard
                  title={workspaceContentData.telemetry.slaStatus}
                  value={workspaceContentData.telemetry.slaValue}
                  icon={<Gauge className="w-4 h-4 text-text-secondary" />}
                  valueColor="positive"
                />
              </div>

              {/* Activity & Quick Routing Split View */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Pane: Recent Activity Feed (2 Cols) */}
                <div className="lg:col-span-2">
                  <RecentActivityFeed
                    title={workspaceContentData.activity.title}
                    activities={workspaceContentData.activity.items}
                  />
                </div>

                {/* Right Pane: Quick Routing Shortcuts (1 Col) */}
                <div className="lg:col-span-1">
                  <QuickRoutingShortcuts
                    title={workspaceContentData.routing.title}
                    teams={workspaceContentData.routing.shortcuts}
                    pendingInvitationsCount={workspaceContentData.routing.pendingInvitationsCount}
                    onTeamClick={() => handleNavigate('teams')}
                    onPendingInvitationsClick={() => handleNavigate('invitations')}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto py-8">
              <div className="bg-surface-subpanel border border-border-subtle rounded-xl p-8 shadow-card text-center">
                <h2 className="text-headline-sm font-semibold text-text-primary mb-2 capitalize">
                  {activeView.replace('-', ' ')}
                </h2>
                <p className="text-body-default text-text-secondary">
                  Section active in {organization.name}.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = (props) => {
  return (
    <SafeQueryProvider>
      <WorkspaceShellContent {...props} />
    </SafeQueryProvider>
  )
}

export default WorkspaceShell
