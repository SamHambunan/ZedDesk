import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'

export interface ContextRibbonProps {
  readonly organizationName: string
  readonly subdomain: string
  readonly lanesCount: number
  readonly agentsOnDutyCount: number
  readonly slaTarget?: string
  readonly isAdmin?: boolean
  readonly onInviteMemberClick?: () => void
}

export const ContextRibbon: React.FC<ContextRibbonProps> = ({
  organizationName,
  subdomain,
  lanesCount,
  agentsOnDutyCount,
  slaTarget = '99.4%',
  isAdmin = false,
  onInviteMemberClick,
}) => {
  const formattedSubdomain = subdomain.includes('.') ? subdomain : `${subdomain}.zeddesk.app`

  return (
    <div
      data-testid="context-ribbon"
      className="bg-surface-subpanel/80 border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            data-testid="context-ribbon-org-name"
            className="text-headline-md font-semibold text-text-primary tracking-tight"
          >
            {organizationName}
          </h1>
          <span
            data-testid="context-ribbon-subdomain"
            className="inline-flex items-center gap-1 font-mono-data text-xs px-2.5 py-0.5 rounded-full bg-surface-container border border-border-prominent text-text-secondary"
          >
            <ShieldCheck className="w-3 h-3 text-sentiment-positive" />
            {formattedSubdomain}
          </span>
        </div>

        <div
          data-testid="context-ribbon-throughput"
          className="text-xs font-mono-data text-text-secondary flex flex-wrap items-center gap-1.5"
        >
          <span className="text-sentiment-positive font-medium">
            {lanesCount} Ingestion Lanes Active
          </span>
          <span className="text-text-muted">{' • '}</span>
          <span className="text-sentiment-positive font-medium">
            {agentsOnDutyCount} Agents On-Duty
          </span>
          <span className="text-text-muted">{' • '}</span>
          <span className="text-sentiment-positive font-medium">
            {slaTarget} SLA
          </span>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center shrink-0">
          <Button
            type="button"
            variant="amber"
            size="standard"
            data-testid="invite-member-button"
            onClick={onInviteMemberClick}
          >
            + Invite Member
          </Button>
        </div>
      )}
    </div>
  )
}
