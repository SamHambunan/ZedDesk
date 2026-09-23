import React from 'react'
import { ArrowRight } from 'lucide-react'
import { hubContentData } from '../../data/mockData'

export interface HubOrganizationItem {
  readonly id: number
  readonly name: string
  readonly slug: string
  readonly role: 'admin' | 'agent' | string
  readonly membersCount?: number
  readonly agentsCount?: number
}

export interface OrganizationCardProps {
  readonly organization: HubOrganizationItem
  readonly onLaunch?: (org: HubOrganizationItem) => void
  readonly className?: string
}

export const OrganizationCard: React.FC<OrganizationCardProps> = ({
  organization,
  onLaunch,
  className = '',
}) => {
  const initial = organization.name.trim().charAt(0).toUpperCase() || 'O'
  const count = organization.agentsCount ?? organization.membersCount ?? 0
  const isAdmin = organization.role.toLowerCase() === 'admin'

  const handleLaunchClick = () => {
    if (onLaunch) {
      onLaunch(organization)
      return
    }

    if (typeof window !== 'undefined') {
      const port = window.location.port ? `:${window.location.port}` : ':5173'
      const protocol = window.location.protocol || 'http:'
      const currentToken = localStorage.getItem('zeddesk_token')
      const tokenParam = currentToken ? `?token=${encodeURIComponent(currentToken)}` : ''
      const targetUrl = `${protocol}//${organization.slug}.localhost${port}/overview${tokenParam}`
      window.location.href = targetUrl
    }
  }

  return (
    <div
      data-testid={`org-card-${organization.slug}`}
      className={`bg-surface-subpanel border border-border-prominent rounded-xl p-5 shadow-keylight flex items-center justify-between group hover:border-accent-glow/50 transition-colors ${className}`}
    >
      <div className="flex items-center gap-4">
        {/* Org Avatar Box */}
        <div className="w-12 h-12 rounded-lg bg-surface-panel border border-border-subtle flex items-center justify-center shrink-0">
          <span className="font-headline-md text-headline-md text-accent-glow font-semibold select-none">
            {initial}
          </span>
        </div>

        {/* Org Info */}
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-title-md text-title-md text-text-primary font-semibold">
              {organization.name}
            </span>
            {/* Assigned Role Badge: Amethyst Violet for admin, Tactical Graphite for agent */}
            <span
              data-testid="role-badge"
              className={`font-label-caps text-label-caps uppercase px-2 py-0.5 rounded-full border select-none leading-none font-semibold text-[11px] tracking-wider ${
                isAdmin
                  ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-[#8B5CF6]'
                  : 'bg-[#1E2026] border-[#3B3F4D] text-[#94A3B8]'
              }`}
            >
              {organization.role}
            </span>
          </div>
          <span className="font-body-compact text-body-compact text-text-muted">
            {organization.slug}.zeddesk.app
          </span>
        </div>
      </div>

      {/* Right: Agent Count in JetBrains Mono tabular figures & Launch Action */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end shrink-0">
          <span
            className="font-mono-data text-mono-data text-text-primary font-semibold tabular-nums font-['JetBrains_Mono',monospace]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {count}
          </span>
          <span className="font-label-regular text-label-regular text-text-secondary">
            {hubContentData.organizations.agentsLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={handleLaunchClick}
          aria-label={`Launch Workspace for ${organization.name}`}
          className="bg-primary-container text-white font-body-default text-body-default px-4 py-2 rounded shadow-keylight-primary hover:bg-primary-dark transition-colors flex items-center gap-2 h-9 cursor-pointer active:scale-[0.98]"
        >
          <span>{hubContentData.organizations.launchWorkspace}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default OrganizationCard
