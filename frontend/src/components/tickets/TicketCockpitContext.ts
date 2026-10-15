import { createContext, use } from 'react'
import type {
  TicketItem,
  PresetFilter,
  TicketStatus,
  TicketPriority,
  OrgTeamOption,
  OrgMemberOption,
  TicketTag,
} from './types'
import type { ComposerSubmitPayload } from './TicketComposer'
import type { PresenceMember } from '../../lib/live-client'

export interface CompoundFilters {
  readonly status: TicketStatus | 'all'
  readonly priority: TicketPriority | 'all'
  readonly teamId: number | 'all'
  readonly tagId: number | string | 'all'
}

export const DEFAULT_COMPOUND_FILTERS: CompoundFilters = {
  status: 'all',
  priority: 'all',
  teamId: 'all',
  tagId: 'all',
}

export type ConflictedTicketField = 'status' | 'priority'

export interface TicketFieldConflict {
  readonly ticketId: string
  readonly currentValue: TicketStatus | TicketPriority
  readonly intendedValue: TicketStatus | TicketPriority
}

export interface AssignmentPair {
  readonly teamId: number | null
  readonly memberId: number | null
}

export interface AssignmentConflict {
  readonly ticketId: string
  readonly action: 'assign' | 'claim'
  readonly current: AssignmentPair
  readonly intended: AssignmentPair
}

export interface TicketCockpitState {
  readonly tickets: readonly TicketItem[]
  readonly filteredTickets: readonly TicketItem[]
  readonly selectedTicketId: string | null
  readonly activeTicket: TicketItem | null
  readonly activePreset: PresetFilter
  readonly searchQuery: string
  readonly filters: CompoundFilters
  readonly presetCounts: Record<PresetFilter, number>
  readonly mobilePane: 'queue' | 'detail'
  readonly teams: readonly OrgTeamOption[]
  readonly members: readonly OrgMemberOption[]
  readonly allTags: readonly TicketTag[]
  readonly currentUserId?: number
  readonly userRole?: 'admin' | 'agent'
  readonly isLoading?: boolean
  readonly isError?: boolean
  readonly isFetching?: boolean
  readonly liveStatus?: 'connecting' | 'connected' | 'disconnected'
  readonly hasPendingQueueReorder?: boolean
  readonly isOutsidePreset?: boolean
  readonly isUnavailable?: boolean
  readonly ticketViewers?: readonly PresenceMember[]
  readonly ticketTypingMembers?: readonly PresenceMember[]
  readonly fieldConflicts?: Record<string, Partial<Record<ConflictedTicketField, TicketFieldConflict>>>
  readonly assignmentConflicts?: Record<string, AssignmentConflict | undefined>
}

export interface TicketCockpitActions {
  readonly selectTicket: (ticketId: string) => void
  readonly setActivePreset: (preset: PresetFilter) => void
  readonly setSearchQuery: (query: string) => void
  readonly setFilters: (filters: Partial<CompoundFilters>) => void
  readonly resetFilters: () => void
  readonly setMobilePane: (pane: 'queue' | 'detail') => void
  readonly claimTicket: (ticketId: string) => Promise<void> | void
  readonly updateStatus: (ticketId: string, status: TicketStatus) => Promise<void> | void
  readonly updatePriority: (ticketId: string, priority: TicketPriority) => Promise<void> | void
  readonly setConflictedFieldIntent?: (ticketId: string, field: ConflictedTicketField, value: TicketStatus | TicketPriority) => void
  readonly useCurrentFieldValue?: (ticketId: string, field: ConflictedTicketField) => Promise<void>
  readonly retryFieldChange?: (ticketId: string, field: ConflictedTicketField) => Promise<void>
  readonly setConflictedAssignmentIntent?: (ticketId: string, teamId: number | null, memberId: number | null) => void
  readonly useCurrentAssignment?: (ticketId: string) => Promise<void>
  readonly retryAssignment?: (ticketId: string) => Promise<void>
  readonly assign: (ticketId: string, teamId: number | null, memberId: number | null) => Promise<void> | void
  readonly addTag: (ticketId: string, tag: TicketTag) => Promise<void> | void
  readonly removeTag: (ticketId: string, tagId: number | string) => Promise<void> | void
  readonly deleteTicket: (ticketId: string) => Promise<void> | void
  readonly restoreTicket?: (ticketId: string) => Promise<void> | void
  readonly submitComposer: (ticketId: string, payload: ComposerSubmitPayload) => void
  readonly applyPendingQueueOrder?: () => void
  readonly sendTyping?: (ticketId: string, isTyping: boolean) => void
}

export interface TicketCockpitMeta {
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>
}

export interface TicketCockpitContextValue {
  readonly state: TicketCockpitState
  readonly actions: TicketCockpitActions
  readonly meta: TicketCockpitMeta
}

export const TicketCockpitContext = createContext<TicketCockpitContextValue | null>(null)

export function useTicketCockpit(): TicketCockpitContextValue {
  const context = use(TicketCockpitContext)
  if (!context) {
    throw new Error('useTicketCockpit must be used within a TicketCockpit.Provider')
  }
  return context
}
