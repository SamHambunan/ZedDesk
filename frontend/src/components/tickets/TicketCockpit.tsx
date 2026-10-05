import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Search,
  ArrowLeft,
  Share2,
} from 'lucide-react'
import type {
  TicketItem,
  PresetFilter,
  TicketStatus,
  TicketPriority,
  OrgTeamOption,
  OrgMemberOption,
  TicketTag,
} from './types'
import {
  TicketCockpitContext,
  useTicketCockpit,
  type TicketCockpitContextValue,
  type TicketCockpitState,
  type TicketCockpitActions,
  type TicketCockpitMeta,
} from './TicketCockpitContext'
import {
  PRESET_DEFINITIONS,
  getPriorityBadge,
  getStatusBadge,
} from './constants'
import { TicketTimeline } from './TicketTimeline'
import { TicketComposer, type ComposerSubmitPayload } from './TicketComposer'
import { TicketMetadataInspector } from './TicketMetadataInspector'

export interface TicketCockpitProviderProps {
  readonly children: React.ReactNode
  readonly value?: TicketCockpitContextValue
  readonly tickets?: readonly TicketItem[]
  readonly selectedTicketId?: string | null
  readonly onSelectTicket?: (ticketId: string) => void
  readonly teams?: readonly OrgTeamOption[]
  readonly members?: readonly OrgMemberOption[]
  readonly allTags?: readonly TicketTag[]
  readonly currentUserId?: number
  readonly userRole?: 'admin' | 'agent'
  readonly onClaimTicket?: (ticketId: string) => void
  readonly onUpdateStatus?: (ticketId: string, status: TicketStatus) => void
  readonly onUpdatePriority?: (ticketId: string, priority: TicketPriority) => void
  readonly onAssign?: (ticketId: string, teamId: number | null, memberId: number | null) => void
  readonly onAddTag?: (ticketId: string, tag: TicketTag) => void
  readonly onRemoveTag?: (ticketId: string, tagId: number) => void
  readonly onDeleteTicket?: (ticketId: string) => void
  readonly onComposerSubmit?: (ticketId: string, payload: ComposerSubmitPayload) => void
}

export const TicketCockpitProvider: React.FC<TicketCockpitProviderProps> = ({
  children,
  value,
  tickets = [],
  selectedTicketId: controlledSelectedTicketId,
  onSelectTicket,
  teams = [],
  members = [],
  allTags = [],
  currentUserId = 2,
  userRole = 'agent',
  onClaimTicket,
  onUpdateStatus,
  onUpdatePriority,
  onAssign,
  onAddTag,
  onRemoveTag,
  onDeleteTicket,
  onComposerSubmit,
}) => {
  // If a generic context value is directly provided (dependency injection), use it
  if (value) {
    return <TicketCockpitContext value={value}>{children}</TicketCockpitContext>
  }

  return (
    <TicketCockpitInternalProvider
      tickets={tickets}
      selectedTicketId={controlledSelectedTicketId}
      onSelectTicket={onSelectTicket}
      teams={teams}
      members={members}
      allTags={allTags}
      currentUserId={currentUserId}
      userRole={userRole}
      onClaimTicket={onClaimTicket}
      onUpdateStatus={onUpdateStatus}
      onUpdatePriority={onUpdatePriority}
      onAssign={onAssign}
      onAddTag={onAddTag}
      onRemoveTag={onRemoveTag}
      onDeleteTicket={onDeleteTicket}
      onComposerSubmit={onComposerSubmit}
    >
      {children}
    </TicketCockpitInternalProvider>
  )
}

function TicketCockpitInternalProvider({
  children,
  tickets,
  selectedTicketId: controlledSelectedTicketId,
  onSelectTicket,
  teams,
  members,
  allTags,
  currentUserId,
  userRole,
  onClaimTicket,
  onUpdateStatus,
  onUpdatePriority,
  onAssign,
  onAddTag,
  onRemoveTag,
  onDeleteTicket,
  onComposerSubmit,
}: Omit<TicketCockpitProviderProps, 'value'> & {
  tickets: readonly TicketItem[]
  teams: readonly OrgTeamOption[]
  members: readonly OrgMemberOption[]
  allTags: readonly TicketTag[]
  currentUserId: number
  userRole: 'admin' | 'agent'
}) {
  const [internalSelectedTicketId, setInternalSelectedTicketId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  )
  const [activePreset, setActivePreset] = useState<PresetFilter>('all_open')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobilePane, setMobilePane] = useState<'queue' | 'detail'>('queue')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const selectedTicketId = controlledSelectedTicketId !== undefined
    ? controlledSelectedTicketId
    : internalSelectedTicketId

  // Calculate counts for each preset
  const presetCounts = useMemo(() => {
    return {
      all_open: tickets.filter((t) => ['new', 'open', 'pending'].includes(t.status)).length,
      my_tickets: tickets.filter((t) => t.assigned_member_id === currentUserId).length,
      unassigned: tickets.filter((t) => !t.assigned_member_id).length,
      team_queue: tickets.filter((t) => Boolean(t.assigned_team_id)).length,
      resolved_closed: tickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length,
    }
  }, [tickets, currentUserId])

  // Filter tickets by preset and search
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      // Preset filtering
      if (activePreset === 'all_open' && !['new', 'open', 'pending'].includes(ticket.status)) {
        return false
      }
      if (activePreset === 'my_tickets' && ticket.assigned_member_id !== currentUserId) {
        return false
      }
      if (activePreset === 'unassigned' && ticket.assigned_member_id) {
        return false
      }
      if (activePreset === 'team_queue' && !ticket.assigned_team_id) {
        return false
      }
      if (activePreset === 'resolved_closed' && !['resolved', 'closed'].includes(ticket.status)) {
        return false
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchNumber = ticket.ticket_number.toString().includes(query)
        const matchSubject = ticket.subject.toLowerCase().includes(query)
        const matchCustomer =
          ticket.customer?.name.toLowerCase().includes(query) ||
          ticket.customer?.email.toLowerCase().includes(query)
        const matchTag = ticket.tags?.some((t) => t.name.toLowerCase().includes(query))
        if (!matchNumber && !matchSubject && !matchCustomer && !matchTag) return false
      }

      return true
    })
  }, [tickets, activePreset, currentUserId, searchQuery])

  // Active Ticket
  const activeTicket = useMemo(() => {
    if (selectedTicketId) {
      const found = tickets.find((t) => t.id === selectedTicketId)
      if (found) return found
    }
    return filteredTickets[0] ?? tickets[0] ?? null
  }, [tickets, selectedTicketId, filteredTickets])

  const selectTicket = (ticketId: string) => {
    if (controlledSelectedTicketId === undefined) {
      setInternalSelectedTicketId(ticketId)
    }
    onSelectTicket?.(ticketId)
    setMobilePane('detail')
  }

  const state: TicketCockpitState = {
    tickets,
    filteredTickets,
    selectedTicketId,
    activeTicket,
    activePreset,
    searchQuery,
    presetCounts,
    mobilePane,
    teams,
    members,
    allTags,
    currentUserId,
    userRole,
  }

  const actions: TicketCockpitActions = {
    selectTicket,
    setActivePreset,
    setSearchQuery,
    setMobilePane,
    claimTicket: (ticketId: string) => onClaimTicket?.(ticketId),
    updateStatus: (ticketId: string, status: TicketStatus) => onUpdateStatus?.(ticketId, status),
    updatePriority: (ticketId: string, priority: TicketPriority) => onUpdatePriority?.(ticketId, priority),
    assign: (ticketId: string, teamId: number | null, memberId: number | null) =>
      onAssign?.(ticketId, teamId, memberId),
    addTag: (ticketId: string, tag: TicketTag) => onAddTag?.(ticketId, tag),
    removeTag: (ticketId: string, tagId: number) => onRemoveTag?.(ticketId, tagId),
    deleteTicket: (ticketId: string) => onDeleteTicket?.(ticketId),
    submitComposer: (ticketId: string, payload: ComposerSubmitPayload) =>
      onComposerSubmit?.(ticketId, payload),
  }

  const meta: TicketCockpitMeta = {
    searchInputRef,
  }

  const contextValue: TicketCockpitContextValue = {
    state,
    actions,
    meta,
  }

  return (
    <TicketCockpitContext value={contextValue}>
      {children}
    </TicketCockpitContext>
  )
}

export interface TicketCockpitFrameProps {
  readonly children: React.ReactNode
  readonly className?: string
}

export const TicketCockpitFrame: React.FC<TicketCockpitFrameProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      data-testid="ticket-cockpit-frame"
      className={`flex-1 flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-[#0F1012] text-text-primary -m-4 md:-m-8 border-t border-[#282A33] ${className}`}
    >
      {children}
    </div>
  )
}

export interface TicketCockpitSubRailProps {
  readonly className?: string
}

export const TicketCockpitSubRail: React.FC<TicketCockpitSubRailProps> = ({
  className = '',
}) => {
  const { state, actions } = useTicketCockpit()

  return (
    <nav
      aria-label="Ticket Queue Presets"
      data-testid="ticket-cockpit-subrail"
      className={`w-full lg:w-[200px] shrink-0 bg-[#141518] border-r border-[#282A33] flex flex-col p-3 z-10 ${
        state.mobilePane === 'detail' ? 'hidden lg:flex' : 'flex'
      } ${className}`}
    >
      <div className="px-2 py-1.5 mb-2 text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center justify-between">
        <span>Views</span>
        <span className="font-mono tabular-nums text-[10px] text-text-muted/60">
          {state.tickets.length} total
        </span>
      </div>

      <ul className="space-y-1">
        {PRESET_DEFINITIONS.map((def) => {
          const Icon = def.icon
          const isActive = state.activePreset === def.id
          const count = state.presetCounts[def.id]

          return (
            <li key={def.id}>
              <button
                type="button"
                data-testid={`preset-btn-${def.id}`}
                onClick={() => actions.setActivePreset(def.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#16181D] text-white shadow-keylight border-l-2 border-[#F59E0B]'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F59E0B]' : 'text-text-muted'}`} />
                  <span className="truncate">{def.label}</span>
                </div>
                <span
                  className={`font-mono tabular-nums text-[11px] px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'text-text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Active Preset Summary */}
      <div className="mt-auto pt-3 border-t border-[#282A33] px-2 text-[11px] font-mono text-text-muted">
        <div className="text-white/80 font-medium">Split-Cockpit</div>
        <div className="text-[10px] text-text-muted">Linear & Zendesk layout</div>
      </div>
    </nav>
  )
}

export interface TicketCockpitQueueProps {
  readonly children?: React.ReactNode
  readonly className?: string
}

export const TicketCockpitQueue: React.FC<TicketCockpitQueueProps> = ({
  children,
  className = '',
}) => {
  const { state, actions, meta } = useTicketCockpit()
  const { searchInputRef } = meta

  // Register '/' keyboard shortcut to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchInputRef])

  return (
    <section
      aria-label="Ticket Queue List"
      data-testid="ticket-cockpit-queue"
      className={`w-full lg:w-[380px] shrink-0 bg-[#0F1012] border-r border-[#282A33] flex flex-col ${
        state.mobilePane === 'detail' ? 'hidden lg:flex' : 'flex'
      } ${className}`}
    >
      {/* Search Header */}
      <div className="p-3 border-b border-[#282A33] bg-[#141518]/80 backdrop-blur-sm">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            data-testid="queue-search-input"
            value={state.searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            placeholder="Search queue... (/)"
            className="w-full h-8 pl-8 pr-3 bg-[#121316] border border-[#282A33] rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
          />
        </div>
      </div>

      {/* Tickets List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#282A33]">
        {children ?? (
          state.filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs">
              No tickets found matching this filter.
            </div>
          ) : (
            state.filteredTickets.map((ticket) => (
              <TicketCockpitQueueCard key={ticket.id} ticket={ticket} />
            ))
          )
        )}
      </div>
    </section>
  )
}

export interface TicketCockpitQueueCardProps {
  readonly ticket: TicketItem
  readonly className?: string
}

export const TicketCockpitQueueCard: React.FC<TicketCockpitQueueCardProps> = ({
  ticket,
  className = '',
}) => {
  const { state, actions } = useTicketCockpit()
  const isSelected = state.activeTicket?.id === ticket.id
  const priorityInfo = getPriorityBadge(ticket.priority)
  const statusInfo = getStatusBadge(ticket.status)

  return (
    <div
      data-testid={`ticket-row-${ticket.id}`}
      onClick={() => actions.selectTicket(ticket.id)}
      className={`p-3 cursor-pointer transition-all border-l-2 select-none ${
        isSelected
          ? 'bg-[#1E2026] border-[#F59E0B] shadow-keylight'
          : 'border-transparent hover:bg-white/[0.03]'
      } ${className}`}
    >
      {/* Line 1: Ticket Number, Priority, Subject, Timestamp */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 truncate">
          <span
            data-testid={`ticket-number-${ticket.id}`}
            className="font-mono tabular-nums text-xs font-semibold text-text-primary"
          >
            #{ticket.ticket_number}
          </span>
          <span
            data-testid={`ticket-priority-${ticket.id}`}
            className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border ${priorityInfo.class}`}
          >
            <span className="sr-only">{ticket.priority}</span>
            <span>{priorityInfo.label}</span>
          </span>
          <span
            data-testid={`ticket-subject-${ticket.id}`}
            className="text-xs font-medium text-text-primary truncate"
            title={ticket.subject}
          >
            {ticket.subject}
          </span>
        </div>

        <time className="text-[10px] font-mono tabular-nums text-text-muted shrink-0">
          14m ago
        </time>
      </div>

      {/* Line 2: Customer, Tag Chips, Status, Assignee */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 truncate text-text-secondary">
          <span
            data-testid={`ticket-customer-${ticket.id}`}
            className="truncate text-text-secondary"
          >
            {ticket.customer?.name || 'Unknown'}
          </span>

          {ticket.tags && ticket.tags.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {ticket.tags.slice(0, 2).map((t) => (
                <span
                  key={t.id}
                  className="px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-text-muted"
                >
                  {t.name}
                </span>
              ))}
              {ticket.tags.length > 2 && (
                <span className="text-[10px] font-mono text-text-muted">
                  +{ticket.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            data-testid={`ticket-status-${ticket.id}`}
            className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border ${statusInfo.class}`}
          >
            {statusInfo.label}
          </span>
          <span className="w-5 h-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-mono text-text-secondary">
            {ticket.assigned_member_name
              ? ticket.assigned_member_name.slice(0, 2).toUpperCase()
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

export interface TicketCockpitDetailProps {
  readonly children?: React.ReactNode
  readonly className?: string
}

export const TicketCockpitDetail: React.FC<TicketCockpitDetailProps> = ({
  children,
  className = '',
}) => {
  const { state, actions } = useTicketCockpit()
  const { activeTicket } = state

  return (
    <section
      aria-label="Ticket Detail and Conversation"
      data-testid="ticket-cockpit-detail"
      className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-[#0F1012] border-r border-[#282A33] ${
        state.mobilePane === 'queue' ? 'hidden lg:flex' : 'flex'
      } ${className}`}
    >
      {activeTicket ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-[#282A33] bg-[#141518] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Responsive Mobile Back Breadcrumb (< 1024px) */}
              <button
                type="button"
                data-testid="detail-back-breadcrumb"
                onClick={() => actions.setMobilePane('queue')}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1 rounded bg-[#16181D] border border-[#282A33] hover:border-[#3B3F4D] text-[#F59E0B] text-xs font-mono transition-colors"
                title="Back to queue"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Queue</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#F59E0B]">
                    #{activeTicket.ticket_number}
                  </span>
                  <h2
                    data-testid="detail-subject"
                    className="text-body-default font-semibold text-text-primary truncate"
                  >
                    {activeTicket.subject}
                  </h2>
                </div>
                <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5">
                  <span>
                    Requester:{' '}
                    <strong className="text-text-secondary">{activeTicket.customer?.name}</strong>
                  </span>
                  <span>•</span>
                  <span className="font-mono">{activeTicket.customer?.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                title="Deep link ticket"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard?.writeText(window.location.href)
                  }
                }}
                className="p-1.5 rounded bg-[#121316] border border-[#282A33] hover:border-[#3B3F4D] text-text-muted hover:text-white transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {children ?? (
            <>
              {/* Scrollable Conversation Timeline */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                <TicketTimeline
                  messages={activeTicket.messages || []}
                  customerName={activeTicket.customer?.name}
                />
              </div>

              {/* Docked Segmented Composer at bottom */}
              <div className="p-4 border-t border-[#282A33] bg-[#141518]/90 backdrop-blur-sm">
                <TicketComposer
                  currentStatus={activeTicket.status}
                  onSubmit={(payload) => actions.submitComposer(activeTicket.id, payload)}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-text-muted text-xs">
          Select a ticket from the queue column to view details.
        </div>
      )}
    </section>
  )
}

export interface TicketCockpitInspectorProps {
  readonly className?: string
}

export const TicketCockpitInspector: React.FC<TicketCockpitInspectorProps> = ({
  className = '',
}) => {
  const { state, actions } = useTicketCockpit()
  const { activeTicket } = state

  return (
    <aside
      aria-label="Ticket Metadata Inspector"
      data-testid="ticket-cockpit-inspector"
      className={`w-full lg:w-[300px] shrink-0 bg-[#0F1012] p-4 overflow-y-auto space-y-5 border-l border-[#282A33] ${
        state.mobilePane === 'queue' ? 'hidden lg:block' : 'block'
      } ${className}`}
    >
      {activeTicket ? (
        <TicketMetadataInspector
          ticket={activeTicket}
          teams={state.teams}
          members={state.members}
          allTags={state.allTags}
          userRole={state.userRole}
          onClaimTicket={actions.claimTicket}
          onUpdateStatus={actions.updateStatus}
          onUpdatePriority={actions.updatePriority}
          onAssign={actions.assign}
          onAddTag={actions.addTag}
          onRemoveTag={actions.removeTag}
          onDeleteTicket={actions.deleteTicket}
        />
      ) : (
        <div className="text-text-muted text-xs text-center py-8">
          No ticket selected.
        </div>
      )}
    </aside>
  )
}

// Export Compound Component
export const TicketCockpit = {
  Provider: TicketCockpitProvider,
  Frame: TicketCockpitFrame,
  SubRail: TicketCockpitSubRail,
  Queue: TicketCockpitQueue,
  QueueCard: TicketCockpitQueueCard,
  Detail: TicketCockpitDetail,
  Inspector: TicketCockpitInspector,
}
