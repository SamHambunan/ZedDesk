import React from 'react'
import { Users2, Pencil, Trash2 } from 'lucide-react'
import { Table } from '../ui/Table'
import { Button } from '../ui/Button'
import type { Team, OrganizationMember } from './types'

export interface TeamsTabularLedgerProps {
  readonly teams: readonly Team[]
  readonly orgMembers?: readonly OrganizationMember[]
  readonly isAdmin?: boolean
  readonly onInspectTeam?: (team: Team) => void
  readonly onEditTeam?: (team: Team) => void
  readonly onDeleteTeam?: (team: Team) => void
  readonly className?: string
}

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_BG_COLORS = [
  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  'bg-sky-500/20 text-sky-300 border-sky-500/40',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'bg-rose-500/20 text-rose-300 border-rose-500/40',
]

export const TeamsTabularLedger: React.FC<TeamsTabularLedgerProps> = ({
  teams,
  isAdmin = false,
  onInspectTeam,
  onEditTeam,
  onDeleteTeam,
  className = '',
}) => {
  const maxVisibleAvatars = 2

  return (
    <div
      data-testid="teams-tabular-ledger"
      className={`bg-surface-panel border border-border-subtle rounded-lg shadow-keylight overflow-hidden ${className}`}
    >
      <Table.Root>
        <Table.Header>
          <Table.Row className="bg-surface-subpanel/50 h-10 border-b border-border-subtle">
            <Table.Head className="w-[28%] text-left text-xs font-semibold text-text-secondary">
              Team Name
            </Table.Head>
            <Table.Head className="w-[32%] text-left text-xs font-semibold text-text-secondary">
              Routing Description
            </Table.Head>
            <Table.Head className="w-[18%] text-left text-xs font-semibold text-text-secondary">
              Assigned Agents
            </Table.Head>
            <Table.Head className="w-[10%] text-left text-xs font-semibold text-text-secondary">
              Members
            </Table.Head>
            <Table.Head align="right" className="w-[12%] text-right text-xs font-semibold text-text-secondary">
              Actions
            </Table.Head>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {teams.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={5} className="h-32 text-center text-xs text-text-muted">
                No teams configured in this organization.
              </Table.Cell>
            </Table.Row>
          ) : (
            teams.map((team) => {
              const members = team.members || []
              const memberCount = members.length
              const visibleMembers = members.slice(0, maxVisibleAvatars)
              const remainingCount = memberCount - visibleMembers.length

              return (
                <Table.Row
                  key={team.id}
                  data-testid={`team-row-${team.id}`}
                  className="h-10 border-b border-border-subtle transition-colors hover:bg-surface-subpanel/40"
                >
                  {/* Column 1: Team Name */}
                  <Table.Cell>
                    <div
                      data-testid={`team-name-${team.id}`}
                      className="font-semibold text-xs text-text-primary truncate"
                    >
                      {team.name}
                    </div>
                  </Table.Cell>

                  {/* Column 2: Routing Description */}
                  <Table.Cell>
                    <div
                      data-testid={`team-description-${team.id}`}
                      className="text-xs text-text-secondary truncate max-w-sm"
                    >
                      {team.description || 'No routing description'}
                    </div>
                  </Table.Cell>

                  {/* Column 3: Assigned Agent Avatar Stack */}
                  <Table.Cell>
                    <button
                      type="button"
                      data-testid={`team-avatar-stack-${team.id}`}
                      onClick={() => onInspectTeam?.(team)}
                      aria-label={`Inspect members of ${team.name}`}
                      className="flex items-center -space-x-1.5 focus:outline-none focus:ring-1 focus:ring-accent-glow rounded py-0.5 group cursor-pointer"
                    >
                      {memberCount === 0 ? (
                        <span className="text-[11px] text-text-muted italic group-hover:text-text-secondary">
                          Unassigned
                        </span>
                      ) : (
                        <>
                          {visibleMembers.map((m, idx) => {
                            const initials = getInitials(m.user?.name)
                            const colorClass = AVATAR_BG_COLORS[idx % AVATAR_BG_COLORS.length]
                            return (
                              <span
                                key={m.id}
                                title={m.user?.name || `Member #${m.id}`}
                                className={`w-6 h-6 rounded-full border text-[10px] font-semibold flex items-center justify-center select-none shadow-sm transition-transform group-hover:scale-105 ${colorClass}`}
                              >
                                {initials}
                              </span>
                            )
                          })}
                          {remainingCount > 0 && (
                            <span
                              title={`${remainingCount} more members`}
                              className="w-6 h-6 rounded-full bg-surface-subpanel border border-border-subtle text-[10px] font-mono tabular-nums font-semibold text-text-secondary flex items-center justify-center select-none shadow-sm group-hover:scale-105"
                            >
                              +{remainingCount}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </Table.Cell>

                  {/* Column 4: Tabular Member Count */}
                  <Table.Cell>
                    <span
                      data-testid={`team-member-count-${team.id}`}
                      className="font-mono tabular-nums text-xs font-semibold text-text-primary"
                    >
                      {memberCount}
                    </span>
                  </Table.Cell>

                  {/* Column 5: Actions Menu */}
                  <Table.Cell align="right">
                    {isAdmin ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          data-testid={`manage-members-btn-${team.id}`}
                          onClick={() => onInspectTeam?.(team)}
                          aria-label={`Manage members of ${team.name}`}
                          className="h-7 px-2 text-[11px] gap-1 text-text-secondary hover:text-text-primary"
                        >
                          <Users2 className="w-3.5 h-3.5" />
                          <span>Members</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          data-testid={`edit-team-btn-${team.id}`}
                          onClick={() => onEditTeam?.(team)}
                          aria-label={`Edit ${team.name}`}
                          className="h-7 px-2 text-[11px] text-text-secondary hover:text-text-primary"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          data-testid={`delete-team-btn-${team.id}`}
                          onClick={() => onDeleteTeam?.(team)}
                          aria-label={`Delete ${team.name}`}
                          className="h-7 px-2 text-[11px] text-sentiment-negative hover:bg-sentiment-negative/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-text-muted text-xs select-none">—</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              )
            })
          )}
        </Table.Body>
      </Table.Root>
    </div>
  )
}

TeamsTabularLedger.displayName = 'TeamsTabularLedger'
export default TeamsTabularLedger
