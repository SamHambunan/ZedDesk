import React, { createContext, useContext, useState, useMemo } from 'react'
import { Users2, Search, UserMinus, UserPlus, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { getInitials } from './TeamsTabularLedger'
import type { Team, OrganizationMember, TeamMember } from './types'

// 1. Compound Context
interface TeamInspectorContextValue {
  team: Team | null
  orgMembers: readonly OrganizationMember[]
  isAdmin: boolean
  onDetachMember?: (teamId: number, memberId: number) => void
  onAssignMember?: (teamId: number, memberId: number) => void
  isDetachingId?: number | null
  isAssigningId?: number | null
  error?: string | null
}

const TeamInspectorContext = createContext<TeamInspectorContextValue | null>(null)

function useTeamInspectorContext(): TeamInspectorContextValue {
  const context = useContext(TeamInspectorContext)
  if (!context) {
    throw new Error('TeamInspector compound components must be rendered inside TeamInspectorModal.Root')
  }
  return context
}

// 2. Root Component
export interface TeamInspectorModalRootProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly team: Team | null
  readonly orgMembers?: readonly OrganizationMember[]
  readonly isAdmin?: boolean
  readonly onDetachMember?: (teamId: number, memberId: number) => void
  readonly onAssignMember?: (teamId: number, memberId: number) => void
  readonly isDetachingId?: number | null
  readonly isAssigningId?: number | null
  readonly error?: string | null
  readonly children?: React.ReactNode
  readonly className?: string
}

export const TeamInspectorModalRoot: React.FC<TeamInspectorModalRootProps> = ({
  open,
  onClose,
  team,
  orgMembers = [],
  isAdmin = false,
  onDetachMember,
  onAssignMember,
  isDetachingId,
  isAssigningId,
  error,
  children,
  className = '',
}) => {
  const contextValue = useMemo<TeamInspectorContextValue>(
    () => ({
      team,
      orgMembers,
      isAdmin,
      onDetachMember,
      onAssignMember,
      isDetachingId,
      isAssigningId,
      error,
    }),
    [team, orgMembers, isAdmin, onDetachMember, onAssignMember, isDetachingId, isAssigningId, error]
  )

  if (!team) return null

  return (
    <TeamInspectorContext.Provider value={contextValue}>
      <Modal.Root open={open} onClose={onClose} className={`max-w-xl ${className}`}>
        {children}
      </Modal.Root>
    </TeamInspectorContext.Provider>
  )
}

// 3. Header Subcomponent
export const TeamInspectorModalHeader: React.FC<{ readonly className?: string }> = ({
  className = '',
}) => {
  const { team } = useTeamInspectorContext()
  if (!team) return null

  const memberCount = team.members?.length ?? 0

  return (
    <Modal.Header className={className}>
      <div className="space-y-1 pr-6">
        <div className="flex items-center gap-2">
          <Users2 className="w-5 h-5 text-accent-glow shrink-0" />
          <Modal.Title data-testid="inspector-modal-title">
            Team Inspector: {team.name}
          </Modal.Title>
        </div>
        <Modal.Description data-testid="inspector-modal-desc">
          {team.description || 'Functional team routing'}
        </Modal.Description>
        <div className="pt-1">
          <span
            data-testid="inspector-member-count"
            className="inline-flex items-center px-2 py-0.5 rounded bg-surface-subpanel border border-border-subtle text-[11px] font-mono tabular-nums text-text-secondary"
          >
            {memberCount} assigned {memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>
      <Modal.CloseButton />
    </Modal.Header>
  )
}

// 4. Subledger Subcomponent
export const TeamInspectorModalRosterSubledger: React.FC<{ readonly className?: string }> = ({
  className = '',
}) => {
  const { team, isAdmin, onDetachMember, isDetachingId } = useTeamInspectorContext()
  if (!team) return null

  const members = team.members || []

  return (
    <div
      data-testid="inspector-roster-subledger"
      className={`flex flex-col gap-2.5 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-label-caps font-label-caps text-text-muted text-[11px] uppercase tracking-wider font-semibold">
          Assigned Team Roster ({members.length})
        </span>
      </div>

      {members.length === 0 ? (
        <div
          data-testid="subledger-empty-message"
          className="p-4 bg-surface-panel border border-border-subtle rounded-lg text-text-muted text-xs text-center italic"
        >
          No members currently assigned to this team.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
          {members.map((member) => {
            const initials = getInitials(member.user?.name)
            const isDetaching = isDetachingId === member.id

            return (
              <div
                key={member.id}
                data-testid={`subledger-member-${member.id}`}
                className="flex items-center justify-between h-11 px-3 bg-surface-subpanel border border-border-subtle rounded hover:border-border-prominent transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-accent-glow/20 border border-accent-glow/40 text-accent-glow text-[11px] font-semibold flex items-center justify-center shrink-0 select-none">
                    {initials}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span
                      data-testid={`subledger-member-name-${member.id}`}
                      className="text-xs font-semibold text-text-primary truncate"
                    >
                      {member.user?.name || `Member #${member.id}`}
                    </span>
                    <span
                      data-testid={`subledger-member-email-${member.id}`}
                      className="text-[11px] text-text-secondary truncate"
                    >
                      {member.user?.email || 'N/A'}
                    </span>
                  </div>
                  <Badge
                    variant={member.role === 'admin' ? 'admin' : 'agent'}
                    className="ml-1 shrink-0"
                  >
                    {member.role}
                  </Badge>
                </div>

                {isAdmin && (
                  <Button
                    type="button"
                    variant="danger"
                    size="compact"
                    data-testid={`detach-member-btn-${member.id}`}
                    onClick={() => onDetachMember?.(team.id, member.id)}
                    isLoading={isDetaching}
                    leftIcon={!isDetaching ? <UserMinus className="w-3 h-3" /> : undefined}
                    className="h-7 px-2.5 text-[11px] shrink-0 font-medium"
                  >
                    Detach
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 5. Autocomplete Subcomponent
export const TeamInspectorModalAssignAutocomplete: React.FC<{ readonly className?: string }> = ({
  className = '',
}) => {
  const { team, orgMembers, isAdmin, onAssignMember, isAssigningId } = useTeamInspectorContext()
  const [searchQuery, setSearchQuery] = useState('')

  // Strict DOM RBAC: omitted for agents
  if (!isAdmin || !team) return null

  const activeMembers: TeamMember[] = team.members || []

  // Derive unassigned members without useEffect (rerender-derived-state-no-effect)
  const unassignedMembers = useMemo(() => {
    return orgMembers.filter(
      (om) => !activeMembers.some((tm) => tm.id === om.id || tm.user_id === om.user_id)
    )
  }, [orgMembers, activeMembers])

  const normalizedQuery = searchQuery.toLowerCase().trim()
  const filteredCandidates = useMemo(() => {
    if (!normalizedQuery) return unassignedMembers
    return unassignedMembers.filter(
      (m) =>
        (m.user?.name || '').toLowerCase().includes(normalizedQuery) ||
        (m.user?.email || '').toLowerCase().includes(normalizedQuery)
    )
  }, [unassignedMembers, normalizedQuery])

  const handleAssign = (memberId: number) => {
    onAssignMember?.(team.id, memberId)
    setSearchQuery('')
  }

  return (
    <div
      data-testid="inspector-assign-autocomplete"
      className={`flex flex-col gap-2.5 pt-3 border-t border-border-subtle ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-label-caps font-label-caps text-text-muted text-[11px] uppercase tracking-wider font-semibold">
          Add Team Member
        </span>
        <span className="text-[11px] font-mono tabular-nums text-text-muted">
          {unassignedMembers.length} available
        </span>
      </div>

      {unassignedMembers.length === 0 ? (
        <div
          data-testid="no-unassigned-message"
          className="p-3 bg-surface-subpanel border border-border-subtle rounded text-text-muted text-xs text-center"
        >
          All organization members are already assigned to this team.
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            data-testid="autocomplete-search-input"
            type="text"
            placeholder="Search unassigned members to assign..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leadingIcon={<Search className="w-4 h-4 text-text-muted" />}
          />

          {filteredCandidates.length === 0 ? (
            <div
              data-testid="no-search-matches"
              className="p-3 bg-surface-subpanel border border-border-subtle rounded text-text-muted text-xs text-center italic"
            >
              No members match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div
              data-testid="autocomplete-candidate-list"
              className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-0.5"
            >
              {filteredCandidates.map((candidate) => {
                const initials = getInitials(candidate.user?.name)
                const isAssigning = isAssigningId === candidate.id

                return (
                  <div
                    key={candidate.id}
                    data-testid={`candidate-member-${candidate.id}`}
                    onClick={() => handleAssign(candidate.id)}
                    className="flex items-center justify-between h-10 px-3 bg-surface-subpanel border border-border-subtle rounded hover:border-border-prominent hover:bg-surface-subpanel/80 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-surface-panel border border-border-subtle text-text-secondary text-[10px] font-semibold flex items-center justify-center shrink-0 select-none group-hover:border-accent-glow/50">
                        {initials}
                      </span>
                      <span className="text-xs font-medium text-text-primary truncate">
                        {candidate.user?.name || `Member #${candidate.id}`}
                      </span>
                      <span className="text-[11px] text-text-secondary truncate">
                        ({candidate.user?.email || 'N/A'})
                      </span>
                      <Badge
                        variant={candidate.role === 'admin' ? 'admin' : 'agent'}
                        className="text-[9px] px-1 py-0 uppercase shrink-0"
                      >
                        {candidate.role}
                      </Badge>
                    </div>

                    <Button
                      type="button"
                      variant="amber"
                      size="compact"
                      data-testid={`assign-member-btn-${candidate.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAssign(candidate.id)
                      }}
                      isLoading={isAssigning}
                      leftIcon={!isAssigning ? <UserPlus className="w-3 h-3" /> : undefined}
                      className="h-7 px-2 text-[11px] shrink-0 font-medium ml-2"
                    >
                      Assign
                    </Button>
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

// 6. Convenience default wrapper that composes compound pieces
export interface TeamInspectorModalProps extends TeamInspectorModalRootProps {
  readonly isOpen?: boolean
}

export const TeamInspectorModal: React.FC<TeamInspectorModalProps> & {
  Root: typeof TeamInspectorModalRoot
  Header: typeof TeamInspectorModalHeader
  RosterSubledger: typeof TeamInspectorModalRosterSubledger
  AssignAutocomplete: typeof TeamInspectorModalAssignAutocomplete
} = Object.assign(
  ({
    open,
    isOpen,
    onClose,
    team,
    orgMembers = [],
    isAdmin = false,
    onDetachMember,
    onAssignMember,
    isDetachingId,
    isAssigningId,
    error,
    className = '',
  }: TeamInspectorModalProps) => {
    const activeOpen = open ?? isOpen ?? false

    return (
      <TeamInspectorModalRoot
        open={activeOpen}
        onClose={onClose}
        team={team}
        orgMembers={orgMembers}
        isAdmin={isAdmin}
        onDetachMember={onDetachMember}
        onAssignMember={onAssignMember}
        isDetachingId={isDetachingId}
        isAssigningId={isAssigningId}
        error={error}
        className={className}
      >
        <TeamInspectorModalHeader />
        <Modal.Body className="space-y-4">
          {error && (
            <div
              data-testid="inspector-error"
              className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <TeamInspectorModalRosterSubledger />
          <TeamInspectorModalAssignAutocomplete />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" size="compact" onClick={onClose}>
            Done
          </Button>
        </Modal.Footer>
      </TeamInspectorModalRoot>
    )
  },
  {
    Root: TeamInspectorModalRoot,
    Header: TeamInspectorModalHeader,
    RosterSubledger: TeamInspectorModalRosterSubledger,
    AssignAutocomplete: TeamInspectorModalAssignAutocomplete,
  }
)

TeamInspectorModal.displayName = 'TeamInspectorModal'
export default TeamInspectorModal
