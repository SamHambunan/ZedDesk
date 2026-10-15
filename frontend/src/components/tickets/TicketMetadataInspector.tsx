import React, { useState, useRef, use } from 'react'
import {
  User,
  Users2,
  Tag as TagIcon,
  Shield,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  X,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type {
  TicketItem,
  TicketStatus,
  TicketPriority,
  OrgTeamOption,
  OrgMemberOption,
  TicketTag,
} from './types'
import { TicketCockpitContext } from './TicketCockpitContext'
import type { AssignmentPair } from './TicketCockpitContext'
import { Toast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

// --- Compound Subcomponent 1: CustomerCard ---
export interface InspectorCustomerCardProps {
  readonly ticket?: TicketItem
  readonly className?: string
}

export const InspectorCustomerCard: React.FC<InspectorCustomerCardProps> = ({
  ticket: propTicket,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  if (!ticket?.customer) return null

  const customer = ticket.customer

  return (
    <div
      data-testid="customer-profile-card"
      className={`p-3 bg-surface-container-low rounded-lg border border-border-subtle space-y-2.5 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-blue-400" />
          <span>Customer Profile</span>
        </span>
        {customer.tier ? (
          <Badge variant="primary" className="text-[10px] font-mono uppercase">
            {customer.tier}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1">
        <div data-testid="customer-name" className="font-medium text-text-primary text-body-sm">
          {customer.name}
        </div>
        <div data-testid="customer-email" className="text-[11px] text-text-muted font-mono truncate">
          {customer.email}
        </div>
        {customer.company ? (
          <div data-testid="customer-company" className="text-[11px] text-text-secondary">
            {customer.company}
          </div>
        ) : null}
      </div>

      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted font-mono">
        <span>Inquiry History:</span>
        <span data-testid="customer-inquiry-count" className="tabular-nums text-text-primary font-medium">
          {customer.total_inquiries ?? 1} tickets
        </span>
      </div>
    </div>
  )
}
InspectorCustomerCard.displayName = 'TicketCockpit.Inspector.CustomerCard'

// --- Compound Subcomponent 2: ClaimCta ---
export interface InspectorClaimCtaProps {
  readonly ticket?: TicketItem
  readonly onClaimTicket?: (ticketId: string) => Promise<void> | void
  readonly onError?: (error: Error) => void
  readonly className?: string
}

export const InspectorClaimCta: React.FC<InspectorClaimCtaProps> = ({
  ticket: propTicket,
  onClaimTicket: propOnClaim,
  onError,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const onClaimTicket = propOnClaim ?? context?.actions.claimTicket

  if (!ticket || ticket.assigned_member_id || context?.state.assignmentConflicts?.[ticket.id]) return null

  const handleClaim = async () => {
    try {
      await onClaimTicket?.(ticket.id)
    } catch (err) {
      if (err instanceof Error) {
        onError?.(err)
      }
    }
  }

  return (
    <div
      className={`p-3 rounded-lg bg-amber-action/10 border border-amber-action/30 flex flex-col gap-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-amber-action font-medium text-xs">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Unassigned Ticket</span>
      </div>
      <p className="text-[11px] text-text-secondary leading-normal">
        Assign this ticket to yourself. Claiming will assign it to you and transition status to{' '}
        <span className="font-mono text-emerald-400">open</span>.
      </p>
      <button
        type="button"
        data-testid="claim-ticket-btn"
        onClick={handleClaim}
        className="w-full h-8 bg-amber-action hover:bg-amber-hover text-on-amber-action font-semibold rounded text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-keylight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Claim Ticket</span>
      </button>
    </div>
  )
}
InspectorClaimCta.displayName = 'TicketCockpit.Inspector.ClaimCta'

// --- Compound Subcomponent 3: Lifecycle ---
function InspectorFieldConflict({
  currentValue,
  intendedValue,
  currentLabel = 'Current value',
  note,
  onUseCurrent,
  onRetry,
  onError,
  onActionSettled,
}: {
  readonly currentValue: React.ReactNode
  readonly intendedValue: React.ReactNode
  readonly currentLabel?: string
  readonly note?: React.ReactNode
  readonly onUseCurrent?: () => Promise<void>
  readonly onRetry?: () => Promise<void>
  readonly onError?: (error: Error) => void
  readonly onActionSettled?: () => void
}) {
  const [isResolving, setIsResolving] = useState(false)

  const resolve = async (action?: () => Promise<void>) => {
    if (!action) return
    setIsResolving(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof Error) onError?.(error)
    } finally {
      setIsResolving(false)
      onActionSettled?.()
    }
  }

  return (
    <div role="status" className="mt-2 rounded border border-amber-action/50 bg-amber-action/10 p-2 text-xs text-text-primary">
      <p>{currentLabel}: {currentValue}</p>
      <p>My choice: {intendedValue}</p>
      {note ? <p className="mt-1 text-text-secondary">{note}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="compact" variant="secondary" disabled={isResolving} onClick={() => resolve(onUseCurrent)}>
          Use current value
        </Button>
        <Button type="button" size="compact" variant="amber" disabled={isResolving} onClick={() => resolve(onRetry)}>
          Retry my change
        </Button>
      </div>
    </div>
  )
}

export interface InspectorLifecycleProps {
  readonly ticket?: TicketItem
  readonly onUpdateStatus?: (ticketId: string, status: TicketStatus) => Promise<void> | void
  readonly onUpdatePriority?: (ticketId: string, priority: TicketPriority) => Promise<void> | void
  readonly onError?: (error: Error) => void
  readonly className?: string
}

export const InspectorLifecycle: React.FC<InspectorLifecycleProps> = ({
  ticket: propTicket,
  onUpdateStatus: propOnStatus,
  onUpdatePriority: propOnPriority,
  onError,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const onUpdateStatus = propOnStatus ?? context?.actions.updateStatus
  const onUpdatePriority = propOnPriority ?? context?.actions.updatePriority
  const useCurrentFieldValue = context?.actions.useCurrentFieldValue
  const retryFieldChange = context?.actions.retryFieldChange
  const setConflictedFieldIntent = context?.actions.setConflictedFieldIntent
  const statusSelectRef = useRef<HTMLSelectElement>(null)
  const prioritySelectRef = useRef<HTMLSelectElement>(null)

  if (!ticket) return null

  const statusConflict = context?.state.fieldConflicts?.[ticket.id]?.status
  const priorityConflict = context?.state.fieldConflicts?.[ticket.id]?.priority

  const handleStatusChange = async (nextStatus: TicketStatus) => {
    if (statusConflict) {
      setConflictedFieldIntent?.(ticket.id, 'status', nextStatus)
      return
    }
    try {
      await onUpdateStatus?.(ticket.id, nextStatus)
    } catch (err) {
      if (err instanceof Error) {
        onError?.(err)
      }
    }
  }

  const handlePriorityChange = async (nextPriority: TicketPriority) => {
    if (priorityConflict) {
      setConflictedFieldIntent?.(ticket.id, 'priority', nextPriority)
      return
    }
    try {
      await onUpdatePriority?.(ticket.id, nextPriority)
    } catch (err) {
      if (err instanceof Error) {
        onError?.(err)
      }
    }
  }

  return (
    <div className={`space-y-3 bg-surface-container-low p-3 rounded-lg border border-border-subtle ${className}`}>
      <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
        Lifecycle & Urgency
      </div>

      <div className="space-y-2">
        <div>
          <label htmlFor="inspector-status" className="block text-[11px] text-text-secondary mb-1">
            Ticket Status
          </label>
          <select
            id="inspector-status"
            ref={statusSelectRef}
            data-testid="inspector-status-select"
            value={statusConflict?.intendedValue ?? ticket.status}
            onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
            className="w-full h-8 px-2.5 bg-surface-panel border border-border-subtle rounded text-xs font-mono text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber cursor-pointer"
          >
            <option value="new">new (Awaiting triage)</option>
            <option value="open">open (In progress)</option>
            <option value="pending">pending (Waiting on customer)</option>
            <option value="resolved">resolved (Completed)</option>
            <option value="closed">closed (Finalized)</option>
          </select>
          {statusConflict ? (
            <InspectorFieldConflict
              currentValue={statusConflict.currentValue}
              intendedValue={statusConflict.intendedValue}
              onUseCurrent={useCurrentFieldValue ? () => useCurrentFieldValue(ticket.id, 'status') : undefined}
              onRetry={retryFieldChange ? () => retryFieldChange(ticket.id, 'status') : undefined}
              onError={onError}
              onActionSettled={() => statusSelectRef.current?.focus()}
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="inspector-priority" className="block text-[11px] text-text-secondary mb-1">
            Priority
          </label>
          <select
            id="inspector-priority"
            ref={prioritySelectRef}
            data-testid="inspector-priority-select"
            value={priorityConflict?.intendedValue ?? ticket.priority}
            onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
            className="w-full h-8 px-2.5 bg-surface-panel border border-border-subtle rounded text-xs font-mono text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber cursor-pointer"
          >
            <option value="urgent">P0 Urgent</option>
            <option value="high">P1 High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {priorityConflict ? (
            <InspectorFieldConflict
              currentValue={priorityConflict.currentValue}
              intendedValue={priorityConflict.intendedValue}
              onUseCurrent={useCurrentFieldValue ? () => useCurrentFieldValue(ticket.id, 'priority') : undefined}
              onRetry={retryFieldChange ? () => retryFieldChange(ticket.id, 'priority') : undefined}
              onError={onError}
              onActionSettled={() => prioritySelectRef.current?.focus()}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
InspectorLifecycle.displayName = 'TicketCockpit.Inspector.Lifecycle'

// --- Compound Subcomponent 4: Assignment (formerly Routing) ---
export interface InspectorAssignmentProps {
  readonly ticket?: TicketItem
  readonly teams?: readonly OrgTeamOption[]
  readonly members?: readonly OrgMemberOption[]
  readonly onAssign?: (ticketId: string, teamId: number | null, memberId: number | null) => Promise<void> | void
  readonly onIncompatibleTeam?: (teamName: string) => void
  readonly onError?: (error: Error) => void
  readonly className?: string
}

export const InspectorAssignment: React.FC<InspectorAssignmentProps> = ({
  ticket: propTicket,
  teams: propTeams,
  members: propMembers,
  onAssign: propOnAssign,
  onIncompatibleTeam,
  onError,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const teams = propTeams ?? context?.state.teams ?? []
  const members = propMembers ?? context?.state.members ?? []
  const onAssign = propOnAssign ?? context?.actions.assign
  const assignmentConflict = ticket ? context?.state.assignmentConflicts?.[ticket.id] : undefined
  const setConflictedAssignmentIntent = context?.actions.setConflictedAssignmentIntent
  const useCurrentAssignment = context?.actions.useCurrentAssignment
  const retryAssignment = context?.actions.retryAssignment
  const teamSelectRef = useRef<HTMLSelectElement>(null)

  if (!ticket) return null

  // Team and cascading member resolution derived directly in render (no effect sync)
  const selectedTeamId = assignmentConflict ? assignmentConflict.intended.teamId : ticket.assigned_team_id ?? null
  const selectedMemberId = assignmentConflict ? assignmentConflict.intended.memberId : ticket.assigned_member_id ?? null
  const assignedTeam = teams.find((t) => t.id === selectedTeamId)
  const eligibleMembers = assignedTeam
    ? members.filter((m) => assignedTeam.memberIds?.includes(m.id) || m.teamIds?.includes(assignedTeam.id))
    : members
  const describeAssignment = (pair: AssignmentPair) => {
    const team = pair.teamId === null ? 'No team assigned' : teams.find((item) => item.id === pair.teamId)?.name ?? `Team #${pair.teamId}`
    const member = pair.memberId === null ? 'Unassigned' : members.find((item) => item.id === pair.memberId)?.name ?? `Organization Member #${pair.memberId}`
    return `Team: ${team}; Organization Member: ${member}`
  }

  const handleTeamChange = async (teamIdStr: string) => {
    const nextTeamId = teamIdStr ? Number(teamIdStr) : null
    let nextMemberId = selectedMemberId

    // Incompatible team check: reset member if not in new team
    if (nextTeamId) {
      const selectedTeamObj = teams.find((t) => t.id === nextTeamId)
      if (selectedTeamObj && nextMemberId) {
        const isMemberInTeam =
          selectedTeamObj.memberIds?.includes(nextMemberId) ||
          members.find((m) => m.id === nextMemberId)?.teamIds?.includes(nextTeamId)
        if (!isMemberInTeam) {
          nextMemberId = null
          onIncompatibleTeam?.(selectedTeamObj.name)
        }
      }
    }

    if (assignmentConflict) {
      setConflictedAssignmentIntent?.(ticket.id, nextTeamId, nextMemberId ?? null)
      return
    }
    try {
      await onAssign?.(ticket.id, nextTeamId, nextMemberId ?? null)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  const handleMemberChange = async (memberIdStr: string) => {
    const nextMemberId = memberIdStr ? Number(memberIdStr) : null
    let nextTeamId = selectedTeamId

    // Auto-populate primary team when selecting a member
    if (nextMemberId) {
      const memberObj = members.find((m) => m.id === nextMemberId)
      if (memberObj && memberObj.teamIds && memberObj.teamIds.length > 0) {
        if (!nextTeamId || !memberObj.teamIds.includes(nextTeamId)) {
          nextTeamId = memberObj.teamIds[0]
        }
      }
    }

    if (assignmentConflict) {
      setConflictedAssignmentIntent?.(ticket.id, nextTeamId ?? null, nextMemberId)
      return
    }
    try {
      await onAssign?.(ticket.id, nextTeamId ?? null, nextMemberId)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  return (
    <div className={`space-y-3 bg-surface-container-low p-3 rounded-lg border border-border-subtle ${className}`}>
      <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
        <Users2 className="w-3.5 h-3.5 text-amber-action" />
        <span>Assignment</span>
      </div>

      <div className="space-y-2">
        <div>
          <label htmlFor="inspector-team" className="block text-[11px] text-text-secondary mb-1">
            Assigned Team
          </label>
          <select
            id="inspector-team"
            data-testid="inspector-team-select"
            ref={teamSelectRef}
            value={selectedTeamId ?? ''}
            onChange={(e) => handleTeamChange(e.target.value)}
            className="w-full h-8 px-2.5 bg-surface-panel border border-border-subtle rounded text-xs font-mono text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber cursor-pointer"
          >
            <option value="">(No team assigned)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="inspector-member" className="block text-[11px] text-text-secondary mb-1">
            Assigned Member
          </label>
          <select
            id="inspector-member"
            data-testid="inspector-member-select"
            value={selectedMemberId ?? ''}
            onChange={(e) => handleMemberChange(e.target.value)}
            className="w-full h-8 px-2.5 bg-surface-panel border border-border-subtle rounded text-xs font-mono text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber cursor-pointer"
          >
            <option value="">(Unassigned)</option>
            {eligibleMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>
        </div>
      </div>
      {assignmentConflict ? (
        <InspectorFieldConflict
          currentLabel="Current assignment"
          currentValue={describeAssignment(assignmentConflict.current)}
          intendedValue={describeAssignment(assignmentConflict.intended)}
          note={assignmentConflict.action === 'claim' ? 'Retrying Claim keeps the current Team.' : undefined}
          onUseCurrent={useCurrentAssignment ? () => useCurrentAssignment(ticket.id) : undefined}
          onRetry={retryAssignment ? () => retryAssignment(ticket.id) : undefined}
          onError={onError}
          onActionSettled={() => teamSelectRef.current?.focus()}
        />
      ) : null}
    </div>
  )
}
InspectorAssignment.displayName = 'TicketCockpit.Inspector.Assignment'
export const InspectorRouting = InspectorAssignment

// --- Compound Subcomponent 5: Tags ---
export interface InspectorTagsProps {
  readonly ticket?: TicketItem
  readonly allTags?: readonly TicketTag[]
  readonly onAddTag?: (ticketId: string, tag: TicketTag) => Promise<void> | void
  readonly onRemoveTag?: (ticketId: string, tagId: number | string) => Promise<void> | void
  readonly onError?: (error: Error) => void
  readonly className?: string
}

export const InspectorTags: React.FC<InspectorTagsProps> = ({
  ticket: propTicket,
  allTags: propTags,
  onAddTag: propOnAdd,
  onRemoveTag: propOnRemove,
  onError,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const allTags = propTags ?? context?.state.allTags ?? []
  const onAddTag = propOnAdd ?? context?.actions.addTag
  const onRemoveTag = propOnRemove ?? context?.actions.removeTag

  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [highlightedTagIndex, setHighlightedTagIndex] = useState(0)

  if (!ticket) return null

  const availableTags = allTags.filter(
    (t) =>
      !ticket.tags?.some((existing) => existing.id === t.id || existing.slug === t.slug) &&
      (newTagInput.trim() ? t.name.toLowerCase().includes(newTagInput.trim().toLowerCase()) : true)
  )

  const handleAddTagFromPool = async (tag: TicketTag) => {
    try {
      await onAddTag?.(ticket.id, tag)
      setIsTagPopoverOpen(false)
      setNewTagInput('')
      setHighlightedTagIndex(0)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  const handleCreateAndAddTag = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = newTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!trimmed) return

    const existing = allTags.find((t) => t.slug === trimmed || t.name.toLowerCase() === trimmed)
    if (existing) {
      await handleAddTagFromPool(existing)
      return
    }

    const newTag: TicketTag = {
      id: Date.now(),
      name: trimmed,
      slug: trimmed,
      color: '#64748B',
    }

    try {
      await onAddTag?.(ticket.id, newTag)
      setIsTagPopoverOpen(false)
      setNewTagInput('')
      setHighlightedTagIndex(0)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (availableTags.length > 0) {
        setHighlightedTagIndex((prev) => (prev + 1) % availableTags.length)
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (availableTags.length > 0) {
        setHighlightedTagIndex((prev) => (prev <= 0 ? availableTags.length - 1 : prev - 1))
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (availableTags.length > 0 && highlightedTagIndex >= 0 && highlightedTagIndex < availableTags.length) {
        handleAddTagFromPool(availableTags[highlightedTagIndex])
      } else if (newTagInput.trim()) {
        handleCreateAndAddTag()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsTagPopoverOpen(false)
      setNewTagInput('')
      setHighlightedTagIndex(0)
    }
  }

  return (
    <div
      data-testid="inline-tag-manager"
      className={`space-y-2 bg-surface-container-low p-3 rounded-lg border border-border-subtle relative ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5 text-amber-action" />
          <span>Tags ({ticket.tags?.length || 0})</span>
        </span>

        <button
          type="button"
          data-testid="add-tag-trigger"
          onClick={() => {
            setIsTagPopoverOpen((prev) => !prev)
            setHighlightedTagIndex(0)
          }}
          className="text-[11px] text-amber-action hover:text-amber-hover font-mono flex items-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber rounded"
        >
          <Plus className="w-3 h-3" />
          <span>Add</span>
        </button>
      </div>

      {/* Tag chips with 1-click detachment */}
      <div className="flex flex-wrap gap-1.5">
        {ticket.tags && ticket.tags.length > 0 ? (
          ticket.tags.map((tag) => (
            <span
              key={tag.id}
              data-testid={`tag-chip-${tag.slug}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-container border border-border-subtle text-text-secondary group"
            >
              <span>{tag.name}</span>
              <button
                type="button"
                data-testid={`remove-tag-${tag.slug}`}
                onClick={async () => {
                  try {
                    await onRemoveTag?.(ticket.id, tag.id)
                  } catch (err) {
                    if (err instanceof Error) onError?.(err)
                  }
                }}
                className="hover:text-sentiment-negative text-text-muted transition-colors rounded p-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
                title={`Remove tag ${tag.name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[11px] text-text-muted italic">No tags attached.</span>
        )}
      </div>

      {/* Autocomplete Popover */}
      {isTagPopoverOpen ? (
        <div
          data-testid="tag-autocomplete-popover"
          className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-surface-canvas border border-amber-action/30 rounded-lg shadow-2xl space-y-2 animate-in fade-in duration-100"
        >
          <form onSubmit={handleCreateAndAddTag} className="flex gap-1.5">
            <input
              type="text"
              autoFocus
              data-testid="tag-search-input"
              value={newTagInput}
              onChange={(e) => {
                setNewTagInput(e.target.value)
                setHighlightedTagIndex(0)
              }}
              onKeyDown={handleTagInputKeyDown}
              placeholder="Search or new tag..."
              className="flex-1 h-7 px-2 bg-surface-container-low border border-border-subtle rounded text-[11px] text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber"
            />
            <button
              type="submit"
              data-testid="submit-tag-btn"
              className="h-7 px-2.5 bg-amber-action hover:bg-amber-hover text-on-amber-action font-semibold text-[11px] rounded cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
            >
              Attach
            </button>
          </form>

          <div data-testid="tag-suggestions-list" className="max-h-32 overflow-y-auto space-y-1">
            {availableTags.map((tag, idx) => {
              const isHighlighted = idx === highlightedTagIndex
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-testid={`tag-option-${tag.slug}`}
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedTagIndex(idx)}
                  onClick={() => handleAddTagFromPool(tag)}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber ${
                    isHighlighted
                      ? 'bg-amber-action/20 text-amber-action border border-amber-action/30'
                      : 'text-text-secondary hover:bg-surface-container'
                  }`}
                >
                  <span>{tag.name}</span>
                  <span className="text-[10px] text-text-muted">+ add</span>
                </button>
              )
            })}
            {availableTags.length === 0 && newTagInput.trim() ? (
              <div className="px-2 py-1 text-[10px] text-text-muted italic">
                Press Enter to create tag "{newTagInput.trim()}"
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
InspectorTags.displayName = 'TicketCockpit.Inspector.Tags'

// --- Compound Subcomponent 6: AuditLog ---
export interface InspectorAuditLogProps {
  readonly ticket?: TicketItem
  readonly className?: string
}

export const InspectorAuditLog: React.FC<InspectorAuditLogProps> = ({
  ticket: propTicket,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const [isAuditExpanded, setIsAuditExpanded] = useState(true)

  if (!ticket) return null

  return (
    <div
      data-testid="assignment-history-section"
      className={`space-y-2 bg-surface-container-low p-3 rounded-lg border border-border-subtle ${className}`}
    >
      <button
        type="button"
        data-testid="toggle-assignment-history"
        onClick={() => setIsAuditExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-[11px] font-mono text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber rounded"
      >
        <span className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-text-muted" />
          <span>Assignment History ({ticket.assignments?.length || 0})</span>
        </span>
        {isAuditExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>

      {isAuditExpanded ? (
        <div data-testid="assignment-history-body" className="space-y-2 max-h-40 overflow-y-auto pt-1">
          {ticket.assignments && ticket.assignments.length > 0 ? (
            ticket.assignments.map((asg) => {
              const memberName = asg.member_name || (asg as any).member?.user?.name || (asg as any).member?.name
              const teamName = asg.team_name || (asg as any).team?.name
              const assignedByName =
                asg.assigned_by_name ||
                (asg as any).assigned_by?.user?.name ||
                (asg as any).assigned_by?.name ||
                'System'

              let title = asg.note
              if (!title) {
                if (memberName && teamName) {
                  title = `Assigned to ${memberName} (${teamName})`
                } else if (memberName) {
                  title = `Assigned to ${memberName}`
                } else if (teamName) {
                  title = `Assigned to ${teamName}`
                } else {
                  title = 'Unassigned'
                }
              }

              return (
                <div
                  key={asg.id}
                  data-testid={`assignment-audit-item-${asg.id}`}
                  className="text-[11px] text-text-secondary font-mono border-l border-white/10 pl-2 space-y-0.5"
                >
                  <div className="text-text-primary font-medium">
                    {title}
                  </div>
                  <div className="text-text-muted text-[10px] flex items-center justify-between">
                    <span>By {assignedByName}</span>
                    <span className="tabular-nums">
                      {(() => {
                        try {
                          return asg.created_at
                            ? new Date(asg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''
                        } catch {
                          return ''
                        }
                      })()}
                    </span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-[11px] text-text-muted italic py-1">
              No assignment history recorded.
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
InspectorAuditLog.displayName = 'TicketCockpit.Inspector.AuditLog'

// --- Compound Subcomponent 7: Destructive ---
export interface InspectorDestructiveProps {
  readonly ticket?: TicketItem
  readonly userRole?: 'admin' | 'agent'
  readonly onDeleteTicket?: (ticketId: string) => Promise<void> | void
  readonly onRestoreTicket?: (ticketId: string) => Promise<void> | void
  readonly onError?: (error: Error) => void
  readonly className?: string
}

export const InspectorDestructive: React.FC<InspectorDestructiveProps> = ({
  ticket: propTicket,
  userRole: propRole,
  onDeleteTicket: propOnDelete,
  onRestoreTicket: propOnRestore,
  onError,
  className = '',
}) => {
  const context = use(TicketCockpitContext)
  const ticket = propTicket ?? context?.state.activeTicket
  const userRole = propRole ?? context?.state.userRole ?? 'agent'
  const onDeleteTicket = propOnDelete ?? context?.actions.deleteTicket
  const onRestoreTicket = propOnRestore ?? context?.actions.restoreTicket

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Strict DOM RBAC: Agent role strictly omits destructive controls from DOM
  if (!ticket || userRole !== 'admin') return null

  const handleConfirmDelete = async () => {
    try {
      await onDeleteTicket?.(ticket.id)
      setIsDeleteModalOpen(false)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  const handleRestore = async () => {
    try {
      await onRestoreTicket?.(ticket.id)
    } catch (err) {
      if (err instanceof Error) onError?.(err)
    }
  }

  return (
    <>
      <div className={`pt-2 border-t border-border-subtle space-y-2 ${className}`}>
        <button
          type="button"
          data-testid="admin-delete-ticket-btn"
          onClick={() => setIsDeleteModalOpen(true)}
          className="w-full h-8 px-3 rounded border border-sentiment-negative/30 hover:bg-sentiment-negative/10 text-sentiment-negative text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sentiment-negative"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Ticket</span>
        </button>

        {ticket.status === 'closed' ? (
          <button
            type="button"
            data-testid="admin-restore-ticket-btn"
            onClick={handleRestore}
            className="w-full h-8 px-3 rounded border border-sentiment-positive/30 hover:bg-sentiment-positive/10 text-sentiment-positive text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sentiment-positive"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Ticket</span>
          </button>
        ) : null}
      </div>

      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-sentiment-negative font-semibold text-body-default">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Confirm Ticket Deletion</span>
          </div>
        }
        description={
          <>
            Are you sure you want to soft-delete Ticket <span className="font-mono text-text-primary">#{ticket.ticket_number}</span>? This action can be reversed by an administrator, but the ticket will be removed from all active triage queues.
          </>
        }
      >
        <div data-testid="delete-confirmation-modal" className="space-y-4">
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="compact"
              data-testid="cancel-delete-btn"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="compact"
              data-testid="confirm-delete-btn"
              onClick={handleConfirmDelete}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
InspectorDestructive.displayName = 'TicketCockpit.Inspector.Destructive'

// --- Assembled Inspector Compound Component ---
export interface TicketMetadataInspectorProps {
  readonly ticket?: TicketItem
  readonly teams?: readonly OrgTeamOption[]
  readonly members?: readonly OrgMemberOption[]
  readonly allTags?: readonly TicketTag[]
  readonly userRole?: 'admin' | 'agent'
  readonly onClaimTicket?: (ticketId: string) => Promise<void> | void
  readonly onUpdateStatus?: (ticketId: string, status: TicketStatus) => Promise<void> | void
  readonly onUpdatePriority?: (ticketId: string, priority: TicketPriority) => Promise<void> | void
  readonly onAssign?: (ticketId: string, teamId: number | null, memberId: number | null) => Promise<void> | void
  readonly onAddTag?: (ticketId: string, tag: TicketTag) => Promise<void> | void
  readonly onRemoveTag?: (ticketId: string, tagId: number | string) => Promise<void> | void
  readonly onDeleteTicket?: (ticketId: string) => Promise<void> | void
  readonly onRestoreTicket?: (ticketId: string) => Promise<void> | void
  readonly className?: string
  readonly children?: React.ReactNode
}

export const TicketMetadataInspector: React.FC<TicketMetadataInspectorProps> = (props) => {
  const context = use(TicketCockpitContext)
  const ticket = props.ticket ?? context?.state.activeTicket
  const userRole = props.userRole ?? context?.state.userRole ?? 'agent'
  const className = props.className ?? ''

  const [toastState, setToastState] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  })

  if (!ticket) return null

  const handleError = (error: Error) => {
    setToastState({ open: true, message: error.message || 'Operation failed. Changes rolled back.' })
  }

  const handleIncompatibleTeam = (teamName: string) => {
    setToastState({
      open: true,
      message: `Assigned member reset to Unassigned (not in ${teamName}).`,
    })
  }

  return (
    <div
      data-testid="ticket-metadata-inspector"
      className={`space-y-5 text-text-primary text-xs ${className}`}
    >
      {/* Ticket Attributes Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-action" />
          <span>Ticket Attributes</span>
        </span>
        <Badge variant={userRole === 'admin' ? 'admin' : 'agent'} className="font-mono text-[10px] uppercase">
          {userRole}
        </Badge>
      </div>

      {props.children ?? (
        <>
          <InspectorCustomerCard ticket={ticket} />
          <InspectorClaimCta
            ticket={ticket}
            onClaimTicket={props.onClaimTicket}
            onError={handleError}
          />
          <InspectorLifecycle
            ticket={ticket}
            onUpdateStatus={props.onUpdateStatus}
            onUpdatePriority={props.onUpdatePriority}
            onError={handleError}
          />
          <InspectorAssignment
            ticket={ticket}
            teams={props.teams}
            members={props.members}
            onAssign={props.onAssign}
            onIncompatibleTeam={handleIncompatibleTeam}
            onError={handleError}
          />
          <InspectorTags
            ticket={ticket}
            allTags={props.allTags}
            onAddTag={props.onAddTag}
            onRemoveTag={props.onRemoveTag}
            onError={handleError}
          />
          <InspectorAuditLog ticket={ticket} />
          <InspectorDestructive
            ticket={ticket}
            userRole={userRole}
            onDeleteTicket={props.onDeleteTicket}
            onRestoreTicket={props.onRestoreTicket}
            onError={handleError}
          />
        </>
      )}

      {/* Global Toast within Inspector */}
      <Toast
        open={toastState.open}
        onClose={() => setToastState((p) => ({ ...p, open: false }))}
        message={toastState.message}
      />
    </div>
  )
}
TicketMetadataInspector.displayName = 'TicketMetadataInspector'
