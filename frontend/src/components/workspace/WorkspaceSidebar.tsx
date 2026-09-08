import React from 'react'
import {
  LayoutDashboard,
  Ticket,
  Users2,
  User,
  Sliders,
  UserPlus,
  FolderCog,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { workspaceContentData } from '../../data/mockData'

export interface WorkspaceSidebarProps {
  readonly organizationName: string
  readonly organizationSlug: string
  readonly activeRoute?: string
  readonly role?: string | null
  readonly isCollapsed?: boolean
  readonly onToggleCollapse?: () => void
  readonly onNavigate?: (route: string) => void
  readonly className?: string
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  organizationName,
  organizationSlug,
  activeRoute = 'overview',
  role,
  isCollapsed = false,
  onToggleCollapse,
  onNavigate,
  className = '',
}) => {
  const isAdmin = (role || '').toLowerCase() === 'admin'

  const navItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-r transition-colors text-body-default font-body-default w-full text-left cursor-pointer border-l-2 ${
      isActive
        ? 'bg-surface-container-high text-text-primary border-[#6366F1] font-medium'
        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-subpanel'
    }`

  const handleNav = (route: string) => {
    onNavigate?.(route)
  }

  return (
    <aside
      aria-label="Workspace Navigation"
      data-testid="workspace-nav"
      className={`bg-surface-panel border-r border-border-subtle fixed left-0 top-[64px] h-[calc(100vh-64px)] ${
        isCollapsed ? 'w-16' : 'w-[240px]'
      } flex flex-col py-4 z-40 transition-all duration-200 ease-in-out select-none ${className}`}
    >
      {/* Organization Header Badge in Sidebar */}
      {!isCollapsed ? (
        <div className="px-4 mb-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface-subpanel border border-border-subtle flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={workspaceContentData.profile.defaultOrgLogoUrl}
              alt={`${organizationName} logo`}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-label-regular font-label-regular text-text-primary truncate font-medium">
              {organizationName}
            </span>
            <span
              data-testid="workspace-slug"
              className="text-[10px] font-mono-data text-text-muted truncate"
            >
              {organizationSlug}
            </span>
          </div>
        </div>
      ) : (
        <div className="px-3 mb-5 flex justify-center">
          <div
            title={`${organizationName} (${organizationSlug})`}
            className="w-8 h-8 rounded bg-surface-subpanel border border-border-subtle flex items-center justify-center overflow-hidden"
          >
            <span data-testid="workspace-slug" className="sr-only">
              {organizationSlug}
            </span>
            <img
              src={workspaceContentData.profile.defaultOrgLogoUrl}
              alt={organizationName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2 flex flex-col gap-4">
        {/* Section: Views */}
        <div>
          {!isCollapsed && (
            <div className="px-3 mb-1.5 text-label-caps font-label-caps text-text-muted text-[11px] font-semibold tracking-wider">
              {workspaceContentData.nav.viewsTitle}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                data-testid="nav-overview"
                onClick={() => handleNav('overview')}
                title={workspaceContentData.nav.overview}
                className={navItemClass(activeRoute === 'overview')}
              >
                <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>{workspaceContentData.nav.overview}</span>}
              </button>
            </li>
            <li>
              <button
                type="button"
                data-testid="nav-tickets"
                onClick={() => handleNav('tickets')}
                title={workspaceContentData.nav.tickets}
                className={navItemClass(activeRoute === 'tickets')}
              >
                <Ticket className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>{workspaceContentData.nav.tickets}</span>}
              </button>
            </li>
            <li>
              <button
                type="button"
                data-testid="nav-teams"
                onClick={() => handleNav('teams')}
                title={workspaceContentData.nav.teams}
                className={navItemClass(activeRoute === 'teams')}
              >
                <Users2 className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>{workspaceContentData.nav.teams}</span>}
              </button>
            </li>
            <li>
              <button
                type="button"
                data-testid="nav-members"
                onClick={() => handleNav('members')}
                title="Members"
                className={navItemClass(activeRoute === 'members' || activeRoute === 'invitations')}
              >
                <User className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>Members</span>}
              </button>
            </li>
          </ul>
        </div>

        {/* Section: Administration (Role-gated: Admin only) */}
        {isAdmin && (
          <div data-testid="nav-admin-section">
            {!isCollapsed && (
              <div className="px-3 mb-1.5 text-label-caps font-label-caps text-text-muted text-[11px] font-semibold tracking-wider">
                {workspaceContentData.nav.adminSectionTitle}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              <li>
                <button
                  type="button"
                  data-testid="nav-org-settings"
                  onClick={() => handleNav('org-settings')}
                  title={workspaceContentData.nav.orgSettings}
                  className={navItemClass(activeRoute === 'org-settings')}
                >
                  <Sliders className="w-[18px] h-[18px] shrink-0" />
                  {!isCollapsed && <span>{workspaceContentData.nav.orgSettings}</span>}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  data-testid="nav-invitations"
                  onClick={() => handleNav('invitations')}
                  title={workspaceContentData.nav.invitations}
                  className={navItemClass(activeRoute === 'invitations' || activeRoute === 'members')}
                >
                  <UserPlus className="w-[18px] h-[18px] shrink-0" />
                  {!isCollapsed && <span>{workspaceContentData.nav.invitations}</span>}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  data-testid="nav-team-management"
                  onClick={() => handleNav('team-management')}
                  title={workspaceContentData.nav.teamManagement}
                  className={navItemClass(activeRoute === 'team-management')}
                >
                  <FolderCog className="w-[18px] h-[18px] shrink-0" />
                  {!isCollapsed && <span>{workspaceContentData.nav.teamManagement}</span>}
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* Static system links */}
        <div>
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                data-testid="nav-knowledge-base"
                onClick={() => handleNav('knowledge-base')}
                title={workspaceContentData.nav.knowledgeBase}
                className={navItemClass(activeRoute === 'knowledge-base')}
              >
                <BookOpen className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>{workspaceContentData.nav.knowledgeBase}</span>}
              </button>
            </li>
            <li>
              <button
                type="button"
                data-testid="nav-settings"
                onClick={() => handleNav('settings')}
                title={workspaceContentData.nav.settings}
                className={navItemClass(activeRoute === 'settings')}
              >
                <Settings className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span>{workspaceContentData.nav.settings}</span>}
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Collapse Trigger */}
      <div className="px-2 mt-auto pt-2 border-t border-border-subtle">
        <button
          type="button"
          data-testid="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center gap-3 px-3 py-2 rounded text-text-secondary hover:text-text-primary hover:bg-surface-subpanel transition-colors text-body-default font-body-default w-full text-left cursor-pointer"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px] mx-auto shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-[18px] h-[18px] shrink-0" />
              <span>{workspaceContentData.nav.collapse}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

export default WorkspaceSidebar
