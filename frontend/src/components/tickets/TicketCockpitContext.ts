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

export interface TicketCockpitState {
  readonly tickets: readonly TicketItem[]
  readonly filteredTickets: readonly TicketItem[]
  readonly selectedTicketId: string | null
  readonly activeTicket: TicketItem | null
  readonly activePreset: PresetFilter
  readonly searchQuery: string
  readonly presetCounts: Record<PresetFilter, number>
  readonly mobilePane: 'queue' | 'detail'
  readonly teams: readonly OrgTeamOption[]
  readonly members: readonly OrgMemberOption[]
  readonly allTags: readonly TicketTag[]
  readonly currentUserId?: number
  readonly userRole?: 'admin' | 'agent'
}

export interface TicketCockpitActions {
  readonly selectTicket: (ticketId: string) => void
  readonly setActivePreset: (preset: PresetFilter) => void
  readonly setSearchQuery: (query: string) => void
  readonly setMobilePane: (pane: 'queue' | 'detail') => void
  readonly claimTicket: (ticketId: string) => void
  readonly updateStatus: (ticketId: string, status: TicketStatus) => void
  readonly updatePriority: (ticketId: string, priority: TicketPriority) => void
  readonly assign: (ticketId: string, teamId: number | null, memberId: number | null) => void
  readonly addTag: (ticketId: string, tag: TicketTag) => void
  readonly removeTag: (ticketId: string, tagId: number) => void
  readonly deleteTicket: (ticketId: string) => void
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
