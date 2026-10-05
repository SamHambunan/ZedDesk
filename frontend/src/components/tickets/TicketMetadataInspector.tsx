import React, { useState, use } from 'react'
import {
  User,
  Users2,
  Tag as TagIcon,
  Shield,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  History,
  X,
  Plus,
  Sparkles,
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

export interface TicketMetadataInspectorProps {
  readonly ticket?: TicketItem
  readonly teams?: readonly OrgTeamOption[]
  readonly members?: readonly OrgMemberOption[]
  readonly allTags?: readonly TicketTag[]
  readonly userRole?: 'admin' | 'agent'
  readonly onClaimTicket?: (ticketId: string) => void
  readonly onUpdateStatus?: (ticketId: string, status: TicketStatus) => void
  readonly onUpdatePriority?: (ticketId: string, priority: TicketPriority) => void
  readonly onAssign?: (ticketId: string, teamId: number | null, memberId: number | null) => void
  readonly onAddTag?: (ticketId: string, tag: TicketTag) => void
  readonly onRemoveTag?: (ticketId: string, tagId: number) => void
  readonly onDeleteTicket?: (ticketId: string) => void
  readonly className?: string
}

export const TicketMetadataInspector: React.FC<TicketMetadataInspectorProps> = (props) => {
  const context = use(TicketCockpitContext)

  const ticket = props.ticket ?? context?.state.activeTicket
  const teams = props.teams ?? context?.state.teams ?? []
  const members = props.members ?? context?.state.members ?? []
  const allTags = props.allTags ?? context?.state.allTags ?? []
  const userRole = props.userRole ?? context?.state.userRole ?? 'agent'
  const onClaimTicket = props.onClaimTicket ?? context?.actions.claimTicket
  const onUpdateStatus = props.onUpdateStatus ?? context?.actions.updateStatus
  const onUpdatePriority = props.onUpdatePriority ?? context?.actions.updatePriority
  const onAssign = props.onAssign ?? context?.actions.assign
  const onAddTag = props.onAddTag ?? context?.actions.addTag
  const onRemoveTag = props.onRemoveTag ?? context?.actions.removeTag
  const onDeleteTicket = props.onDeleteTicket ?? context?.actions.deleteTicket
  const className = props.className ?? ''

  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  if (!ticket) return null

  const isUnassigned = !ticket.assigned_member_id && !ticket.assigned_team_id
  const assignedTeam = teams.find((t) => t.id === ticket.assigned_team_id)

  // Filter members based on selected team for cascading assignment
  const eligibleMembers = assignedTeam
    ? members.filter((m) => assignedTeam.memberIds.includes(m.id))
    : members

  const handleTeamChange = (teamIdStr: string) => {
    const nextTeamId = teamIdStr ? Number(teamIdStr) : null
    let nextMemberId = ticket.assigned_member_id

    // Incompatible team check: reset member if not in new team
    if (nextTeamId) {
      const selectedTeamObj = teams.find((t) => t.id === nextTeamId)
      if (selectedTeamObj && nextMemberId && !selectedTeamObj.memberIds.includes(nextMemberId)) {
        nextMemberId = null
      }
    }

    onAssign(ticket.id, nextTeamId, nextMemberId ?? null)
  }

  const handleMemberChange = (memberIdStr: string) => {
    const nextMemberId = memberIdStr ? Number(memberIdStr) : null
    let nextTeamId = ticket.assigned_team_id

    // Selecting member auto-selects their primary team if not assigned
    if (nextMemberId) {
      const memberObj = members.find((m) => m.id === nextMemberId)
      if (memberObj && memberObj.teamIds.length > 0) {
        if (!nextTeamId || !memberObj.teamIds.includes(nextTeamId)) {
          nextTeamId = memberObj.teamIds[0]
        }
      }
    }

    onAssign(ticket.id, nextTeamId ?? null, nextMemberId)
  }

  const handleAddTagFromPool = (tag: TicketTag) => {
    onAddTag(ticket.id, tag)
    setIsTagPopoverOpen(false)
    setNewTagInput('')
  }

  const handleCreateAndAddTag = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!trimmed) return

    const existing = allTags.find((t) => t.slug === trimmed)
    if (existing) {
      handleAddTagFromPool(existing)
      return
    }

    const newTag: TicketTag = {
      id: Date.now(),
      name: trimmed,
      slug: trimmed,
      color: '#64748B',
    }
    onAddTag(ticket.id, newTag)
    setIsTagPopoverOpen(false)
    setNewTagInput('')
  }

  return (
    <div
      data-testid="ticket-metadata-inspector"
      className={`space-y-5 text-text-primary text-xs ${className}`}
    >
      {/* Ticket Attributes Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#282A33]">
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span>Ticket Attributes</span>
        </span>
        <span className="font-mono text-[10px] text-text-muted uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
          {userRole}
        </span>
      </div>

      {/* 1-Click "Claim Ticket" CTA (for Unassigned Tickets) */}
      {isUnassigned && (
        <div className="p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[#F59E0B] font-medium text-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Unassigned Ticket</span>
          </div>
          <p className="text-[11px] text-text-secondary leading-normal">
            Take ownership of this ticket. Claiming will assign it to you and transition status to <span className="font-mono text-emerald-400">open</span>.
          </p>
          <button
            type="button"
            data-testid="claim-ticket-btn"
            onClick={() => onClaimTicket(ticket.id)}
            className="w-full h-8 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1012] font-semibold rounded text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-keylight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Claim Ticket</span>
          </button>
        </div>
      )}

      {/* Section: Status & Priority Mutators */}
      <div className="space-y-3 bg-[#121316] p-3 rounded-lg border border-[#282A33]">
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
              data-testid="inspector-status-select"
              value={ticket.status}
              onChange={(e) => onUpdateStatus(ticket.id, e.target.value as TicketStatus)}
              className="w-full h-8 px-2.5 bg-[#141518] border border-[#282A33] rounded text-xs font-mono text-text-primary focus:outline-none focus:border-[#F59E0B]"
            >
              <option value="new">new (Awaiting triage)</option>
              <option value="open">open (In progress)</option>
              <option value="pending">pending (Waiting on customer)</option>
              <option value="resolved">resolved (Completed)</option>
              <option value="closed">closed (Finalized)</option>
            </select>
          </div>

          <div>
            <label htmlFor="inspector-priority" className="block text-[11px] text-text-secondary mb-1">
              Priority
            </label>
            <select
              id="inspector-priority"
              data-testid="inspector-priority-select"
              value={ticket.priority}
              onChange={(e) => onUpdatePriority(ticket.id, e.target.value as TicketPriority)}
              className="w-full h-8 px-2.5 bg-[#141518] border border-[#282A33] rounded text-xs font-mono text-text-primary focus:outline-none focus:border-[#F59E0B]"
            >
              <option value="urgent">P0 Urgent</option>
              <option value="high">P1 High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section: Cascading Dependent Assignment */}
      <div className="space-y-3 bg-[#121316] p-3 rounded-lg border border-[#282A33]">
        <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Users2 className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span>Routing & Assignment</span>
        </div>

        <div className="space-y-2">
          <div>
            <label htmlFor="inspector-team" className="block text-[11px] text-text-secondary mb-1">
              Assigned Team
            </label>
            <select
              id="inspector-team"
              data-testid="inspector-team-select"
              value={ticket.assigned_team_id ?? ''}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="w-full h-8 px-2.5 bg-[#141518] border border-[#282A33] rounded text-xs font-mono text-text-primary focus:outline-none focus:border-[#F59E0B]"
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
              value={ticket.assigned_member_id ?? ''}
              onChange={(e) => handleMemberChange(e.target.value)}
              className="w-full h-8 px-2.5 bg-[#141518] border border-[#282A33] rounded text-xs font-mono text-text-primary focus:outline-none focus:border-[#F59E0B]"
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
      </div>

      {/* Section: Customer Profile Card */}
      {ticket.customer && (
        <div className="p-3 bg-[#121316] rounded-lg border border-[#282A33] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Customer Profile</span>
            </span>
            {ticket.customer.tier && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-mono uppercase">
                {ticket.customer.tier}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <div className="font-medium text-text-primary text-body-sm">
              {ticket.customer.name}
            </div>
            <div className="text-[11px] text-text-muted font-mono truncate">
              {ticket.customer.email}
            </div>
            {ticket.customer.company && (
              <div className="text-[11px] text-text-secondary">
                {ticket.customer.company}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted font-mono">
            <span>Inquiry History:</span>
            <span className="tabular-nums text-text-primary font-medium">
              {ticket.customer.total_inquiries ?? 1} tickets
            </span>
          </div>
        </div>
      )}

      {/* Section: Inline Tag Manager */}
      <div className="space-y-2 bg-[#121316] p-3 rounded-lg border border-[#282A33] relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Tags ({ticket.tags?.length || 0})</span>
          </span>

          <button
            type="button"
            data-testid="add-tag-trigger"
            onClick={() => setIsTagPopoverOpen((prev) => !prev)}
            className="text-[11px] text-[#F59E0B] hover:text-[#D97706] font-mono flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap gap-1.5">
          {ticket.tags && ticket.tags.length > 0 ? (
            ticket.tags.map((tag) => (
              <span
                key={tag.id}
                data-testid={`tag-chip-${tag.slug}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#16181D] border border-[#282A33] text-text-secondary group"
              >
                <span>{tag.name}</span>
                <button
                  type="button"
                  data-testid={`remove-tag-${tag.slug}`}
                  onClick={() => onRemoveTag(ticket.id, tag.id)}
                  className="hover:text-sentiment-negative text-text-muted transition-colors rounded p-0.5"
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

        {/* Add Tag Popover */}
        {isTagPopoverOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-[#0F1012] border border-[#F59E0B]/30 rounded-lg shadow-2xl space-y-2">
            <form onSubmit={handleCreateAndAddTag} className="flex gap-1.5">
              <input
                type="text"
                autoFocus
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Search or new tag..."
                className="flex-1 h-7 px-2 bg-[#121316] border border-[#282A33] rounded text-[11px] text-text-primary focus:outline-none focus:border-[#F59E0B]"
              />
              <button
                type="submit"
                className="h-7 px-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1012] font-semibold text-[11px] rounded"
              >
                Attach
              </button>
            </form>

            <div className="max-h-32 overflow-y-auto space-y-1">
              {allTags
                .filter((t) => !ticket.tags?.some((existing) => existing.id === t.id))
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleAddTagFromPool(tag)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-[#16181D] text-[11px] font-mono text-text-secondary flex items-center justify-between transition-colors"
                  >
                    <span>{tag.name}</span>
                    <span className="text-[10px] text-text-muted">+ add</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Section: Assignment History Audit Log */}
      {ticket.assignments && ticket.assignments.length > 0 && (
        <div className="space-y-2 bg-[#121316] p-3 rounded-lg border border-[#282A33]">
          <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-text-muted" />
            <span>Assignment History</span>
          </div>

          <div className="space-y-2 max-h-36 overflow-y-auto">
            {ticket.assignments.map((asg) => (
              <div
                key={asg.id}
                className="text-[11px] text-text-secondary font-mono border-l border-white/10 pl-2 space-y-0.5"
              >
                <div className="text-text-primary font-medium">
                  {asg.note || (asg.member_name ? `Assigned to ${asg.member_name}` : 'Unassigned')}
                </div>
                <div className="text-text-muted text-[10px] flex items-center justify-between">
                  <span>By {asg.assigned_by_name}</span>
                  <span className="tabular-nums">
                    {new Date(asg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strict DOM RBAC: Delete Ticket action */}
      {userRole === 'admin' ? (
        <div className="pt-2 border-t border-[#282A33]">
          <button
            type="button"
            data-testid="admin-delete-ticket-btn"
            onClick={() => setIsDeleteModalOpen(true)}
            className="w-full h-8 px-3 rounded border border-sentiment-negative/30 hover:bg-sentiment-negative/10 text-sentiment-negative text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sentiment-negative"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Ticket</span>
          </button>
        </div>
      ) : (
        /* Agent role: Delete button is STRICTLY OMITTED from the DOM */
        null
      )}

      {/* Delete Confirmation Modal (Admin only) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#141518] border border-sentiment-negative/40 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-modal">
            <div className="flex items-center gap-2 text-sentiment-negative font-semibold text-body-default">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Confirm Ticket Deletion</span>
            </div>
            <p className="text-xs text-text-secondary leading-normal">
              Are you sure you want to soft-delete Ticket <span className="font-mono text-white">#{ticket.ticket_number}</span>? This action can be reversed by an administrator, but the ticket will be removed from all active triage queues.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="h-8 px-3 text-xs bg-[#16181D] hover:bg-[#282A33] text-text-secondary rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-btn"
                onClick={() => {
                  onDeleteTicket(ticket.id)
                  setIsDeleteModalOpen(false)
                }}
                className="h-8 px-3 text-xs bg-sentiment-negative hover:bg-rose-700 text-white font-semibold rounded transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
