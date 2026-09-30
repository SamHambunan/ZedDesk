import React, { useState, useMemo, useEffect } from 'react'
import {
  Users2,
  Plus,
  MoreVertical,
  UserPlus,
  Trash2,
  Edit2,
  Search,
  X,
  Check,
  Shield,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Table } from '../ui/Table'
import { Modal } from '../ui/Modal'
import type { Team, OrganizationMember } from '../teams/types'

export interface TeamsTabularLedgerPreviewProps {
  readonly teams: Team[]
  readonly orgMembers?: OrganizationMember[]
  readonly isAdmin?: boolean
  readonly onCreateTeam?: () => void
  readonly onAssignMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly onRemoveMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly onDeleteTeam?: (teamId: number) => Promise<void> | void
  readonly className?: string
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const TeamsTabularLedgerPreview: React.FC<TeamsTabularLedgerPreviewProps> = ({
  teams,
  orgMembers = [],
  isAdmin = true,
  onCreateTeam,
  onAssignMember,
  onRemoveMember,
  onDeleteTeam,
  className = '',
}) => {
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState<Team | null>(null)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [openKebabMenuId, setOpenKebabMenuId] = useState<number | null>(null)
  const [localTeams, setLocalTeams] = useState<Team[]>(teams)

  // Sync props if changed
  useEffect(() => {
    setLocalTeams(teams)
  }, [teams])

  const activeModalTeam = selectedTeamForMembers
    ? localTeams.find((t) => t.id === selectedTeamForMembers.id) || selectedTeamForMembers
    : null

  // Available org members not currently assigned to the team
  const availableOrgMembers = useMemo(() => {
    if (!activeModalTeam) return []
    const assignedUserIds = new Set((activeModalTeam.members || []).map((m) => m.user_id || m.user?.id))
    return orgMembers.filter((m) => {
      const uId = m.user_id || m.user?.id
      if (assignedUserIds.has(uId)) return false
      const name = (m.user?.name || '').toLowerCase()
      const email = (m.user?.email || '').toLowerCase()
      const q = memberSearchQuery.toLowerCase().trim()
      return !q || name.includes(q) || email.includes(q)
    })
  }, [activeModalTeam, orgMembers, memberSearchQuery])

  const handleDetachMember = async (teamId: number, memberId: number) => {
    // Optimistic local update
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, members: (t.members || []).filter((m) => m.id !== memberId) }
          : t
      )
    )
    if (onRemoveMember) {
      await onRemoveMember(teamId, memberId)
    }
  }

  const handleAttachMember = async (teamId: number, member: OrganizationMember) => {
    // Optimistic local update
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              members: [
                ...(t.members || []),
                {
                  id: member.id,
                  organization_id: t.organization_id || 1,
                  user_id: member.user_id || member.user?.id || 0,
                  role: member.role || 'agent',
                  user: member.user,
                },
              ],
            }
          : t
      )
    )
    if (onAssignMember) {
      await onAssignMember(teamId, member.id)
    }
    setMemberSearchQuery('')
  }

  return (
    <div data-testid="teams-tabular-ledger" className={`space-y-4 ${className} text-[#F1F3F7]`}>
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#282A33]">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[#F1F3F7] tracking-tight">
            Teams &amp; Routing Directory
          </h2>
          <span className="px-2.5 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-xs font-['JetBrains_Mono',monospace] text-[#8890A0]">
            {localTeams.length} Active Teams
          </span>
          <span className="text-[11px] text-[#10B981] font-['JetBrains_Mono',monospace]">
            40px Density Ledger
          </span>
        </div>

        {isAdmin ? (
          <Button
            type="button"
            variant="amber"
            size="compact"
            onClick={onCreateTeam}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + Create Team
          </Button>
        ) : (
          <Badge variant="agent">Agent View — Read Only</Badge>
        )}
      </div>

      {/* 2. Structured 40px Flush Density Table */}
      <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
        <Table.Root>
          <Table.Header>
            <Table.Row className="bg-[#1A1C22] h-10 border-b border-[#282A33]">
              <Table.Head className="w-[25%] text-left text-xs font-semibold text-[#8890A0]">Team Name</Table.Head>
              <Table.Head className="w-[35%] text-left text-xs font-semibold text-[#8890A0]">Routing Description</Table.Head>
              <Table.Head className="w-[20%] text-left text-xs font-semibold text-[#8890A0]">Assigned Agents</Table.Head>
              <Table.Head className="w-[12%] text-left text-xs font-semibold text-[#8890A0]">Members</Table.Head>
              {isAdmin && (
                <Table.Head align="right" className="w-[8%] text-right text-xs font-semibold text-[#8890A0]">Actions</Table.Head>
              )}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {localTeams.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="h-32 text-center text-xs text-[#525866]">
                  No teams configured. Create your first routing team to begin.
                </Table.Cell>
              </Table.Row>
            ) : (
              localTeams.map((team) => {
                const members = team.members || []
                const visibleMembers = members.slice(0, 3)
                const overflow = members.length - visibleMembers.length

                return (
                  <Table.Row
                    key={team.id}
                    data-testid={`team-row-${team.id}`}
                    className="h-10 hover:bg-[#1E2026]/50 transition-colors"
                  >
                    {/* Column 1: Team Name */}
                    <Table.Cell>
                      <div className="font-semibold text-xs text-[#F1F3F7]">{team.name}</div>
                    </Table.Cell>

                    {/* Column 2: Routing Description */}
                    <Table.Cell>
                      <div className="text-xs text-[#8890A0] truncate max-w-sm">
                        {team.description || 'General inquiry triage and routing'}
                      </div>
                    </Table.Cell>

                    {/* Column 3: Assigned Agent Stack (Clickable) */}
                    <Table.Cell>
                      <button
                        type="button"
                        onClick={() => setSelectedTeamForMembers(team)}
                        className="flex items-center gap-1.5 p-1 -ml-1 rounded hover:bg-[#282A33] transition-colors cursor-pointer group"
                        title="Click to manage team members in inspector modal"
                      >
                        <div className="flex -space-x-1.5 items-center">
                          {visibleMembers.map((m) => {
                            const name = m.user?.name || 'Agent'
                            const initials = getInitials(name)
                            const isMemberAdmin = (m.role || '').toLowerCase() === 'admin'
                            return (
                              <span
                                key={m.id}
                                className={`w-5 h-5 rounded-full ring-2 ring-[#16181C] text-[9px] font-bold flex items-center justify-center font-['JetBrains_Mono',monospace] ${
                                  isMemberAdmin
                                    ? 'bg-[#8B5CF6]/30 text-[#C4B5FD]'
                                    : 'bg-[#1E2026] text-[#8890A0]'
                                }`}
                              >
                                {initials}
                              </span>
                            )
                          })}
                          {overflow > 0 && (
                            <span className="w-5 h-5 rounded-full ring-2 ring-[#16181C] bg-[#282A33] text-[#8890A0] text-[9px] font-bold flex items-center justify-center font-['JetBrains_Mono',monospace]">
                              +{overflow}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#525866] group-hover:text-[#F59E0B] font-['JetBrains_Mono',monospace]">
                          manage
                        </span>
                      </button>
                    </Table.Cell>

                    {/* Column 4: Member Count Tabular Figures */}
                    <Table.Cell>
                      <span className="font-['JetBrains_Mono',monospace] tabular-nums text-xs text-[#F1F3F7]">
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                      </span>
                    </Table.Cell>

                    {/* Column 5: Action Kebab Menu (Strict RBAC: admin only) */}
                    {isAdmin && (
                      <Table.Cell align="right">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setOpenKebabMenuId(openKebabMenuId === team.id ? null : team.id)}
                            className="w-7 h-7 rounded hover:bg-[#1E2026] flex items-center justify-center text-[#8890A0] hover:text-[#F1F3F7] cursor-pointer"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {openKebabMenuId === team.id && (
                            <div className="absolute right-0 top-8 z-30 w-44 rounded-lg bg-[#16181C] border border-[#282A33] shadow-modal py-1 text-xs text-[#F1F3F7] animate-fadeIn">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTeamForMembers(team)
                                  setOpenKebabMenuId(null)
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-[#1E2026] flex items-center gap-2 cursor-pointer"
                              >
                                <UserPlus className="w-3.5 h-3.5 text-[#F59E0B]" />
                                <span>Manage Members</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenKebabMenuId(null)
                                  if (onDeleteTeam) onDeleteTeam(team.id)
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-[#1E2026] text-[#F43F5E] flex items-center gap-2 cursor-pointer border-t border-[#282A33]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Team</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </Table.Cell>
                    )}
                  </Table.Row>
                )
              })
            )}
          </Table.Body>
        </Table.Root>
      </div>

      {/* 3. Modal Inspector: Dedicated Compound Modal for Member Assignment & Detachment */}
      {activeModalTeam && (
        <Modal.Root open={Boolean(activeModalTeam)} onClose={() => setSelectedTeamForMembers(null)}>
          <Modal.Header>
            <div>
              <Modal.Title>Manage Team: {activeModalTeam.name}</Modal.Title>
              <Modal.Description>
                {activeModalTeam.description || 'Assign or detach staff agents from this routing lane.'}
              </Modal.Description>
            </div>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body className="space-y-4">
            {/* Active Members Subledger */}
            <div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-[#282A33]">
                <span className="font-semibold text-[#8890A0] uppercase tracking-wider font-['JetBrains_Mono',monospace]">
                  Active Assigned Agents ({activeModalTeam.members?.length || 0})
                </span>
              </div>

              <div className="divide-y divide-[#282A33] max-h-48 overflow-y-auto mt-1">
                {(activeModalTeam.members || []).length === 0 ? (
                  <p className="text-xs text-[#525866] py-3 text-center">No agents assigned yet.</p>
                ) : (
                  (activeModalTeam.members || []).map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#1E2026] border border-[#282A33] text-[10px] font-bold flex items-center justify-center font-['JetBrains_Mono',monospace]">
                          {getInitials(m.user?.name)}
                        </span>
                        <div>
                          <div className="font-semibold text-[#F1F3F7]">{m.user?.name}</div>
                          <div className="text-[11px] text-[#8890A0]">{m.user?.email}</div>
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDetachMember(activeModalTeam.id, m.id)}
                          className="px-2 py-1 rounded bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#F43F5E] text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Detach
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Autocomplete Search & Assign Section */}
            {isAdmin && (
              <div className="pt-4 border-t border-[#282A33] space-y-2">
                <label className="text-xs font-semibold text-[#8890A0] uppercase tracking-wider font-['JetBrains_Mono',monospace]">
                  Add Staff Member to Team
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866]" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Search organization members to add..."
                    className="w-full h-8 pl-8 pr-3 bg-[#16181C] border border-[#282A33] focus:border-[#F59E0B] rounded text-xs text-[#F1F3F7] placeholder-[#525866] outline-none"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-[#282A33] bg-[#16181C] rounded border border-[#282A33]">
                  {availableOrgMembers.length === 0 ? (
                    <p className="text-xs text-[#525866] p-3 text-center">
                      {memberSearchQuery ? 'No unassigned members match.' : 'All members assigned.'}
                    </p>
                  ) : (
                    availableOrgMembers.map((m) => (
                      <div
                        key={m.id}
                        className="p-2 px-3 flex items-center justify-between text-xs hover:bg-[#1E2026] transition-colors"
                      >
                        <div>
                          <span className="font-medium text-[#F1F3F7]">{m.user?.name}</span>
                          <span className="text-[11px] text-[#8890A0] ml-2">({m.user?.email})</span>
                        </div>
                        <Button
                          type="button"
                          variant="amber"
                          size="compact"
                          onClick={() => handleAttachMember(activeModalTeam.id, m)}
                        >
                          + Assign
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => setSelectedTeamForMembers(null)}
            >
              Done
            </Button>
          </Modal.Footer>
        </Modal.Root>
      )}
    </div>
  )
}
