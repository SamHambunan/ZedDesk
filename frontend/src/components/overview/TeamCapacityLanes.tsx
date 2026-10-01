import React from 'react'
import { Network, Target, Ticket } from 'lucide-react'
import type { OverviewTeam } from './types'

export interface TeamCapacityLanesProps {
  readonly teams: readonly OverviewTeam[]
  readonly onTeamClick?: (teamId: number) => void
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getCapacityColor(percentage: number): {
  barClass: string
  textClass: string
  badgeClass: string
} {
  if (percentage < 70) {
    return {
      barClass: 'bg-sentiment-positive',
      textClass: 'text-sentiment-positive',
      badgeClass: 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20',
    }
  }
  if (percentage <= 85) {
    return {
      barClass: 'bg-sentiment-warning',
      textClass: 'text-sentiment-warning',
      badgeClass: 'bg-sentiment-warning/10 text-sentiment-warning border-sentiment-warning/20',
    }
  }
  return {
    barClass: 'bg-sentiment-critical',
    textClass: 'text-sentiment-critical',
    badgeClass: 'bg-sentiment-critical/10 text-sentiment-critical border-sentiment-critical/20',
  }
}

export const TeamCapacityLanes: React.FC<TeamCapacityLanesProps> = ({ teams, onTeamClick }) => {
  return (
    <div
      data-testid="team-capacity-lanes"
      className="bg-surface-subpanel/80 border border-border-subtle rounded-xl p-5 shadow-sm space-y-4"
    >
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-accent-glow" />
          <h2 className="text-headline-sm font-semibold text-text-primary">
            Team Capacity & Routing Lanes
          </h2>
        </div>
        <span className="text-xs font-mono-data text-text-muted">
          Dynamic Load Balancing
        </span>
      </div>

      <div className="space-y-4">
        {teams.map((team) => {
          const capacity = team.capacity_percentage ?? 50
          const colors = getCapacityColor(capacity)
          const openTickets = team.open_tickets_count ?? 0
          const slaTarget = team.sla_target ?? '99.4% SLA'
          const members = team.members ?? []

          return (
            <div
              key={team.id}
              data-testid={`team-capacity-row-${team.id}`}
              onClick={() => onTeamClick?.(team.id)}
              className="bg-surface-panel/60 border border-border-subtle/80 hover:border-border-prominent rounded-lg p-4 transition-colors group cursor-pointer"
            >
              {/* Team Header Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-title-md font-semibold text-text-primary group-hover:text-accent-glow transition-colors">
                    {team.name}
                  </span>
                  <span
                    className={`text-[11px] font-mono-data px-2 py-0.5 rounded border ${colors.badgeClass}`}
                  >
                    {capacity}% Load
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Overlapping Avatar Stack */}
                  <div
                    data-testid={`avatar-stack-${team.id}`}
                    className="flex items-center pl-2"
                  >
                    {members.slice(0, 4).map((member, idx) => {
                      const memberName = member.name ?? member.user?.name ?? `Member ${idx + 1}`
                      return (
                        <div
                          key={member.id ?? idx}
                          title={memberName}
                          className="w-6 h-6 rounded-full bg-surface-container border-2 border-surface-panel text-[10px] font-mono-data font-semibold text-text-primary flex items-center justify-center -ml-2 first:ml-0 shadow-sm"
                        >
                          {getInitials(memberName)}
                        </div>
                      )
                    })}
                    {members.length > 4 && (
                      <div className="w-6 h-6 rounded-full bg-surface-container-high border-2 border-surface-panel text-[9px] font-mono-data font-semibold text-text-secondary flex items-center justify-center -ml-2 shadow-sm">
                        +{members.length - 4}
                      </div>
                    )}
                  </div>

                  {/* Open Tickets Count */}
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <Ticket className="w-3.5 h-3.5 text-text-muted" />
                    <span
                      data-testid={`team-ticket-count-${team.id}`}
                      className="tabular-nums font-mono-data font-medium text-text-primary"
                    >
                      {openTickets}
                    </span>
                    <span className="text-text-muted">tickets</span>
                  </div>

                  {/* SLA Target */}
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <Target className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono-data text-sentiment-positive font-medium">
                      {slaTarget}
                    </span>
                  </div>
                </div>
              </div>

              {/* Horizontal Capacity Progress Bar */}
              <div className="w-full bg-surface-container-lowest h-2 rounded-full overflow-hidden p-0.5 border border-border-subtle/50">
                <div
                  data-testid={`capacity-bar-${team.id}`}
                  className={`h-full rounded-full transition-all duration-300 ${colors.barClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, capacity))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
