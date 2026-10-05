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
  readonly assign: (ticketId: string, teamId: number | null, memberId: number | null) => Promise<void> | void
  readonly addTag: (ticketId: string, tag: TicketTag) => Promise<void> | void
  readonly removeTag: (ticketId: string, tagId: number | string) => Promise<void> | void
  readonly deleteTicket: (ticketId: string) => Promise<void> | void
  readonly restoreTicket?: (ticketId: string) => Promise<void> | void
  readonly submitComposer: (ticketId: string, payload: ComposerSubmitPayload) => void
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
