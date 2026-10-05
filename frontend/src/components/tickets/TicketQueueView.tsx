import React, { useMemo, useContext } from 'react'
import { useQuery, QueryClientContext, QueryClientProvider } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import type {
  TicketItem,
  TicketStatus,
  TicketPriority,
  TicketCustomer,
} from './types'
import {
  INITIAL_MOCK_TICKETS,
  MOCK_TEAMS,
  MOCK_MEMBERS,
  MOCK_TAGS_POOL,
} from './mockData'
import { TicketCockpit } from './TicketCockpit'

export type { TicketCustomer }

export interface TicketQueueViewProps {
  readonly apiUrl?: string
  readonly token?: string | null
  readonly userRole?: 'admin' | 'agent'
  readonly currentUserId?: number
}

function SafeQueryProvider({ children }: { children: React.ReactNode }) {
  const client = useContext(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

function TicketQueueViewInner({
  apiUrl,
  token,
  userRole = 'agent',
  currentUserId = 2,
}: TicketQueueViewProps) {
  const { data: serverTickets } = useQuery<readonly TicketItem[]>({
    queryKey: ['tickets', apiUrl],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/tickets`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      if (!res.ok) throw new Error('Failed to fetch tickets')
      const data = await res.json()
      const backendList: any[] = data.data || data.tickets || []
      return backendList.map((bt) => ({
        id: String(bt.id),
        organization_id: bt.organization_id ?? 1,
        ticket_number: bt.ticket_number ?? 1001,
        subject: bt.subject || 'Support Inquiry',
        status: (bt.status as TicketStatus) || 'new',
        priority: (bt.priority as TicketPriority) || 'medium',
        customer: bt.customer || {
          id: 'cust-unknown',
          name: 'External Requester',
          email: 'requester@example.com',
        },
        assigned_team_id: bt.assigned_team_id ?? null,
        assigned_team_name: null,
        assigned_member_id: bt.assigned_member_id ?? null,
        assigned_member_name: null,
        tags: [],
        messages: [],
        assignments: [],
        created_at: bt.created_at,
        updated_at: bt.updated_at,
      }))
    },
    enabled: Boolean(apiUrl && token),
    staleTime: 30_000,
  })

  // Merge server tickets with initial mock fixtures if server tickets returned
  const tickets = useMemo(() => {
    if (!serverTickets || serverTickets.length === 0) {
      return INITIAL_MOCK_TICKETS
    }
    const serverIds = new Set(serverTickets.map((t) => t.id))
    const preserved = INITIAL_MOCK_TICKETS.filter((t) => !serverIds.has(t.id))
    return [...serverTickets, ...preserved]
  }, [serverTickets])

  return (
    <div
      data-testid="tickets-queue-view"
      className="w-full h-full flex flex-col relative select-text"
    >
      <TicketCockpit.Provider
        tickets={tickets}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        currentUserId={currentUserId}
        userRole={userRole}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    </div>
  )
}

export const TicketQueueView: React.FC<TicketQueueViewProps> = (props) => {
  return (
    <SafeQueryProvider>
      <TicketQueueViewInner {...props} />
    </SafeQueryProvider>
  )
}

export default TicketQueueView
