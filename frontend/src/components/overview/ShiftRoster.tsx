import React from 'react'
import { Radio } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { OverviewAgent } from './types'
import { getInitials } from './types'
import type { PresenceMember } from '../../lib/live-client'

const EMPTY_ONLINE_MEMBERS_STATE = (
  <div
    data-testid="online-members-empty"
    className="text-center py-4 text-text-muted text-xs font-mono-data border border-dashed border-border-subtle rounded-lg"
  >
    No members currently online.
  </div>
)

export interface ShiftRosterProps {
  readonly agents: readonly OverviewAgent[]
  readonly onlineMembers?: readonly PresenceMember[]
}

function getStatusDotClass(status: OverviewAgent['status']): string {
  if (status === 'triage') return 'bg-sentiment-warning'
  if (status === 'active') return 'bg-sentiment-positive'
  return 'bg-sentiment-neutral'
}

export const ShiftRoster: React.FC<ShiftRosterProps> = ({ agents, onlineMembers }) => {
  return (
    <div
      data-testid="on-duty-shift-roster"
      className="bg-surface-panel border border-border-subtle rounded-lg p-5 shadow-keylight space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-3">
        <div className="flex items-center justify-between">
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
        <p className="text-[11px] font-mono-data text-text-muted">
          Active shift assignments and queue dispatch load (duty status, distinct from connected presence).
        </p>
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
            const statusDotClass = getStatusDotClass(agent.status)

            return (
              <div
                key={agent.id}
                data-testid={`shift-agent-${agent.id}`}
                className="bg-surface-subpanel/60 border border-border-subtle hover:border-border-prominent rounded-lg p-3.5 flex items-center justify-between gap-3 transition-colors"
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
                      title={`On-duty status: ${agent.status}`}
                      aria-label={`On-duty status: ${agent.status}`}
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

      {/* Online Members Subsection (Issue #151: Transient Presence, distinct from On-Duty / Workload) */}
      {onlineMembers !== undefined && (
        <div
          data-testid="online-members-subsection"
          className="border-t border-border-subtle pt-4 mt-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sentiment-positive shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
              <h3 className="text-headline-sm font-semibold text-text-primary">
                Online
              </h3>
              <span
                data-testid="online-members-count"
                className="text-xs font-mono-data text-sentiment-positive tabular-nums"
              >
                ({onlineMembers.length})
              </span>
            </div>
            <span className="text-[10px] font-mono-data text-text-muted">
              Connected Presence
            </span>
          </div>
          <p className="text-[11px] font-mono-data text-text-muted">
            Connected organization members (transient presence, distinct from on-duty schedule or ticket workload).
          </p>

          {onlineMembers.length === 0 ? (
            EMPTY_ONLINE_MEMBERS_STATE
          ) : (
            <div className="space-y-2" data-testid="online-members-list">
              {onlineMembers.map((member) => {
                const initials = getInitials(member.name)
                return (
                  <div
                    key={member.member_id}
                    data-testid={`online-member-${member.member_id}`}
                    className="bg-surface-subpanel/40 border border-border-subtle rounded-lg p-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        data-testid={`online-member-initials-${member.member_id}`}
                        className="w-7 h-7 rounded-md bg-surface-container border border-border-prominent text-xs font-mono-data font-semibold text-text-primary flex items-center justify-center shrink-0 shadow-xs"
                      >
                        {initials}
                      </div>
                      <span
                        data-testid={`online-member-name-${member.member_id}`}
                        className="text-body-default text-text-primary font-medium truncate"
                      >
                        {member.name}
                      </span>
                    </div>
                    <Badge
                      variant="positive"
                      data-testid={`online-member-badge-${member.member_id}`}
                    >
                      Connected
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
