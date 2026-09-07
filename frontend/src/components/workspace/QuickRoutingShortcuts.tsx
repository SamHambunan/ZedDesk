import React from 'react'
import { Headset, Receipt, ArrowRight, Mail, Users } from 'lucide-react'
import type { WorkspaceShortcutTeam } from '../../data/mockData'

export interface QuickRoutingShortcutsProps {
  readonly title?: string
  readonly teams?: readonly WorkspaceShortcutTeam[]
  readonly pendingInvitationsCount?: number
  readonly onTeamClick?: (teamId: string | number) => void
  readonly onPendingInvitationsClick?: () => void
  readonly testId?: string
  readonly className?: string
}

export const QuickRoutingShortcuts: React.FC<QuickRoutingShortcutsProps> = ({
  title = 'Quick Routing',
  teams = [],
  pendingInvitationsCount = 0,
  onTeamClick,
  onPendingInvitationsClick,
  testId = 'quick-routing-shortcuts',
  className = '',
}) => {
  const getTeamIcon = (iconType?: WorkspaceShortcutTeam['iconType']) => {
    switch (iconType) {
      case 'tier1':
        return <Headset className="w-[18px] h-[18px] text-accent-glow" />
      case 'billing':
        return <Receipt className="w-[18px] h-[18px] text-sentiment-warning" />
      default:
        return <Users className="w-[18px] h-[18px] text-accent-glow" />
    }
  }

  return (
    <div data-testid={testId} className={`flex flex-col gap-4 ${className}`}>
      <h2 className="text-title-md font-title-md text-text-primary font-semibold">
        {title}
      </h2>

      <div className="flex flex-col gap-3">
        {teams.map((team) => (
          <div
            key={team.id}
            role="button"
            tabIndex={0}
            onClick={() => onTeamClick?.(team.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTeamClick?.(team.id)
              }
            }}
            className="block bg-surface-subpanel rounded-xl border border-border-subtle shadow-keylight p-4 hover:border-accent-glow/50 transition-colors group cursor-pointer text-left"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getTeamIcon(team.iconType)}
                <span className="text-body-default font-body-default text-text-primary font-medium">
                  {team.name}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
            </div>
            <p className="text-body-compact font-body-compact text-text-secondary">
              {team.activeAgentsCount} active agents • {team.openTicketsCount} tickets open
            </p>
          </div>
        ))}

        {pendingInvitationsCount > 0 && (
          <div
            role="button"
            tabIndex={0}
            onClick={onPendingInvitationsClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPendingInvitationsClick?.()
              }
            }}
            className="block bg-surface-container-high rounded-xl border border-border-subtle p-4 border-dashed hover:border-text-secondary transition-colors group mt-1 cursor-pointer text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-[18px] h-[18px] text-text-muted" />
                <span className="text-body-default font-body-default text-text-secondary font-medium">
                  Pending Invitations
                </span>
              </div>
              <span className="bg-surface-subpanel text-text-primary text-[10px] font-mono-data px-1.5 py-0.5 rounded border border-border-subtle tabular-nums">
                {pendingInvitationsCount}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickRoutingShortcuts
