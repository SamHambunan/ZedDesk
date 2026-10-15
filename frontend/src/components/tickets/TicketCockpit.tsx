import React, { useState, useMemo, useRef, useEffect, useCallback, use } from 'react'
import { useQuery, useQueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import {
  createLiveClient,
  type ILiveClient,
  type LiveSignalPayload,
  type LiveStatus,
  type PresenceMember,
} from '../../lib/live-client'
import {
  Search,
  ArrowLeft,
  Share2,
  Eye,
} from 'lucide-react'
import { getInitials } from '../../lib/utils'
import type {
  TicketItem,
  TicketMessage,
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
  DEFAULT_COMPOUND_FILTERS,
  type CompoundFilters,
  type TicketCockpitContextValue,
  type TicketCockpitState,
  type TicketCockpitActions,
  type TicketCockpitMeta,
  type ConflictedTicketField,
  type TicketFieldConflict,
  type AssignmentConflict,
  type AssignmentPair,
} from './TicketCockpitContext'
import {
  PRESET_DEFINITIONS,
  getPriorityBadge,
  getStatusBadge,
  getPresetQueryParams,
  parseTicketNumberFromPath,
  matchesPreset,
  normalizeTicketMessage,
  normalizeTicketAssignments,
  normalizeTicketItem,
} from './constants'
import { INITIAL_MOCK_TICKETS } from './mockData'
import { TicketTimeline } from './TicketTimeline'
import { TicketComposer, type ComposerSubmitPayload } from './TicketComposer'
import {
  TicketMetadataInspector,
  InspectorCustomerCard,
  InspectorClaimCta,
  InspectorLifecycle,
  InspectorAssignment,
  InspectorRouting,
  InspectorTags,
  InspectorAuditLog,
  InspectorDestructive,
} from './TicketMetadataInspector'

export function resolveApiEndpoint(baseUrl: string, endpoint: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanEndpoint = endpoint.replace(/^\/+/, '')
  const hasApi = cleanBase.endsWith('/api') || cleanEndpoint.startsWith('api/')
  if (hasApi) {
    if (cleanBase.endsWith('/api') && cleanEndpoint.startsWith('api/')) {
      return `${cleanBase}/${cleanEndpoint.slice(4)}`
    }
    return `${cleanBase}/${cleanEndpoint}`
  }
  return `${cleanBase}/api/${cleanEndpoint}`
}

class ApiMutationError extends Error {
  readonly status: number
  readonly current?: Record<string, unknown>

  constructor(message: string, status: number, current?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.current = current
  }
}

function assignmentRevisionForMutation(ticket: TicketItem | null | undefined, apiUrl?: string): number | undefined {
  const revision = ticket?.assignment_revision
  if (apiUrl && typeof revision !== 'number') {
    throw new Error('Assignment revision unavailable. Refresh the Ticket and try again.')
  }
  return revision
}

export function SafeQueryProvider({ children }: { readonly children: React.ReactNode }) {
  const client = use(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

export interface TicketCockpitProviderProps {
  readonly children: React.ReactNode
  readonly value?: TicketCockpitContextValue
  readonly apiUrl?: string
  readonly token?: string | null
  readonly liveClient?: ILiveClient
  readonly tickets?: readonly TicketItem[]
  readonly selectedTicketId?: string | null
  readonly onSelectTicket?: (ticketId: string) => void
  readonly teams?: readonly OrgTeamOption[]
  readonly members?: readonly OrgMemberOption[]
  readonly allTags?: readonly TicketTag[]
  readonly currentUserId?: number
  readonly userRole?: 'admin' | 'agent'
  readonly initialTicketNumber?: number | string
  readonly initialPreset?: PresetFilter
  readonly onClaimTicket?: (ticketId: string) => Promise<void> | void
  readonly onUpdateStatus?: (ticketId: string, status: TicketStatus) => Promise<void> | void
  readonly onUpdatePriority?: (ticketId: string, priority: TicketPriority) => Promise<void> | void
  readonly onAssign?: (ticketId: string, teamId: number | null, memberId: number | null) => Promise<void> | void
  readonly onAddTag?: (ticketId: string, tag: TicketTag) => Promise<void> | void
  readonly onRemoveTag?: (ticketId: string, tagId: number | string) => Promise<void> | void
  readonly onDeleteTicket?: (ticketId: string) => Promise<void> | void
  readonly onComposerSubmit?: (ticketId: string, payload: ComposerSubmitPayload) => Promise<void> | void
}

export const TicketCockpitProvider: React.FC<TicketCockpitProviderProps> = (props) => {
  // If a generic context value is directly provided (dependency injection), use it
  if (props.value) {
    return <TicketCockpitContext value={props.value}>{props.children}</TicketCockpitContext>
  }

  return (
    <SafeQueryProvider>
      <TicketCockpitInternalProvider {...props} />
    </SafeQueryProvider>
  )
}

const EMPTY_TEAMS: readonly OrgTeamOption[] = []
const EMPTY_MEMBERS: readonly OrgMemberOption[] = []
const EMPTY_TAGS: readonly TicketTag[] = []

function TicketCockpitInternalProvider({
  children,
  apiUrl,
  token,
  liveClient: propLiveClient,
  tickets: propTickets,
  selectedTicketId: controlledSelectedTicketId,
  onSelectTicket,
  teams = EMPTY_TEAMS,
  members = EMPTY_MEMBERS,
  allTags = EMPTY_TAGS,
  currentUserId = 2,
  userRole = 'agent',
  initialTicketNumber,
  initialPreset,
  onClaimTicket,
  onUpdateStatus,
  onUpdatePriority,
  onAssign,
  onAddTag,
  onRemoveTag,
  onDeleteTicket,
  onComposerSubmit,
}: Omit<TicketCockpitProviderProps, 'value'>) {
  const queryClient = useQueryClient()
  const configRef = useRef({ apiUrl, token, userRole, onComposerSubmit, queryClient })
  configRef.current = { apiUrl, token, userRole, onComposerSubmit, queryClient }

  // Live client instance (uses injected prop or creates default when apiUrl and token are available)
  const liveClientInstance = useMemo(() => {
    if (propLiveClient) return propLiveClient
    if (apiUrl && token) {
      return createLiveClient({ apiUrl, token })
    }
    return null
  }, [propLiveClient, apiUrl, token])

  const [liveStatus, setLiveStatus] = useState<LiveStatus>(() =>
    liveClientInstance?.status ?? (apiUrl ? 'connecting' : 'connected')
  )

  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const knownRevisionsRef = useRef<Map<string, number>>(new Map())
  const [isUnavailable, setIsUnavailable] = useState(false)
  const [fieldConflicts, setFieldConflicts] = useState<Record<string, Partial<Record<ConflictedTicketField, TicketFieldConflict>>>>({})
  const [assignmentConflicts, setAssignmentConflicts] = useState<Record<string, AssignmentConflict | undefined>>({})

  // Queue holding state for in-place updates & deliberate reordering
  const [heldTickets, setHeldTickets] = useState<readonly TicketItem[] | null>(null)
  const [pendingServerTickets, setPendingServerTickets] = useState<readonly TicketItem[] | null>(null)
  const pendingServerTicketsRef = useRef(pendingServerTickets)
  pendingServerTicketsRef.current = pendingServerTickets
  const hasPendingQueueReorder = Boolean(pendingServerTickets && pendingServerTickets.length > 0)

  const resetQueueHold = () => {
    setHeldTickets(null)
    setPendingServerTickets(null)
  }

  // Initial fallback data if no tickets are passed and no API URL is configured (normalized at provider boundary)
  const normalizedPropTickets = useMemo(() => {
    if (!propTickets) return null
    return propTickets.map(normalizeTicketItem)
  }, [propTickets])

  const effectivePropTickets = normalizedPropTickets ?? (apiUrl ? [] : INITIAL_MOCK_TICKETS)

  // Resolve initial ticket number from prop or window location (cheap primitive parsing, no useMemo)
  const initialTicketNum = typeof initialTicketNumber === 'number'
    ? initialTicketNumber
    : typeof initialTicketNumber === 'string'
      ? Number(initialTicketNumber) || null
      : typeof window !== 'undefined'
        ? parseTicketNumberFromPath(window.location?.pathname)
        : null

  // Resolve initial ticket candidate from provided prop tickets
  const initialTicket = useMemo(() => {
    if (initialTicketNum !== null && effectivePropTickets.length > 0) {
      const match = effectivePropTickets.find((t) => t.ticket_number === initialTicketNum)
      if (match) return match
    }
    return effectivePropTickets[0] ?? null
  }, [initialTicketNum, effectivePropTickets])

  const [internalTickets, setInternalTickets] = useState<readonly TicketItem[]>(() => effectivePropTickets)
  const [internalTags, setInternalTags] = useState<readonly TicketTag[]>(() => allTags)
  const [internalSelectedTicketId, setInternalSelectedTicketId] = useState<string | null>(
    () => initialTicket?.id ?? null
  )
  const [ticketViewers, setTicketViewers] = useState<readonly PresenceMember[]>([])
  const [ticketTypingMembers, setTicketTypingMembers] = useState<readonly PresenceMember[]>([])
  const [activePreset, setActivePreset] = useState<PresetFilter>(() => {
    if (initialPreset) return initialPreset
    if (initialTicket && ['resolved', 'closed'].includes(initialTicket.status)) {
      return 'resolved_closed'
    }
    return 'all_open'
  })

  // Adjust activePreset during render when initialPreset prop changes
  const [prevInitialPreset, setPrevInitialPreset] = useState(initialPreset)
  if (initialPreset && initialPreset !== prevInitialPreset) {
    setPrevInitialPreset(initialPreset)
    if (activePreset !== initialPreset) {
      setActivePreset(initialPreset)
      resetQueueHold()
    }
  }
  const [filters, setFiltersState] = useState<CompoundFilters>(DEFAULT_COMPOUND_FILTERS)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobilePane, setMobilePane] = useState<'queue' | 'detail'>(() => {
    return initialTicketNum !== null ? 'detail' : 'queue'
  })
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Scoped parameters for live TanStack Query fetching
  const presetParams = useMemo(() => {
    const params = new URLSearchParams()
    const queryMap = getPresetQueryParams(activePreset)
    for (const [k, v] of Object.entries(queryMap)) {
      params.set(k, v)
    }
    return params.toString()
  }, [activePreset])

  // TanStack Query: global organization tickets query to maintain global queue preset metrics
  const { data: globalServerTickets } = useQuery<readonly TicketItem[]>({
    queryKey: ['tickets-global', apiUrl],
    queryFn: async () => {
      const url = resolveApiEndpoint(apiUrl ?? '', 'tickets?all=true')
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('Failed to fetch global tickets')
      const data = await res.json()
      const backendList: any[] = data.data || data.tickets || []
      for (const raw of backendList) {
        if (raw.id && raw.revision !== undefined) {
          knownRevisionsRef.current.set(String(raw.id), raw.revision)
        }
      }
      return backendList.map(normalizeTicketItem)
    },
    enabled: Boolean(apiUrl),
    staleTime: 30_000,
  })

  // TanStack Query: live query to GET /api/tickets with scoped preset parameters
  const {
    data: serverTickets,
    isLoading,
    isError,
    isFetching,
  } = useQuery<readonly TicketItem[]>({
    queryKey: ['tickets', apiUrl, activePreset, presetParams],
    queryFn: async () => {
      const url = resolveApiEndpoint(apiUrl ?? '', `tickets?${presetParams}`)
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('Failed to fetch tickets')
      const data = await res.json()
      const backendList: any[] = data.data || data.tickets || []
      for (const raw of backendList) {
        if (raw.id && raw.revision !== undefined) {
          knownRevisionsRef.current.set(String(raw.id), raw.revision)
        }
      }
      return backendList.map(normalizeTicketItem)
    },
    enabled: Boolean(apiUrl),
    staleTime: 30_000,
  })

  // Synchronize incoming serverTickets into heldTickets and evaluate pending queue reorder
  const [prevServerTickets, setPrevServerTickets] = useState(serverTickets)
  if (serverTickets !== prevServerTickets) {
    setPrevServerTickets(serverTickets)
    if (serverTickets && serverTickets.length > 0) {
      if (!heldTickets || heldTickets.length === 0) {
        setHeldTickets(serverTickets)
        setPendingServerTickets(null)
      } else {
        const currentIds = heldTickets.map((t) => t.id)
        const incomingIds = serverTickets.map((t) => t.id)
        const hasNew = incomingIds.some((id) => !currentIds.includes(id))
        const hasRemoved = currentIds.some((id) => !incomingIds.includes(id))
        const commonIncoming = incomingIds.filter((id) => currentIds.includes(id))
        const commonCurrent = currentIds.filter((id) => incomingIds.includes(id))
        const orderChanged = commonIncoming.some((id, idx) => id !== commonCurrent[idx])

        if (hasNew || hasRemoved || orderChanged) {
          // Visible rows update IN PLACE without changing order or removing rows
          setHeldTickets((prev) =>
            (prev ?? []).map((existing) => {
              const fresh = serverTickets.find((t) => t.id === existing.id)
              return fresh ? { ...existing, ...fresh } : existing
            })
          )
          setPendingServerTickets(serverTickets)
        } else {
          setHeldTickets(serverTickets)
          setPendingServerTickets(null)
        }
      }
    } else if (serverTickets && serverTickets.length === 0) {
      setHeldTickets([])
      setPendingServerTickets(null)
    }
  }

  // Adjust internal state during render when external data props change
  const [prevPropTickets, setPrevPropTickets] = useState(normalizedPropTickets)
  if (normalizedPropTickets !== prevPropTickets) {
    setPrevPropTickets(normalizedPropTickets)
    if (normalizedPropTickets) {
      setInternalTickets(normalizedPropTickets)
    }
  }

  const [prevTags, setPrevTags] = useState(allTags)
  if (allTags !== prevTags) {
    setPrevTags(allTags)
    setInternalTags(allTags)
  }

  // Merge server/held tickets with internal tickets (preserving local modifications by ID)
  const effectiveTickets = useMemo(() => {
    const primaryTickets = heldTickets !== null
      ? heldTickets
      : serverTickets !== undefined && serverTickets !== null
        ? serverTickets
        : null

    if (primaryTickets !== null) {
      if (internalTickets.length > 0) {
        const primaryIds = new Set(primaryTickets.map((t) => t.id))
        const preserved = internalTickets.filter((t) => !primaryIds.has(t.id))
        return [...primaryTickets, ...preserved]
      }
      return primaryTickets
    }
    return internalTickets
  }, [heldTickets, serverTickets, internalTickets])

  // TanStack Query: live query to GET /api/tags
  const { data: serverTags } = useQuery<readonly TicketTag[]>({
    queryKey: ['tags', apiUrl],
    queryFn: async () => {
      const url = resolveApiEndpoint(apiUrl ?? '', 'tags')
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('Failed to fetch tags')
      const json = await res.json()
      const list = json.data || json.tags || []
      return list.map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        color: t.color || '#64748B',
      }))
    },
    enabled: Boolean(apiUrl),
    staleTime: 60_000,
  })

  // Ref mirror of effectiveTickets to keep action callbacks stable without invalidation cascades
  const effectiveTicketsRef = useRef(effectiveTickets)
  effectiveTicketsRef.current = effectiveTickets

  const effectiveTags = useMemo(() => {
    if (serverTags && serverTags.length > 0) {
      const serverIds = new Set(serverTags.map((t) => t.id))
      const preserved = internalTags.filter((t) => !serverIds.has(t.id))
      return [...serverTags, ...preserved]
    }
    return internalTags
  }, [serverTags, internalTags])

  const selectedTicketId = controlledSelectedTicketId !== undefined
    ? controlledSelectedTicketId
    : internalSelectedTicketId

  // Unified pool of all organization tickets to preserve global preset metrics across scoped queries
  const allKnownTickets = useMemo(() => {
    if (normalizedPropTickets && normalizedPropTickets.length > 0) {
      return effectiveTickets
    }
    const ticketMap = new Map<string, TicketItem>()
    if (globalServerTickets) {
      for (const t of globalServerTickets) {
        ticketMap.set(String(t.id), t)
      }
    }
    if (serverTickets) {
      for (const t of serverTickets) {
        ticketMap.set(String(t.id), t)
      }
    }
    for (const t of effectiveTickets) {
      ticketMap.set(String(t.id), t)
    }
    const result = Array.from(ticketMap.values())
    return result.length > 0 ? result : effectiveTickets
  }, [normalizedPropTickets, effectiveTickets, globalServerTickets, serverTickets])

  // Target ticket synchronization: When initialTicketNum updates or tickets hydrate, select targeted ticket
  const [syncedTicketNum, setSyncedTicketNum] = useState<number | null>(null)
  if (initialTicketNum !== null && syncedTicketNum !== initialTicketNum && allKnownTickets.length > 0) {
    const match = allKnownTickets.find((t) => t.ticket_number === initialTicketNum)
    if (match) {
      setSyncedTicketNum(initialTicketNum)
      if (internalSelectedTicketId !== match.id) {
        setInternalSelectedTicketId(match.id)
      }
      if (['resolved', 'closed'].includes(match.status) && activePreset !== 'resolved_closed') {
        setActivePreset('resolved_closed')
      }
      if (mobilePane !== 'detail') {
        setMobilePane('detail')
      }
    }
  } else if (initialTicketNum === null && internalSelectedTicketId === null && effectiveTickets.length > 0) {
    setInternalSelectedTicketId(effectiveTickets[0].id)
  }

  // HTML5 History popstate synchronization for browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const num = parseTicketNumberFromPath(window.location.pathname)
      if (num !== null) {
        const target = allKnownTickets.find((t) => t.ticket_number === num)
        if (target) {
          setInternalSelectedTicketId(target.id)
          setMobilePane('detail')
          if (['resolved', 'closed'].includes(target.status)) {
            setActivePreset('resolved_closed')
          }
        }
      } else if (window.location.pathname === '/tickets') {
        setMobilePane('queue')
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [allKnownTickets])

  // Calculate counts for each preset using shared matchesPreset predicate against all known tickets (single-pass reduction)
  const presetCounts = useMemo(() => {
    const counts = {
      all_open: 0,
      my_tickets: 0,
      unassigned: 0,
      team_queue: 0,
      resolved_closed: 0,
    }
    for (const ticket of allKnownTickets) {
      if (matchesPreset(ticket, 'all_open', currentUserId)) counts.all_open++
      if (matchesPreset(ticket, 'my_tickets', currentUserId)) counts.my_tickets++
      if (matchesPreset(ticket, 'unassigned', currentUserId)) counts.unassigned++
      if (matchesPreset(ticket, 'team_queue', currentUserId)) counts.team_queue++
      if (matchesPreset(ticket, 'resolved_closed', currentUserId)) counts.resolved_closed++
    }
    return counts
  }, [allKnownTickets, currentUserId])

  // Filter tickets by preset, compound filter dropdowns, and search query (derived in render)
  const filteredTickets = useMemo(() => {
    return effectiveTickets.filter((ticket) => {
      // 1. Preset filtering via shared predicate
      if (!matchesPreset(ticket, activePreset, currentUserId)) {
        return false
      }

      // 2. Compound dropdown filters
      if (filters.status !== 'all' && ticket.status !== filters.status) {
        return false
      }
      if (filters.priority !== 'all' && ticket.priority !== filters.priority) {
        return false
      }
      if (filters.teamId !== 'all' && ticket.assigned_team_id !== Number(filters.teamId)) {
        return false
      }
      if (filters.tagId !== 'all') {
        const hasTag = ticket.tags?.some((t) => t.id === Number(filters.tagId))
        if (!hasTag) return false
      }

      // 3. Search query filter
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
  }, [effectiveTickets, activePreset, currentUserId, filters, searchQuery])

  // Target ticket ID to query full details for (active ticket or explicitly selected ID)
  const targetTicketId = selectedTicketId ?? (effectiveTickets[0]?.id ?? null)

  // Reset isUnavailable on target ticket change
  const [prevTargetTicketId, setPrevTargetTicketId] = useState(targetTicketId)
  if (targetTicketId !== prevTargetTicketId) {
    setPrevTargetTicketId(targetTicketId)
    setIsUnavailable(false)
  }

  const { data: serverTicketDetail } = useQuery({
    queryKey: ['ticket', targetTicketId],
    queryFn: async () => {
      if (!apiUrl || !targetTicketId) return null
      const url = resolveApiEndpoint(apiUrl, `tickets/${targetTicketId}`)
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        if (res.status === 403 || res.status === 404 || res.status === 410) {
          setIsUnavailable(true)
          throw new Error('UNAVAILABLE')
        }
        throw new Error('Failed to fetch ticket detail')
      }
      const json = await res.json()
      const raw = json.data || json.ticket || json

      if (raw.deleted_at || json.deleted_at) {
        setIsUnavailable(true)
      } else {
        setIsUnavailable(false)
      }

      if (raw.id && raw.revision !== undefined) {
        knownRevisionsRef.current.set(String(raw.id), raw.revision)
      }

      const normalizedMessages: TicketMessage[] = (raw.messages || json.messages || []).map((m: any) =>
        normalizeTicketMessage(m, targetTicketId)
      )

      return {
        id: String(raw.id),
        organization_id: raw.organization_id ?? 1,
        ticket_number: raw.ticket_number ?? 1001,
        subject: raw.subject || 'Support Ticket',
        status: (raw.status as TicketStatus) || 'open',
        priority: (raw.priority as TicketPriority) || 'medium',
        revision: raw.revision ?? 1,
        status_revision: raw.status_revision,
        priority_revision: raw.priority_revision,
        assignment_revision: raw.assignment_revision,
        customer: raw.customer || json.customer || null,
        assigned_team_id: raw.assigned_team_id ?? null,
        assigned_team_name: raw.assigned_team?.name ?? raw.assigned_team_name ?? null,
        assigned_member_id: raw.assigned_member_id ?? null,
        assigned_member_name: raw.assigned_member?.user?.name ?? raw.assigned_member_name ?? null,
        tags: raw.tags || json.tags || [],
        messages: normalizedMessages,
        assignments: normalizeTicketAssignments(raw.assignments || json.assignments || json.ticket_assignments),
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      } as TicketItem
    },
    enabled: Boolean(apiUrl && targetTicketId),
    staleTime: 10_000,
  })

  const targetTicketIdRef = useRef(targetTicketId)
  targetTicketIdRef.current = targetTicketId
  const selectedTicketIdRef = useRef(selectedTicketId)
  selectedTicketIdRef.current = selectedTicketId

  // Live channel subscriptions and signal processing
  useEffect(() => {
    if (!liveClientInstance) return

    const unsubStatus = liveClientInstance.onStatusChange((status) => {
      setLiveStatus(status)
    })

    const unsubReconnect = liveClientInstance.onReconnect(() => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      const currentTarget = targetTicketIdRef.current
      if (currentTarget) {
        queryClient.invalidateQueries({ queryKey: ['ticket', currentTarget] })
      }
    })

    const processSignal = (signal: LiveSignalPayload, isTicketSpecific = false) => {
      // 1. Deduplicate by event_id
      if (seenEventIdsRef.current.has(signal.event_id)) {
        return
      }
      seenEventIdsRef.current.add(signal.event_id)
      if (seenEventIdsRef.current.size > 2000) {
        const [first] = seenEventIdsRef.current
        seenEventIdsRef.current.delete(first)
      }

      // 2. Ignore older revisions
      const knownRev = knownRevisionsRef.current.get(signal.ticket_id)
      if (knownRev !== undefined && signal.revision <= knownRev) {
        return
      }
      knownRevisionsRef.current.set(signal.ticket_id, signal.revision)

      const currentTarget = targetTicketIdRef.current
      const currentSelected = selectedTicketIdRef.current

      // 3. Deletion check for active ticket
      if (signal.change_type === 'deleted') {
        if (isTicketSpecific || signal.ticket_id === currentTarget || signal.ticket_id === currentSelected) {
          setIsUnavailable(true)
        }
        setHeldTickets((prev) => (prev ? prev.filter((t) => t.id !== signal.ticket_id) : []))
        setInternalTickets((prev) => prev.filter((t) => t.id !== signal.ticket_id))
      }

      // 4. Invalidate authoritative REST queries
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      if (isTicketSpecific || signal.ticket_id === currentTarget) {
        queryClient.invalidateQueries({ queryKey: ['ticket', signal.ticket_id] })
      }
    }

    const unsubOrg = liveClientInstance.subscribeToOrganization((sig) => processSignal(sig, false))

    return () => {
      unsubStatus()
      unsubReconnect()
      unsubOrg()
      if (!propLiveClient) {
        liveClientInstance.disconnect()
      }
    }
  }, [liveClientInstance, propLiveClient, queryClient])

  useEffect(() => {
    if (!liveClientInstance || !targetTicketId) return

    const unsubTicket = liveClientInstance.subscribeToTicket(targetTicketId, (signal) => {
      if (seenEventIdsRef.current.has(signal.event_id)) {
        return
      }
      seenEventIdsRef.current.add(signal.event_id)
      const knownRev = knownRevisionsRef.current.get(signal.ticket_id)
      if (knownRev !== undefined && signal.revision <= knownRev) {
        return
      }
      knownRevisionsRef.current.set(signal.ticket_id, signal.revision)

      if (signal.change_type === 'deleted') {
        setIsUnavailable(true)
        setHeldTickets((prev) => (prev ? prev.filter((t) => t.id !== signal.ticket_id) : []))
        setInternalTickets((prev) => prev.filter((t) => t.id !== signal.ticket_id))
      }

      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['ticket', targetTicketId] })
    })

    return () => {
      unsubTicket()
    }
  }, [liveClientInstance, targetTicketId, queryClient])

  // Ticket viewing presence tracking (Issue #151)
  useEffect(() => {
    if (!liveClientInstance?.subscribeToTicketViewers || !targetTicketId) {
      setTicketViewers([])
      return
    }

    let activeUnsubscribe: (() => void) | null = null

    const subscribe = () => {
      if (activeUnsubscribe) {
        activeUnsubscribe()
        activeUnsubscribe = null
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        setTicketViewers([])
        return
      }
      activeUnsubscribe = liveClientInstance.subscribeToTicketViewers!(
        targetTicketId,
        (viewers) => {
          setTicketViewers(viewers)
        }
      )
    }

    subscribe()

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'hidden') {
        if (activeUnsubscribe) {
          activeUnsubscribe()
          activeUnsubscribe = null
        }
        setTicketViewers([])
      } else {
        subscribe()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      if (activeUnsubscribe) {
        activeUnsubscribe()
        activeUnsubscribe = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [liveClientInstance, targetTicketId])

  // Ticket typing presence tracking (Issue #152)
  const activeTypingTicketRef = useRef<string | null>(null)
  const membersRef = useRef(members)
  membersRef.current = members

  useEffect(() => {
    if (!liveClientInstance?.subscribeToTicketTyping || !targetTicketId) {
      setTicketTypingMembers([])
      return
    }

    let activeUnsubscribe: (() => void) | null = null

    const subscribe = () => {
      if (activeUnsubscribe) {
        activeUnsubscribe()
        activeUnsubscribe = null
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        setTicketTypingMembers([])
        return
      }
      activeUnsubscribe = liveClientInstance.subscribeToTicketTyping!(
        targetTicketId,
        (typingMembers) => {
          // Other verified Organization Members' typing appears; current member's own typing is strictly omitted
          const otherMembers = typingMembers.filter((m) => m.member_id !== currentUserId)
          const resolvedMembers = otherMembers.map((m) => {
            if (m.name.startsWith('Member ')) {
              const matched = membersRef.current.find((om) => om.id === m.member_id)
              if (matched) return { ...m, name: matched.name }
            }
            return m
          })
          setTicketTypingMembers(resolvedMembers)
        }
      )
    }

    subscribe()

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'hidden') {
        if (activeUnsubscribe) {
          activeUnsubscribe()
          activeUnsubscribe = null
        }
        setTicketTypingMembers([])
        // Hidden Ticket views stop sending typing state
        if (activeTypingTicketRef.current) {
          liveClientInstance?.sendTicketTyping?.(activeTypingTicketRef.current, false)
          activeTypingTicketRef.current = null
        }
      } else {
        subscribe()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      if (activeUnsubscribe) {
        activeUnsubscribe()
        activeUnsubscribe = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      // Departed Ticket views stop sending typing state
      if (activeTypingTicketRef.current) {
        liveClientInstance?.sendTicketTyping?.(activeTypingTicketRef.current, false)
        activeTypingTicketRef.current = null
      }
      setTicketTypingMembers([])
    }
  }, [liveClientInstance, targetTicketId, currentUserId])

  // Active Ticket: derives base ticket from queue, merging live server details if available
  const activeTicket = useMemo(() => {
    if (isUnavailable) return null
    let baseTicket: TicketItem | null = null
    if (selectedTicketId) {
      baseTicket = allKnownTickets.find((t) => t.id === selectedTicketId) ?? null
    }
    if (!baseTicket) {
      baseTicket = filteredTickets[0] ?? effectiveTickets[0] ?? null
    }

    if (serverTicketDetail && (serverTicketDetail.id === targetTicketId || (baseTicket && serverTicketDetail.id === baseTicket.id))) {
      return {
        ...(baseTicket ?? {}),
        ...serverTicketDetail,
        messages: serverTicketDetail.messages && serverTicketDetail.messages.length > 0
          ? serverTicketDetail.messages
          : baseTicket?.messages ?? [],
      } as TicketItem
    }

    return baseTicket
  }, [allKnownTickets, effectiveTickets, selectedTicketId, filteredTickets, serverTicketDetail, targetTicketId, isUnavailable])

  // Derive whether activeTicket is outside the currently active preset
  const isOutsidePreset = Boolean(
    activeTicket &&
    !isUnavailable &&
    !matchesPreset(activeTicket, activePreset, currentUserId)
  )
  const executeApiMutation = async (
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    ticketIdToInvalidate?: string
  ) => {
    const { apiUrl: cfgApiUrl, token: cfgToken, queryClient: cfgQueryClient } = configRef.current
    if (!cfgApiUrl) return null

    const url = resolveApiEndpoint(cfgApiUrl, endpoint)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (cfgToken) {
      headers.Authorization = `Bearer ${cfgToken}`
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new ApiMutationError(err.message || `Request to ${endpoint} failed (${res.status})`, res.status, err.current)
    }

    cfgQueryClient.invalidateQueries({ queryKey: ['tickets'] })
    if (ticketIdToInvalidate) {
      cfgQueryClient.invalidateQueries({ queryKey: ['ticket', ticketIdToInvalidate] })
    }
    return res.json().catch(() => null)
  }

  const currentTicketForMutation = useCallback((ticketId: string) => {
    return queryClient.getQueryData<TicketItem>(['ticket', ticketId])
      ?? effectiveTicketsRef.current.find((ticket) => ticket.id === ticketId)
  }, [queryClient])

  const recordFieldConflict = (
    field: ConflictedTicketField,
    ticketId: string,
    intendedValue: TicketStatus | TicketPriority,
    error: unknown
  ): boolean => {
    if (!(error instanceof ApiMutationError) || error.status !== 409) return false
    const currentValue = error.current?.[field]
    if (typeof currentValue !== 'string') return false
    setFieldConflicts((previous) => ({
      ...previous,
      [ticketId]: {
        ...previous[ticketId],
        [field]: { ticketId, currentValue, intendedValue },
      },
    }))
    return true
  }

  const clearFieldConflict = (ticketId: string, field: ConflictedTicketField) => {
    setFieldConflicts((previous) => ({
      ...previous,
      [ticketId]: { ...previous[ticketId], [field]: undefined },
    }))
  }

  const refreshTicketForConflict = useCallback(async (ticketId: string) => {
    await queryClient.refetchQueries(
      { queryKey: ['ticket', ticketId], exact: true, type: 'active' },
      { throwOnError: true }
    )
    return queryClient.getQueryData<TicketItem>(['ticket', ticketId])
  }, [queryClient])

  const recordAssignmentConflict = (
    ticketId: string,
    action: 'assign' | 'claim',
    intended: AssignmentPair,
    error: unknown
  ): boolean => {
    if (!(error instanceof ApiMutationError) || error.status !== 409) return false
    const current = error.current
    const currentRevision = current?.assignment_revision
    if (!current || typeof currentRevision !== 'number') return false
    const teamId = current.assigned_team_id
    const memberId = current.assigned_member_id
    if ((teamId !== null && typeof teamId !== 'number') || (memberId !== null && typeof memberId !== 'number')) return false
    setAssignmentConflicts((previous) => ({
      ...previous,
      [ticketId]: {
        ticketId,
        action,
        currentRevision,
        intended: action === 'claim' ? { teamId, memberId: intended.memberId } : intended,
        current: { teamId, memberId },
      },
    }))
    return true
  }

  const clearAssignmentConflict = (ticketId: string) => {
    setAssignmentConflicts((previous) => ({ ...previous, [ticketId]: undefined }))
  }

  // Stable Actions with functional state updates & ref lookups
  const actions: TicketCockpitActions = useMemo(() => {
    return {
      selectTicket: (ticketId: string) => {
        if (controlledSelectedTicketId === undefined) {
          setInternalSelectedTicketId(ticketId)
        }
        onSelectTicket?.(ticketId)
        setMobilePane('detail')

        // Update URL to /tickets/:ticketNumber via HTML5 History without full page reload
        const targetTicket = effectiveTicketsRef.current.find((t) => t.id === ticketId)
        if (targetTicket && typeof window !== 'undefined' && window.history?.pushState) {
          const targetUrl = `/tickets/${targetTicket.ticket_number}`
          if (window.location.pathname !== targetUrl) {
            window.history.pushState(
              { ticketId, ticketNumber: targetTicket.ticket_number },
              '',
              targetUrl
            )
          }
        }
      },
      setActivePreset: (preset: PresetFilter) => {
        setActivePreset(preset)
        resetQueueHold()
      },
      setSearchQuery: (query: string) => {
        setSearchQuery(query)
      },
      setFilters: (newFilters: Partial<CompoundFilters>) => {
        setFiltersState((prev) => ({ ...prev, ...newFilters }))
        resetQueueHold()
      },
      resetFilters: () => {
        setFiltersState(DEFAULT_COMPOUND_FILTERS)
        resetQueueHold()
      },
      applyPendingQueueOrder: () => {
        if (pendingServerTicketsRef.current) {
          setHeldTickets(pendingServerTicketsRef.current)
          setPendingServerTickets(null)
        }
      },
      setMobilePane: (pane: 'queue' | 'detail') => {
        setMobilePane(pane)
      },
      claimTicket: async (ticketId: string) => {
        const targetTicket = currentTicketForMutation(ticketId)
        if (!targetTicket) return
        const assignmentRevision = assignmentRevisionForMutation(targetTicket, configRef.current.apiUrl)
        const previousTicket = targetTicket

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
                  created_at: new Date().toISOString(),
                  note: 'Claimed ticket from queue',
                },
              ],
            }
          })
        )

        try {
          if (onClaimTicket) await onClaimTicket(ticketId)
          await executeApiMutation(`tickets/${ticketId}/claim`, 'POST',
            { expected_assignment_revision: assignmentRevision }, ticketId)
          clearAssignmentConflict(ticketId)
        } catch (err) {
          setInternalTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? previousTicket : t))
          )
          if (!recordAssignmentConflict(ticketId, 'claim', {
            teamId: targetTicket.assigned_team_id ?? null,
            memberId: currentUserId,
          }, err)) throw err
        }
      },
      updateStatus: async (ticketId: string, status: TicketStatus) => {
        const targetTicket = currentTicketForMutation(ticketId)
        if (!targetTicket || targetTicket.status === status) return
        const previousStatus = targetTicket.status

        setInternalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
        )

        try {
          if (onUpdateStatus) await onUpdateStatus(ticketId, status)
          await executeApiMutation(`tickets/${ticketId}/status`, 'PATCH', {
            status,
            ...(targetTicket.status_revision !== undefined
              ? { expected_status_revision: targetTicket.status_revision } : {}),
          }, ticketId)
          clearFieldConflict(ticketId, 'status')
        } catch (err) {
          setInternalTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, status: previousStatus } : t))
          )
          if (!recordFieldConflict('status', ticketId, status, err)) throw err
        }
      },
      updatePriority: async (ticketId: string, priority: TicketPriority) => {
        const targetTicket = currentTicketForMutation(ticketId)
        if (!targetTicket || targetTicket.priority === priority) return
        const previousPriority = targetTicket.priority

        setInternalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, priority } : t))
        )

        try {
          if (onUpdatePriority) await onUpdatePriority(ticketId, priority)
          await executeApiMutation(`tickets/${ticketId}/priority`, 'PATCH', {
            priority,
            ...(targetTicket.priority_revision !== undefined
              ? { expected_priority_revision: targetTicket.priority_revision } : {}),
          }, ticketId)
          clearFieldConflict(ticketId, 'priority')
        } catch (err) {
          setInternalTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, priority: previousPriority } : t))
          )
          if (!recordFieldConflict('priority', ticketId, priority, err)) throw err
        }
      },
      setConflictedFieldIntent: (ticketId: string, field: ConflictedTicketField, value: TicketStatus | TicketPriority) => {
        setFieldConflicts((previous) => {
          const conflict = previous[ticketId]?.[field]
          if (!conflict) return previous
          return {
            ...previous,
            [ticketId]: {
              ...previous[ticketId],
              [field]: { ...conflict, intendedValue: value },
            },
          }
        })
      },
      useCurrentFieldValue: async (ticketId: string, field: ConflictedTicketField) => {
        const conflict = fieldConflicts[ticketId]?.[field]
        if (!conflict) return
        await refreshTicketForConflict(conflict.ticketId)
        clearFieldConflict(ticketId, field)
      },
      retryFieldChange: async (ticketId: string, field: ConflictedTicketField) => {
        const conflict = fieldConflicts[ticketId]?.[field]
        if (!conflict) return
        const freshTicket = await refreshTicketForConflict(conflict.ticketId)
        const revision = freshTicket?.[`${field}_revision`]
        if (revision === undefined) throw new Error('Could not refresh Ticket revision. Try again.')
        try {
          await executeApiMutation(`tickets/${conflict.ticketId}/${field}`, 'PATCH', {
            [field]: conflict.intendedValue,
            [`expected_${field}_revision`]: revision,
          }, conflict.ticketId)
          clearFieldConflict(ticketId, field)
        } catch (error) {
          if (!recordFieldConflict(field, conflict.ticketId, conflict.intendedValue, error)) throw error
        }
      },
      setConflictedAssignmentIntent: (ticketId: string, teamId: number | null, memberId: number | null) => {
        setAssignmentConflicts((previous) => {
          const conflict = previous[ticketId]
          if (!conflict) return previous
          return { ...previous, [ticketId]: { ...conflict, action: 'assign', intended: { teamId, memberId } } }
        })
      },
      useCurrentAssignment: async (ticketId: string) => {
        const conflict = assignmentConflicts[ticketId]
        if (!conflict) return
        await refreshTicketForConflict(ticketId)
        clearAssignmentConflict(ticketId)
      },
      retryAssignment: async (ticketId: string) => {
        const conflict = assignmentConflicts[ticketId]
        if (!conflict) return
        const freshTicket = await refreshTicketForConflict(ticketId)
        const revision = freshTicket?.assignment_revision
        if (revision === undefined) throw new Error('Could not refresh Assignment revision. Try again.')
        if (revision !== conflict.currentRevision) {
          const current = {
            teamId: freshTicket?.assigned_team_id ?? null,
            memberId: freshTicket?.assigned_member_id ?? null,
          }
          setAssignmentConflicts((previous) => {
            const pending = previous[ticketId]
            if (!pending) return previous
            return {
              ...previous,
              [ticketId]: {
                ...pending,
                currentRevision: revision,
                current,
                intended: pending.action === 'claim'
                  ? { teamId: current.teamId, memberId: pending.intended.memberId }
                  : pending.intended,
              },
            }
          })
          return
        }
        const endpoint = conflict.action === 'claim' ? 'claim' : 'assign'
        const body = conflict.action === 'claim'
          ? { expected_assignment_revision: revision }
          : {
              team_id: conflict.intended.teamId,
              member_id: conflict.intended.memberId,
              expected_assignment_revision: revision,
            }
        try {
          await executeApiMutation(`tickets/${ticketId}/${endpoint}`, 'POST', body, ticketId)
          clearAssignmentConflict(ticketId)
        } catch (error) {
          if (!recordAssignmentConflict(ticketId, conflict.action, conflict.intended, error)) throw error
        }
      },
      assign: async (ticketId: string, teamId: number | null, memberId: number | null) => {
        const targetTicket = currentTicketForMutation(ticketId)
        const assignmentRevision = assignmentRevisionForMutation(targetTicket, configRef.current.apiUrl)
        const previousTicket = targetTicket ? { ...targetTicket } : null

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
                  created_at: new Date().toISOString(),
                },
              ],
            }
          })
        )

        try {
          if (onAssign) await onAssign(ticketId, teamId, memberId)
          await executeApiMutation(`tickets/${ticketId}/assign`, 'POST', {
            team_id: teamId, member_id: memberId,
            expected_assignment_revision: assignmentRevision,
          }, ticketId)
          clearAssignmentConflict(ticketId)
        } catch (err) {
          if (previousTicket) {
            setInternalTickets((prev) =>
              prev.map((t) => (t.id === ticketId ? previousTicket : t))
            )
          }
          if (!recordAssignmentConflict(ticketId, 'assign', { teamId, memberId }, err)) throw err
        }
      },
      addTag: async (ticketId: string, tag: TicketTag) => {
        const targetTicket = effectiveTicketsRef.current.find((t) => t.id === ticketId)
        const previousTags = targetTicket?.tags ?? []

        setInternalTags((prev) =>
          prev.some((t) => t.id === tag.id || t.slug === tag.slug) ? prev : [...prev, tag]
        )
        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            const existingTags = t.tags || []
            if (existingTags.some((eg) => eg.id === tag.id || eg.slug === tag.slug)) return t
            return {
              ...t,
              tags: [...existingTags, tag],
            }
          })
        )

        try {
          if (onAddTag) await onAddTag(ticketId, tag)
          const { apiUrl: cfgApiUrl } = configRef.current
          if (cfgApiUrl) {
            let persistTagId = tag.id
            if (typeof tag.id === 'number' && tag.id > 1_000_000_000) {
              const created = await executeApiMutation('tags', 'POST', { name: tag.name, slug: tag.slug })
              if (created?.data?.id) {
                persistTagId = created.data.id
              }
            }
            await executeApiMutation(`tickets/${ticketId}/tags`, 'POST', { tag_id: persistTagId }, ticketId)
          }
        } catch (err) {
          setInternalTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, tags: previousTags } : t))
          )
          throw err
        }
      },
      removeTag: async (ticketId: string, tagId: number | string) => {
        const targetTicket = effectiveTicketsRef.current.find((t) => t.id === ticketId)
        const previousTags = targetTicket?.tags ?? []

        setInternalTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t
            return {
              ...t,
              tags: (t.tags || []).filter((tag) => tag.id !== tagId && tag.slug !== String(tagId)),
            }
          })
        )

        try {
          if (onRemoveTag) await onRemoveTag(ticketId, tagId)
          await executeApiMutation(`tickets/${ticketId}/tags/${tagId}`, 'DELETE', undefined, ticketId)
        } catch (err) {
          setInternalTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, tags: previousTags } : t))
          )
          throw err
        }
      },
      deleteTicket: async (ticketId: string) => {
        const previousTickets = effectiveTicketsRef.current
        const previousSelectedId = internalSelectedTicketId

        setInternalTickets((prev) => prev.filter((t) => t.id !== ticketId))
        setInternalSelectedTicketId((curr) => {
          if (curr === ticketId) {
            const next = previousTickets.filter((t) => t.id !== ticketId)
            return next[0]?.id ?? null
          }
          return curr
        })

        try {
          if (onDeleteTicket) await onDeleteTicket(ticketId)
          await executeApiMutation(`tickets/${ticketId}`, 'DELETE')
        } catch (err) {
          setInternalTickets(previousTickets)
          setInternalSelectedTicketId(previousSelectedId)
          throw err
        }
      },
      restoreTicket: async (ticketId: string) => {
        const previousTickets = effectiveTicketsRef.current
        setInternalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: 'open' } : t))
        )
        try {
          await executeApiMutation(`tickets/${ticketId}/restore`, 'POST', undefined, ticketId)
        } catch (err) {
          setInternalTickets(previousTickets)
          throw err
        }
      },
      submitComposer: (ticketId: string, payload: ComposerSubmitPayload) => {
        const { apiUrl: cfgApiUrl, token: cfgToken, userRole: cfgUserRole, onComposerSubmit: cfgOnComposerSubmit, queryClient: cfgQueryClient } = configRef.current
        cfgOnComposerSubmit?.(ticketId, payload)
        const isInternal = payload.messageType === 'internal_note'
        const newMsg: TicketMessage = {
          id: `msg-${Date.now()}`,
          ticket_id: ticketId,
          message_type: payload.messageType,
          author_type: 'OrganizationMember' as const,
          author_name: cfgUserRole === 'admin' ? 'Super Admin' : 'Agent Support',
          author_role: cfgUserRole === 'admin' ? 'Lead Administrator' : 'Support Specialist',
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

        // Dispatch atomic multipart POST /api/tickets/{uuid}/messages if apiUrl configured
        if (cfgApiUrl) {
          const formData = new FormData()
          formData.append('message_type', payload.messageType)
          formData.append('body', payload.body)
          if (!isInternal && payload.nextStatus) {
            formData.append('target_status', payload.nextStatus)
            formData.append('status', payload.nextStatus)
          }
          if (payload.files && payload.files.length > 0) {
            for (const file of payload.files) {
              formData.append('attachments[]', file)
            }
          }

          const headers: Record<string, string> = { Accept: 'application/json' }
          if (cfgToken) {
            headers.Authorization = `Bearer ${cfgToken}`
          }

          const url = resolveApiEndpoint(cfgApiUrl, `tickets/${ticketId}/messages`)
          fetch(url, {
            method: 'POST',
            headers,
            body: formData,
          })
            .then(async (res) => {
              if (res.ok) {
                cfgQueryClient.invalidateQueries({ queryKey: ['ticket', ticketId] })
                cfgQueryClient.invalidateQueries({ queryKey: ['tickets'] })
              }
            })
            .catch((err) => {
              console.error('Error submitting ticket message:', err)
            })
        }
        if (activeTypingTicketRef.current === ticketId) {
          activeTypingTicketRef.current = null
          liveClientInstance?.sendTicketTyping?.(ticketId, false)
        }
      },
      sendTyping: (ticketId: string, isTyping: boolean) => {
        if (isTyping) {
          activeTypingTicketRef.current = ticketId
        } else if (activeTypingTicketRef.current === ticketId) {
          activeTypingTicketRef.current = null
        }
        liveClientInstance?.sendTicketTyping?.(ticketId, isTyping)
      },
    }
  }, [
    controlledSelectedTicketId,
    currentTicketForMutation,
    currentUserId,
    assignmentConflicts,
    fieldConflicts,
    internalSelectedTicketId,
    liveClientInstance,
    members,
    onAddTag,
    onAssign,
    onClaimTicket,
    onDeleteTicket,
    onRemoveTag,
    onSelectTicket,
    onUpdatePriority,
    onUpdateStatus,
    refreshTicketForConflict,
    teams,
    userRole,
  ])

  const state: TicketCockpitState = useMemo(() => ({
    tickets: allKnownTickets,
    filteredTickets,
    selectedTicketId,
    activeTicket,
    activePreset,
    searchQuery,
    filters,
    presetCounts,
    mobilePane,
    teams,
    members,
    allTags: effectiveTags,
    currentUserId,
    userRole,
    isLoading,
    isError: Boolean(isError),
    isFetching,
    liveStatus,
    hasPendingQueueReorder,
    isOutsidePreset,
    isUnavailable,
    ticketViewers,
    ticketTypingMembers,
    fieldConflicts,
    assignmentConflicts,
  }), [
    allKnownTickets,
    filteredTickets,
    selectedTicketId,
    activeTicket,
    activePreset,
    searchQuery,
    filters,
    presetCounts,
    mobilePane,
    teams,
    members,
    effectiveTags,
    currentUserId,
    userRole,
    isLoading,
    isError,
    isFetching,
    liveStatus,
    hasPendingQueueReorder,
    isOutsidePreset,
    isUnavailable,
    ticketViewers,
    ticketTypingMembers,
    fieldConflicts,
    assignmentConflicts,
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
      data-theme="internal"
      data-testid="ticket-cockpit-frame"
      className={`flex-1 flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-surface-canvas text-text-primary -m-4 md:-m-8 border-t border-border-subtle ${className}`}
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
      className={`w-full lg:w-[200px] shrink-0 bg-surface-panel border-r border-border-subtle flex flex-col p-3 z-10 ${
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
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber ${
                  isActive
                    ? 'bg-surface-container text-white shadow-keylight border-l-2 border-amber-action'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-action' : 'text-text-muted'}`} />
                  <span className="truncate">{def.label}</span>
                </div>
                <span
                  data-testid={`preset-count-${def.id}`}
                  className={`font-mono tabular-nums text-[11px] px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-amber-action/20 text-amber-action' : 'text-text-muted'
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
      <div className="mt-auto pt-3 border-t border-border-subtle px-2 text-[11px] font-mono text-text-muted space-y-1">
        <div className="text-white/80 font-medium flex items-center justify-between">
          <span>Split-Cockpit</span>
          {state.liveStatus === 'disconnected' && (
            <span
              data-testid="subrail-disconnected-badge"
              className="text-[9px] text-amber-400 font-mono px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20"
            >
              Paused
            </span>
          )}
        </div>
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
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchInputRef])

  const queueScrollRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTopRef = useRef<number>(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    lastScrollTopRef.current = e.currentTarget.scrollTop
  }

  // Preserve scroll position when tickets update in place
  useEffect(() => {
    if (queueScrollRef.current && lastScrollTopRef.current > 0) {
      queueScrollRef.current.scrollTop = lastScrollTopRef.current
    }
  }, [state.filteredTickets, state.hasPendingQueueReorder])

  const filters = state.filters
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.teamId !== 'all' ||
    filters.tagId !== 'all'

  return (
    <section
      aria-label="Ticket Queue List"
      data-testid="ticket-cockpit-queue"
      className={`w-full lg:w-[380px] shrink-0 bg-surface-canvas border-r border-border-subtle flex flex-col ${
        state.mobilePane === 'detail' ? 'hidden lg:flex' : 'flex'
      } ${className}`}
    >
      {/* Search Header & Compound Filter Bar */}
      <div className="p-3 border-b border-border-subtle bg-surface-panel/80 backdrop-blur-sm space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            data-testid="queue-search-input"
            value={state.searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            placeholder="Search queue... (/)"
            className="w-full h-8 pl-8 pr-3 bg-surface-container-low border border-border-subtle rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-action focus:ring-1 focus:ring-focus-amber"
          />
        </div>

        {/* Compound Filter Dropdowns */}
        <div data-testid="compound-filter-bar" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 text-[11px]">
          {/* Status Filter */}
          <select
            data-testid="filter-status-select"
            aria-label="Filter by Status"
            value={filters.status}
            onChange={(e) => actions.setFilters({ status: e.target.value as TicketStatus | 'all' })}
            className="h-7 px-1.5 bg-surface-container-low border border-border-subtle rounded text-text-secondary focus:text-text-primary focus:border-amber-action focus:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber text-[11px] font-mono cursor-pointer truncate"
          >
            <option value="all">Status: All</option>
            <option value="new">New</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          {/* Priority Filter */}
          <select
            data-testid="filter-priority-select"
            aria-label="Filter by Priority"
            value={filters.priority}
            onChange={(e) => actions.setFilters({ priority: e.target.value as TicketPriority | 'all' })}
            className="h-7 px-1.5 bg-surface-container-low border border-border-subtle rounded text-text-secondary focus:text-text-primary focus:border-amber-action focus:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber text-[11px] font-mono cursor-pointer truncate"
          >
            <option value="all">Priority: All</option>
            <option value="urgent">P0 Urgent</option>
            <option value="high">P1 High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Team Filter */}
          <select
            data-testid="filter-team-select"
            aria-label="Filter by Team"
            value={filters.teamId}
            onChange={(e) => actions.setFilters({ teamId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
            className="h-7 px-1.5 bg-surface-container-low border border-border-subtle rounded text-text-secondary focus:text-text-primary focus:border-amber-action focus:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber text-[11px] font-mono cursor-pointer truncate"
          >
            <option value="all">Team: All</option>
            {state.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          {/* Tag Filter */}
          <select
            data-testid="filter-tag-select"
            aria-label="Filter by Tag"
            value={filters.tagId}
            onChange={(e) => actions.setFilters({ tagId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
            className="h-7 px-1.5 bg-surface-container-low border border-border-subtle rounded text-text-secondary focus:text-text-primary focus:border-amber-action focus:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber text-[11px] font-mono cursor-pointer truncate"
          >
            <option value="all">Tag: All</option>
            {state.allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                #{tag.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters Indicator */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-0.5 text-[10px] text-text-muted font-mono">
            <span>Filtered queue</span>
            <button
              type="button"
              data-testid="clear-filters-btn"
              onClick={() => actions.resetFilters()}
              className="text-amber-action hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber rounded"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Disconnected Status Warning */}
      {state.liveStatus === 'disconnected' ? (
        <div
          data-testid="live-status-indicator"
          className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[10px] font-mono flex items-center justify-between"
          title="Live delivery paused. REST actions remain available."
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Live delivery paused</span>
          </div>
          <span className="text-text-muted text-[9px]">REST actions active</span>
        </div>
      ) : null}

      {/* New Activity Banner */}
      {state.hasPendingQueueReorder ? (
        <div
          data-testid="new-activity-banner"
          className="p-2 bg-amber-action/10 border-b border-amber-action/20 text-center"
        >
          <button
            type="button"
            data-testid="new-activity-btn"
            onClick={() => actions.applyPendingQueueOrder?.()}
            className="text-xs font-mono font-medium text-amber-action hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
          >
            New activity • Apply changed queue order
          </button>
        </div>
      ) : null}

      {/* Tickets List */}
      <div
        ref={queueScrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-border-subtle"
      >
        {children ?? (
          state.filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs font-mono">
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      actions.selectTicket(ticket.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      data-testid={`ticket-row-${ticket.id}`}
      onClick={() => actions.selectTicket(ticket.id)}
      onKeyDown={handleKeyDown}
      className={`p-3 cursor-pointer transition-all border-l-2 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber focus-visible:ring-inset ${
        isSelected
          ? 'bg-surface-container-high border-amber-action shadow-keylight'
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
  const { activeTicket, isUnavailable, isOutsidePreset } = state

  return (
    <section
      aria-label="Ticket Detail and Conversation"
      data-testid="ticket-cockpit-detail"
      className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-surface-canvas border-r border-border-subtle ${
        state.mobilePane === 'queue' ? 'hidden lg:flex' : 'flex'
      } ${className}`}
    >
      {isUnavailable ? (
        <div
          data-testid="ticket-unavailable-state"
          className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted"
        >
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3 text-lg font-mono">
            !
          </div>
          <h3 className="text-body-default font-semibold text-text-primary mb-1">
            Ticket unavailable
          </h3>
          <p className="text-xs text-text-muted max-w-sm">
            This ticket has been deleted or is no longer accessible.
          </p>
        </div>
      ) : activeTicket ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Responsive Mobile Back Breadcrumb (< 1024px) */}
              <button
                type="button"
                data-testid="detail-back-breadcrumb"
                onClick={() => actions.setMobilePane('queue')}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container border border-border-subtle hover:border-border-prominent text-amber-action text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
                title="Back to queue"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Queue</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-amber-action">
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
              {/* Verified Ticket Viewers (Issue #151) */}
              {state.ticketViewers && state.ticketViewers.length > 0 && (
                <div
                  data-testid="ticket-viewers"
                  role="status"
                  aria-label={`${state.ticketViewers.length} viewing this ticket`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-subpanel/80 border border-border-subtle"
                >
                  <Eye className="w-3.5 h-3.5 text-sentiment-positive shrink-0" aria-hidden="true" />
                  <span
                    data-testid="ticket-viewers-count"
                    className="text-[11px] font-mono-data text-text-muted mr-1 hidden sm:inline"
                  >
                    {state.ticketViewers.length === 1 ? '1 viewer' : `${state.ticketViewers.length} viewers`}
                  </span>
                  <div className="flex items-center -space-x-1.5 overflow-hidden">
                    {state.ticketViewers.map((viewer) => {
                      const initials = getInitials(viewer.name)
                      return (
                        <div
                          key={viewer.member_id}
                          data-testid={`ticket-viewer-${viewer.member_id}`}
                          title={`Viewing: ${viewer.name}`}
                          className="w-5 h-5 rounded-full bg-surface-container border border-border-prominent text-[9px] font-mono-data font-semibold text-text-primary flex items-center justify-center shadow-xs"
                        >
                          {initials}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                title="Deep link ticket"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard?.writeText(window.location.href)
                  }
                }}
                className="p-1.5 rounded bg-surface-container-low border border-border-subtle hover:border-border-prominent text-text-muted hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Outside this queue notice */}
          {isOutsidePreset ? (
            <div
              data-testid="outside-queue-notice"
              className="bg-amber-action/10 border-b border-amber-action/30 px-4 py-2 text-xs font-mono text-amber-action flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">Outside this queue</span>
                <span className="text-text-muted text-[10px]">• This ticket does not match the active preset filter</span>
              </div>
            </div>
          ) : null}

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
              <div className="p-4 border-t border-border-subtle bg-surface-panel/90 backdrop-blur-sm">
                <TicketComposer
                  currentStatus={activeTicket.status}
                  typingMembers={state.ticketTypingMembers}
                  onTypingChange={(isTyping) => actions.sendTyping?.(activeTicket.id, isTyping)}
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
  readonly children?: React.ReactNode
  readonly className?: string
}

const TicketCockpitInspectorComponent: React.FC<TicketCockpitInspectorProps> = ({
  children,
  className = '',
}) => {
  const { state } = useTicketCockpit()
  const { activeTicket, isUnavailable } = state

  return (
    <aside
      aria-label="Ticket Metadata Inspector"
      data-testid="ticket-cockpit-inspector"
      className={`w-full lg:w-[300px] shrink-0 bg-surface-canvas p-4 overflow-y-auto space-y-5 border-l border-border-subtle hidden lg:block ${className}`}
    >
      {isUnavailable ? (
        <div data-testid="inspector-unavailable" className="text-text-muted text-xs text-center py-8 font-mono">
          Ticket unavailable
        </div>
      ) : children ?? (
        activeTicket ? (
          <TicketMetadataInspector />
        ) : (
          <div className="text-text-muted text-xs text-center py-8">
            No ticket selected.
          </div>
        )
      )}
    </aside>
  )
}

export const TicketCockpitInspector = Object.assign(TicketCockpitInspectorComponent, {
  CustomerCard: InspectorCustomerCard,
  ClaimCta: InspectorClaimCta,
  Lifecycle: InspectorLifecycle,
  Assignment: InspectorAssignment,
  Routing: InspectorRouting,
  Tags: InspectorTags,
  AuditLog: InspectorAuditLog,
  Destructive: InspectorDestructive,
})

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
