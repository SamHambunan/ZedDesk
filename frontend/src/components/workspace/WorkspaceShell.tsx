import React, { useState, useContext, createContext, useMemo } from 'react'
import { Plus, Users, Network, Inbox, Gauge } from 'lucide-react'
import { QueryClientContext, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import { useWorkspace } from '../../hooks/useWorkspace'
import { WorkspaceHeader, type WorkspaceOrganization } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { TelemetryMetricCard } from './TelemetryMetricCard'
import { RecentActivityFeed } from './RecentActivityFeed'
import { QuickRoutingShortcuts } from './QuickRoutingShortcuts'
import { PerimeterErrorCard } from './PerimeterErrorCard'
import { CreateOrganizationModal } from '../hub/CreateOrganizationModal'
import { workspaceContentData } from '../../data/mockData'
import { getApiBaseUrl, getOrganizationUrl } from '../../utils/url'

function SafeQueryProvider({ children }: { children: React.ReactNode }) {
  const client = useContext(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const errorObj = data as { message?: string; errors?: Record<string, string[]> }
    if (errorObj.message) return errorObj.message
    if (errorObj.errors) {
      return Object.values(errorObj.errors).flat().join(', ')
    }
  }
  return fallback
}

export interface WorkspaceShellContextValue {
  readonly organization: {
    readonly id?: number
    readonly name: string
    readonly slug: string
  }
  readonly user: {
    readonly id?: number
    readonly name: string
    readonly email: string
    readonly avatarUrl?: string
  } | null
  readonly role: string | null
  readonly subdomain: string
  readonly token: string | null
  readonly isSidebarCollapsed: boolean
  readonly toggleSidebar: () => void
  readonly setSidebarCollapsed: (collapsed: boolean) => void
  readonly activeRoute: string
  readonly onNavigate?: (route: string) => void
  readonly onLogout?: () => void
  readonly onCopilotClick?: () => void
  readonly onSearch?: (query: string) => void
  readonly onInviteMemberClick?: () => void
  readonly onAuthSuccess?: (token: string, user: any) => void
  readonly isCreateOrgModalOpen: boolean
  readonly openCreateOrgModal: () => void
  readonly closeCreateOrgModal: () => void
  readonly apiUrl?: string
  readonly organizations?: readonly WorkspaceOrganization[]
}

export const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null)

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const ctx = useContext(WorkspaceShellContext)
  if (!ctx) {
    throw new Error('useWorkspaceShell must be used within a WorkspaceShell.Provider')
  }
  return ctx
}

export interface WorkspaceShellProviderProps {
  readonly subdomain?: string
  readonly token?: string | null
  readonly organization?: { readonly id?: number; readonly name: string; readonly slug: string }
  readonly user?: { readonly id?: number; readonly name: string; readonly email: string; readonly avatarUrl?: string } | null
  readonly role?: string | null
  readonly activeView?: string
  readonly onNavigate?: (view: string) => void
  readonly onLogout?: () => void
  readonly onCopilotClick?: () => void
  readonly onSearch?: (query: string) => void
  readonly onInviteMemberClick?: () => void
  readonly onAuthSuccess?: (token: string, user: any) => void
  readonly apiUrl?: string
  readonly organizations?: readonly WorkspaceOrganization[]
  readonly children?: React.ReactNode
}

export const WorkspaceShellProvider: React.FC<WorkspaceShellProviderProps> = ({
  subdomain = '',
  token = null,
  organization: propOrg,
  user: propUser,
  role: propRole,
  activeView: controlledActiveView,
  onNavigate,
  onLogout,
  onCopilotClick,
  onSearch,
  onInviteMemberClick,
  onAuthSuccess,
  apiUrl: propApiUrl,
  organizations,
  children,
}) => {
  const queryClient = useQueryClient()
  const resolvedApiUrl = propApiUrl ?? getApiBaseUrl(subdomain || null)

  const [internalActiveView, setInternalActiveView] = useState('overview')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false)
  const [createOrgError, setCreateOrgError] = useState<string | null>(null)
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false)

  const activeRoute = controlledActiveView ?? internalActiveView

  const handleNavigate = (view: string) => {
    setInternalActiveView(view)
    onNavigate?.(view)
  }

  // TanStack Query workspace resolution if organization is not directly provided
  const shouldQueryWorkspace = Boolean(subdomain && !propOrg)
  const {
    data: workspaceData,
    isLoading: loadingWorkspace,
    error: queryError,
  } = useWorkspace(shouldQueryWorkspace ? subdomain : null, token)

  // Subdomain Perimeter Access Guards
  const isUnauthenticated = shouldQueryWorkspace && (!token || queryError?.status === 401)

  const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined

  const effectiveOrganization = useMemo(() => {
    if (propOrg) return propOrg
    if (workspaceData?.organization) return workspaceData.organization
    return { id: 1, name: subdomain || 'Organization', slug: subdomain || 'org' }
  }, [propOrg, workspaceData, subdomain])

  const effectiveUser = useMemo(() => {
    if (propUser !== undefined) return propUser
    if (workspaceData?.user) return workspaceData.user
    return null
  }, [propUser, workspaceData])

  const effectiveRole = useMemo(() => {
    if (propRole !== undefined) return propRole
    if (workspaceData?.role) return workspaceData.role
    return null
  }, [propRole, workspaceData])

  const handleCreateOrganization = async ({ name, slug }: { name: string; slug: string }) => {
    setIsSubmittingOrg(true)
    setCreateOrgError(null)
    try {
      const res = await fetch(`${resolvedApiUrl}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({ name, slug }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCreateOrgError(extractErrorMessage(data, 'Failed to create organization.'))
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['organizations'] })
      setIsCreateOrgModalOpen(false)

      const targetSlug = data?.organization?.slug || slug
      const targetUrl = getOrganizationUrl(targetSlug, token, '/overview')
      if (typeof window !== 'undefined') {
        window.location.href = targetUrl
      }
    } catch {
      setCreateOrgError('Network error creating organization.')
    } finally {
      setIsSubmittingOrg(false)
    }
  }

  if (shouldQueryWorkspace && loadingWorkspace) {
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

  if (shouldQueryWorkspace && isUnauthenticated) {
    return (
      <div className="min-h-screen bg-canvas-base flex flex-col justify-center items-center p-4">
        <PerimeterErrorCard
          status={401}
          subdomain={subdomain}
          message={queryError?.message}
          returnUrl={returnUrl}
          onAuthSuccess={onAuthSuccess}
        />
      </div>
    )
  }

  if (shouldQueryWorkspace && queryError) {
    return (
      <div className="min-h-screen bg-canvas-base flex flex-col justify-center items-center p-4">
        <PerimeterErrorCard
          status={queryError.status}
          subdomain={subdomain}
          message={queryError.message}
          returnUrl={returnUrl}
          onAuthSuccess={onAuthSuccess}
        />
      </div>
    )
  }

  if (shouldQueryWorkspace && !workspaceData) {
    return null
  }

  const contextValue: WorkspaceShellContextValue = {
    organization: effectiveOrganization,
    user: effectiveUser,
    role: effectiveRole,
    subdomain,
    token,
    isSidebarCollapsed,
    toggleSidebar: () => setIsSidebarCollapsed((prev) => !prev),
    setSidebarCollapsed: setIsSidebarCollapsed,
    activeRoute,
    onNavigate: handleNavigate,
    onLogout,
    onCopilotClick,
    onSearch,
    onInviteMemberClick,
    onAuthSuccess,
    isCreateOrgModalOpen,
    openCreateOrgModal: () => setIsCreateOrgModalOpen(true),
    closeCreateOrgModal: () => setIsCreateOrgModalOpen(false),
    apiUrl: resolvedApiUrl,
    organizations,
  }

  return (
    <WorkspaceShellContext.Provider value={contextValue}>
      {children}

      {/* Reusable Create Organization Compound Modal */}
      <CreateOrganizationModal
        isOpen={isCreateOrgModalOpen}
        onClose={() => setIsCreateOrgModalOpen(false)}
        onSubmit={handleCreateOrganization}
        isSubmitting={isSubmittingOrg}
        error={createOrgError}
        onClearError={() => setCreateOrgError(null)}
        apiUrl={resolvedApiUrl}
        token={token}
      />
    </WorkspaceShellContext.Provider>
  )
}

export const WorkspaceShellRoot: React.FC<{
  readonly children?: React.ReactNode
  readonly className?: string
}> = ({ children, className = '' }) => {
  return (
    <div
      className={`min-h-screen bg-canvas-base text-text-primary font-body-default flex flex-col ${className}`}
    >
      {children}
    </div>
  )
}

export const WorkspaceShellMain: React.FC<{
  readonly children?: React.ReactNode
  readonly className?: string
}> = ({ children, className = '' }) => {
  const { isSidebarCollapsed } = useWorkspaceShell()
  return (
    <main
      role="main"
      className={`flex-1 overflow-y-auto p-4 md:p-8 bg-canvas-base relative transition-all duration-200 ${
        isSidebarCollapsed ? 'md:ml-[60px]' : 'md:ml-[240px]'
      } ${className}`}
    >
      {children}
    </main>
  )
}

export interface WorkspaceShellProps extends WorkspaceShellProviderProps {
  readonly className?: string
}

const WorkspaceShellDefaultContent: React.FC<WorkspaceShellProps> = (props) => {
  const { children, className = '', activeView = 'overview', onInviteMemberClick } = props

  return (
    <WorkspaceShellProvider {...props}>
      <WorkspaceShellRoot className={className}>
        {/* Fixed 64px Workspace Top Navigation Bar */}
        <WorkspaceHeader />

        <div className="flex flex-1 pt-[64px]">
          {/* Collapsible Left Navigation Sidebar (240px to 60px) */}
          <WorkspaceSidebar />

          {/* Main Content Area */}
          <WorkspaceShellMain>
            {React.Children.toArray(children).length > 0 ? (
              children
            ) : activeView === 'overview' ? (
              /* Stitch Screen 58931638cff14be4843b2db8e097606c: Operational Overview Dashboard */
              <OverviewDashboardContent onInviteMemberClick={onInviteMemberClick} />
            ) : (
              <div className="max-w-7xl mx-auto py-8">
                <div className="bg-surface-subpanel border border-border-subtle rounded-xl p-8 shadow-card text-center">
                  <h2 className="text-headline-sm font-semibold text-text-primary mb-2 capitalize">
                    {activeView.replace('-', ' ')}
                  </h2>
                  <p className="text-body-default text-text-secondary">
                    Section active in workspace.
                  </p>
                </div>
              </div>
            )}
          </WorkspaceShellMain>
        </div>
      </WorkspaceShellRoot>
    </WorkspaceShellProvider>
  )
}

function OverviewDashboardContent({ onInviteMemberClick }: { onInviteMemberClick?: () => void }) {
  const { organization, onNavigate } = useWorkspaceShell()

  return (
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
              onNavigate?.('invitations')
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
            onTeamClick={() => onNavigate?.('teams')}
            onPendingInvitationsClick={() => onNavigate?.('invitations')}
          />
        </div>
      </div>
    </div>
  )
}

const WorkspaceShellDefault: React.FC<WorkspaceShellProps> = (props) => {
  return (
    <SafeQueryProvider>
      <WorkspaceShellDefaultContent {...props} />
    </SafeQueryProvider>
  )
}

export const WorkspaceShell = Object.assign(WorkspaceShellDefault, {
  Provider: WorkspaceShellProvider,
  Root: WorkspaceShellRoot,
  Header: WorkspaceHeader,
  Sidebar: WorkspaceSidebar,
  Main: WorkspaceShellMain,
})

export default WorkspaceShell
