import React from 'react'
import { Users, Radio } from 'lucide-react'
import type { OverviewAgent } from './types'

export interface ShiftRosterProps {
  readonly agents: readonly OverviewAgent[]
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const ShiftRoster: React.FC<ShiftRosterProps> = ({ agents }) => {
  return (
    <div
      data-testid="on-duty-shift-roster"
      className="bg-surface-subpanel/80 border border-border-subtle rounded-xl p-5 shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-sentiment-positive animate-pulse" />
          <h2 className="text-headline-sm font-semibold text-text-primary">
            On-Duty Shift Roster
          </h2>
        </div>
        <span className="text-xs font-mono-data text-sentiment-positive">
          Live Dispatch
        </span>
      </div>

      {/* Agents Roster List */}
      <div className="space-y-3">
        {agents.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-xs font-mono-data border border-dashed border-border-subtle rounded-lg">
            No agents currently on-duty.
          </div>
        ) : (
          agents.map((agent) => {
            const initials = getInitials(agent.name)
            const routingLanes = agent.teams && agent.teams.length > 0 ? agent.teams.join(', ') : 'Unassigned'
            const ticketLoad = agent.ticket_load ?? 0
            const isTriage = agent.status === 'triage'
            const statusDotClass = isTriage ? 'bg-sentiment-warning' : 'bg-sentiment-positive'

            return (
              <div
                key={agent.id}
                data-testid={`shift-agent-${agent.id}`}
                className="bg-surface-panel/60 border border-border-subtle/80 hover:border-border-prominent rounded-lg p-3.5 flex items-center justify-between gap-3 transition-colors"
              >
                {/* Agent Profile & Lanes */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Initials Pill with Status Dot */}
                  <div className="relative shrink-0">
                    <div
                      data-testid={`agent-initials-${agent.id}`}
                      className="w-8 h-8 rounded-lg bg-surface-container border border-border-prominent text-xs font-mono-data font-semibold text-text-primary flex items-center justify-center shadow-sm"
                    >
                      {initials}
                    </div>
                    <span
                      data-testid={`agent-status-dot-${agent.id}`}
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-panel ${statusDotClass}`}
                      title={agent.status}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="text-body-default font-medium text-text-primary truncate">
                      {agent.name}
                    </div>
                    <div className="text-xs text-text-secondary truncate mt-0.5 font-mono-data">
                      {routingLanes}
                    </div>
                  </div>
                </div>

                {/* Ticket Load in Tabular Figures */}
                <div className="text-right shrink-0">
                  <div
                    data-testid={`agent-load-${agent.id}`}
                    className="text-title-md font-mono-data font-semibold text-text-primary tabular-nums"
                  >
                    {ticketLoad}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono-data uppercase tracking-wider">
                    Tickets
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
