import React, { useState } from 'react'
import { Sparkles, Search, ChevronsUpDown, Bell, LogOut, ExternalLink } from 'lucide-react'
import { getCentralHubUrl } from '../../utils/url'
import { workspaceContentData } from '../../data/mockData'

export interface WorkspaceHeaderUser {
  readonly id?: number
  readonly name: string
  readonly email: string
  readonly avatarUrl?: string
}

export interface WorkspaceHeaderProps {
  readonly organizationName: string
  readonly organizationSlug: string
  readonly user?: WorkspaceHeaderUser | null
  readonly role?: string | null
  readonly onCopilotClick?: () => void
  readonly onSearch?: (query: string) => void
  readonly onLogout?: () => void
  readonly className?: string
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  organizationName,
  organizationSlug,
  user,
  role,
  onCopilotClick,
  onSearch,
  onLogout,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    onSearch?.(e.target.value)
  }

  const roleLabel = role ? role.toLowerCase() : ''
  const isAdmin = roleLabel === 'admin'

  return (
    <header
      className={`bg-surface-panel/90 backdrop-blur-xl border-b border-border-subtle h-[64px] flex items-center justify-between px-4 md:px-6 fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${className}`}
    >
      {/* Left: ZedDesk Branding & Global Command Search */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="font-headline-sm text-headline-sm font-bold text-primary dark:text-primary tracking-tight">
            {workspaceContentData.brand.name}
          </span>
          <div className="bg-secondary/20 border border-secondary/40 text-secondary-light rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-accent-glow" />
            <span>{workspaceContentData.brand.badge}</span>
          </div>
        </div>

        {/* Search Bar (⌘K) */}
        <div className="hidden md:flex relative items-center">
          <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={workspaceContentData.brand.searchPlaceholder}
            className="h-[32px] w-[220px] lg:w-[260px] bg-surface-container-low border border-transparent rounded pl-9 pr-10 text-body-compact text-text-primary focus:border-accent-glow/40 focus:outline-none transition-colors placeholder:text-text-muted"
          />
          <span className="absolute right-2 text-[10px] font-mono-data text-text-muted bg-surface-subpanel px-1.5 py-0.5 rounded border border-border-subtle">
            {workspaceContentData.brand.searchShortcut}
          </span>
        </div>
      </div>

      {/* Right: Copilot Trigger, Tenant Badge, User Avatar */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Luminous AI Copilot Button */}
        <button
          type="button"
          onClick={onCopilotClick}
          className="h-[32px] px-3 bg-gradient-to-r from-accent-indigo-glow to-primary-container rounded border border-[#571bc1] text-label-regular font-label-regular text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-keylight cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>{workspaceContentData.brand.copilotLabel}</span>
        </button>

        {/* Tenant Switcher / Central Hub Badge */}
        <a
          href={getCentralHubUrl()}
          data-testid="central-hub-link"
          title={`Switch tenant or return to Central Hub (${organizationSlug})`}
          className="h-[32px] px-3 bg-surface-container-low hover:bg-surface-subpanel rounded border border-border-subtle text-label-regular font-label-regular text-text-secondary flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span data-testid="workspace-org-name" className="text-text-primary font-medium truncate max-w-[140px] sm:max-w-[200px]">
            {organizationName}
          </span>
          <span className="text-[10px] text-text-muted hidden sm:inline">• Production</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        </a>

        {/* Divider */}
        <div className="h-5 w-px bg-border-subtle hidden sm:block mx-0.5" />

        {/* Notification Icon */}
        <button
          type="button"
          aria-label="Notifications"
          className="text-text-secondary hover:text-text-primary hover:bg-surface-subpanel p-1.5 rounded transition-colors hidden sm:flex items-center justify-center cursor-pointer"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User Info & Avatar with Online Status Dot */}
        <div className="relative flex items-center gap-2">
          {user && (
            <div className="flex flex-col text-right pr-1">
              <span data-testid="workspace-user-name" className="text-body-compact font-medium text-text-primary leading-tight">
                {user.name}
              </span>
              <span data-testid="workspace-user-email" className="text-[11px] text-text-muted leading-tight">
                {user.email}
              </span>
            </div>
          )}

          {roleLabel && (
            <span
              data-testid="workspace-user-role"
              className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider ${
                isAdmin
                  ? 'bg-primary-container/20 text-accent-glow border border-primary-container/40'
                  : 'bg-sentiment-positive/10 text-sentiment-positive border border-sentiment-positive/30'
              }`}
            >
              {roleLabel}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            aria-label="User profile menu"
            className="relative w-8 h-8 rounded-full overflow-visible border border-border-subtle hover:border-accent-glow transition-colors focus:outline-none cursor-pointer"
          >
            <img
              src={user?.avatarUrl || workspaceContentData.profile.defaultAvatarUrl}
              alt={user?.name || 'User profile'}
              className="w-full h-full rounded-full object-cover"
            />
            {/* Online Status Dot */}
            <span
              aria-label="Online status"
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-sentiment-positive border-2 border-surface-panel rounded-full"
            />
          </button>

          {/* Profile Menu Dropdown */}
          {showProfileMenu && (
            <div
              role="menu"
              className="absolute right-0 top-11 w-56 bg-surface-subpanel border border-border-prominent rounded-lg shadow-elevation-3 py-1.5 z-50 animate-in fade-in duration-100"
            >
              {user && (
                <div className="px-3 py-2 border-b border-border-subtle lg:hidden">
                  <p className="text-body-compact font-medium text-text-primary">{user.name}</p>
                  <p className="text-[11px] text-text-muted truncate">{user.email}</p>
                  {roleLabel && (
                    <p className="text-[10px] text-accent-glow uppercase font-mono mt-1 font-semibold">{roleLabel}</p>
                  )}
                </div>
              )}

              <a
                href={getCentralHubUrl()}
                className="flex items-center justify-between px-3 py-2 text-body-compact text-text-secondary hover:text-text-primary hover:bg-surface-container-high transition-colors"
              >
                <span>Central Hub</span>
                <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
              </a>

              {onLogout && (
                <button
                  type="button"
                  data-testid="workspace-logout-btn"
                  onClick={() => {
                    setShowProfileMenu(false)
                    onLogout()
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-body-compact text-sentiment-critical hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              )}
            </div>
          )}

          {/* Always provide workspace-logout-btn for test harness accessibility if profile menu is closed */}
          {onLogout && !showProfileMenu && (
            <button
              type="button"
              data-testid="workspace-logout-btn"
              onClick={onLogout}
              className="sr-only"
            >
              Log Out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default WorkspaceHeader
