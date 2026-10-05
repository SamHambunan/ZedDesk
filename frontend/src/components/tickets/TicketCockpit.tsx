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
  const [internalTickets, setInternalTickets] = useState<readonly TicketItem[]>(() => tickets)
  const [internalTags, setInternalTags] = useState<readonly TicketTag[]>(() => allTags)
  const [internalSelectedTicketId, setInternalSelectedTicketId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  )
  const [activePreset, setActivePreset] = useState<PresetFilter>('all_open')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobilePane, setMobilePane] = useState<'queue' | 'detail'>('queue')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Adjust internal state during render when external data props change
  const [prevTickets, setPrevTickets] = useState(tickets)
  if (tickets !== prevTickets) {
    setPrevTickets(tickets)
    setInternalTickets(tickets)
  }

  const [prevTags, setPrevTags] = useState(allTags)
  if (allTags !== prevTags) {
    setPrevTags(allTags)
    setInternalTags(allTags)
  }

  const effectiveTickets = internalTickets
  const effectiveTags = internalTags

  const selectedTicketId = controlledSelectedTicketId !== undefined
    ? controlledSelectedTicketId
    : internalSelectedTicketId

  // Calculate counts for each preset
  const presetCounts = useMemo(() => {
    return {
      all_open: effectiveTickets.filter((t) => ['new', 'open', 'pending'].includes(t.status)).length,
      my_tickets: effectiveTickets.filter((t) => t.assigned_member_id === currentUserId).length,
      unassigned: effectiveTickets.filter((t) => !t.assigned_member_id).length,
      team_queue: effectiveTickets.filter((t) => Boolean(t.assigned_team_id)).length,
      resolved_closed: effectiveTickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length,
    }
  }, [effectiveTickets, currentUserId])

  // Filter tickets by preset and search
  const filteredTickets = useMemo(() => {
    return effectiveTickets.filter((ticket) => {
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
  }, [effectiveTickets, activePreset, currentUserId, searchQuery])

  // Active Ticket
  const activeTicket = useMemo(() => {
    if (selectedTicketId) {
      const found = effectiveTickets.find((t) => t.id === selectedTicketId)
      if (found) return found
    }
    return filteredTickets[0] ?? effectiveTickets[0] ?? null
  }, [effectiveTickets, selectedTicketId, filteredTickets])

  // Stable Actions with functional state updates
  const actions: TicketCockpitActions = useMemo(() => {
    return {
      selectTicket: (ticketId: string) => {
        if (controlledSelectedTicketId === undefined) {
          setInternalSelectedTicketId(ticketId)
        }
        onSelectTicket?.(ticketId)
        setMobilePane('detail')
      },
      setActivePreset: (preset: PresetFilter) => {
        setActivePreset(preset)
      },
      setSearchQuery: (query: string) => {
        setSearchQuery(query)
      },
      setMobilePane: (pane: 'queue' | 'detail') => {
        setMobilePane(pane)
      },
      claimTicket: (ticketId: string) => {
        onClaimTicket?.(ticketId)
        const currentMember = members.find((m) => m.id === currentUserId)
        const memberName = currentMember ? currentMember.name : 'Current Agent'
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            return {
              ...t,
              assigned_member_id: currentUserId,
              assigned_member_name: memberName,
              status: t.status === 'new' ? 'open' : t.status,
              assignments: [
                ...(t.assignments || []),
                {
                  id: `assign-${Date.now()}`,
                  ticket_id: t.id,
                  team_id: t.assigned_team_id ?? null,
                  team_name: t.assigned_team_name ?? null,
                  member_id: currentUserId,
                  member_name: memberName,
                  assigned_by_name: memberName,
                  created_at: 'Just now',
                  note: 'Claimed ticket from queue',
                },
              ],
            }
          })
        )
      },
      updateStatus: (ticketId: string, status: TicketStatus) => {
        onUpdateStatus?.(ticketId, status)
        setInternalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
        )
      },
      updatePriority: (ticketId: string, priority: TicketPriority) => {
        onUpdatePriority?.(ticketId, priority)
        setInternalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, priority } : t))
        )
      },
      assign: (ticketId: string, teamId: number | null, memberId: number | null) => {
        onAssign?.(ticketId, teamId, memberId)
        const team = teams.find((tm) => tm.id === teamId)
        const member = members.find((m) => m.id === memberId)
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            return {
              ...t,
              assigned_team_id: teamId,
              assigned_team_name: team ? team.name : null,
              assigned_member_id: memberId,
              assigned_member_name: member ? member.name : null,
              assignments: [
                ...(t.assignments || []),
                {
                  id: `assign-${Date.now()}`,
                  ticket_id: t.id,
                  team_id: teamId,
                  team_name: team ? team.name : null,
                  member_id: memberId,
                  member_name: member ? member.name : null,
                  assigned_by_name: userRole === 'admin' ? 'Super Admin' : 'Agent Support',
                  created_at: 'Just now',
                },
              ],
            }
          })
        )
      },
      addTag: (ticketId: string, tag: TicketTag) => {
        onAddTag?.(ticketId, tag)
        setInternalTags((prev) =>
          prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]
        )
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            const existingTags = t.tags || []
            if (existingTags.some((eg) => eg.id === tag.id)) return t
            return {
              ...t,
              tags: [...existingTags, tag],
            }
          })
        )
      },
      removeTag: (ticketId: string, tagId: number) => {
        onRemoveTag?.(ticketId, tagId)
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            return {
              ...t,
              tags: (t.tags || []).filter((tag) => tag.id !== tagId),
            }
          })
        )
      },
      deleteTicket: (ticketId: string) => {
        onDeleteTicket?.(ticketId)
        setInternalTickets((prev) => prev.filter((t) => t.id !== ticketId))
        setInternalSelectedTicketId((curr) => {
          if (curr === ticketId) {
            const next = effectiveTickets.filter((t) => t.id !== ticketId)
            return next[0]?.id ?? null
          }
          return curr
        })
      },
      submitComposer: (ticketId: string, payload: ComposerSubmitPayload) => {
        onComposerSubmit?.(ticketId, payload)
        const isInternal = payload.messageType === 'internal_note'
        const newMsg = {
          id: `msg-${Date.now()}`,
          ticket_id: ticketId,
          message_type: payload.messageType,
          author_type: 'OrganizationMember' as const,
          author_name: userRole === 'admin' ? 'Super Admin' : 'Agent Support',
          author_role: userRole === 'admin' ? 'Lead Administrator' : 'Support Specialist',
          body: payload.body,
          attachments: payload.attachments,
          created_at: 'Just now',
        }
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            const updatedStatus =
              !isInternal && payload.nextStatus ? payload.nextStatus : t.status
            return {
              ...t,
              status: updatedStatus,
              messages: [...(t.messages || []), newMsg],
            }
          })
        )
      },
    }
  }, [
    controlledSelectedTicketId,
    currentUserId,
    effectiveTickets,
    members,
    onAddTag,
    onAssign,
    onClaimTicket,
    onComposerSubmit,
    onDeleteTicket,
    onRemoveTag,
    onSelectTicket,
    onUpdatePriority,
    onUpdateStatus,
    teams,
    userRole,
  ])

  const state: TicketCockpitState = useMemo(() => ({
    tickets: effectiveTickets,
    filteredTickets,
    selectedTicketId,
    activeTicket,
    activePreset,
    searchQuery,
    presetCounts,
    mobilePane,
    teams,
    members,
    allTags: effectiveTags,
    currentUserId,
    userRole,
  }), [
    effectiveTickets,
    filteredTickets,
    selectedTicketId,
    activeTicket,
    activePreset,
    searchQuery,
    presetCounts,
    mobilePane,
    teams,
    members,
    effectiveTags,
    currentUserId,
    userRole,
  ])

  const meta: TicketCockpitMeta = useMemo(() => ({
    searchInputRef,
  }), [])

  const contextValue: TicketCockpitContextValue = useMemo(() => ({
    state,
    actions,
    meta,
  }), [state, actions, meta])

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
        <div className="text-[10px] text-text-muted">Active queue: {state.presetCounts[state.activePreset]}</div>
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
  const { state } = useTicketCockpit()
  const { activeTicket } = state

  return (
    <aside
      aria-label="Ticket Metadata Inspector"
      data-testid="ticket-cockpit-inspector"
      className={`w-full lg:w-[300px] shrink-0 bg-[#0F1012] p-4 overflow-y-auto space-y-5 border-l border-[#282A33] hidden lg:block ${className}`}
    >
      {activeTicket ? (
        <TicketMetadataInspector />
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
