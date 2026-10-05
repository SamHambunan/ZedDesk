import React, { useState, useEffect } from 'react'
import type {
  TicketItem,
  TicketStatus,
  TicketPriority,
  TicketTag,
  TicketCustomer,
} from './types'
import {
  INITIAL_MOCK_TICKETS,
  MOCK_TEAMS,
  MOCK_MEMBERS,
  MOCK_TAGS_POOL,
} from './mockData'
import { TicketCockpit } from './TicketCockpit'
import type { ComposerSubmitPayload } from './TicketComposer'

export type { TicketCustomer }

export interface TicketQueueViewProps {
  readonly apiUrl?: string
  readonly token?: string | null
  readonly userRole?: 'admin' | 'agent'
  readonly currentUserId?: number
}

export const TicketQueueView: React.FC<TicketQueueViewProps> = ({
  apiUrl,
  token,
  userRole = 'agent',
  currentUserId = 2,
}) => {
  const [tickets, setTickets] = useState<TicketItem[]>(() => [...INITIAL_MOCK_TICKETS])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(() => INITIAL_MOCK_TICKETS[0]?.id ?? null)
  const [allTags, setAllTags] = useState<TicketTag[]>(() => [...MOCK_TAGS_POOL])

  // Fetch from backend API if available, merging seamlessly with realistic mock fixtures
  useEffect(() => {
    if (!apiUrl || !token) return

    let cancelled = false
    fetch(`${apiUrl}/api/tickets`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        const backendList: any[] = data.data || data.tickets || []
        if (cancelled || backendList.length === 0) return

        setTickets((prev) => {
          // Merge backend tickets into state preserving mock messages & tags where needed
          const merged: TicketItem[] = backendList.map((bt) => {
            const existing = prev.find((et) => et.id === String(bt.id) || et.ticket_number === bt.ticket_number)
            return {
              id: String(bt.id),
              organization_id: bt.organization_id ?? 1,
              ticket_number: bt.ticket_number ?? (existing?.ticket_number || 1001),
              subject: bt.subject || existing?.subject || 'Support Inquiry',
              status: (bt.status as TicketStatus) || existing?.status || 'new',
              priority: (bt.priority as TicketPriority) || existing?.priority || 'medium',
              customer: bt.customer || existing?.customer || {
                id: 'cust-unknown',
                name: 'External Requester',
                email: 'requester@example.com',
              },
              assigned_team_id: bt.assigned_team_id ?? existing?.assigned_team_id ?? null,
              assigned_team_name: existing?.assigned_team_name ?? null,
              assigned_member_id: bt.assigned_member_id ?? existing?.assigned_member_id ?? null,
              assigned_member_name: existing?.assigned_member_name ?? null,
              tags: existing?.tags || [],
              messages: existing?.messages || [],
              assignments: existing?.assignments || [],
              created_at: bt.created_at || existing?.created_at,
              updated_at: bt.updated_at || existing?.updated_at,
            }
          })

          const backendIds = new Set(merged.map((m) => m.id))
          const preserved = prev.filter((p) => !backendIds.has(p.id))
          return [...merged, ...preserved]
        })
      })
      .catch(() => {
        // Fall back to INITIAL_MOCK_TICKETS gracefully
      })

    return () => {
      cancelled = true
    }
  }, [apiUrl, token])

  // Handlers for ticket mutations
  const handleClaimTicket = (ticketId: string) => {
    const currentMember = MOCK_MEMBERS.find((m) => m.id === currentUserId)
    const memberName = currentMember ? currentMember.name : 'Current Agent'

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t
        return {
          ...t,
          assigned_member_id: currentUserId,
          assigned_member_name: memberName,
          status: t.status === 'new' ? ('open' as TicketStatus) : t.status,
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
  }

  const handleUpdateStatus = (ticketId: string, newStatus: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    )
  }

  const handleUpdatePriority = (ticketId: string, newPriority: TicketPriority) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, priority: newPriority } : t))
    )
  }

  const handleAssign = (
    ticketId: string,
    teamId: number | null,
    memberId: number | null
  ) => {
    const team = MOCK_TEAMS.find((tm) => tm.id === teamId)
    const member = MOCK_MEMBERS.find((m) => m.id === memberId)

    setTickets((prev) =>
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
              assigned_by_name: 'Super Admin',
              created_at: 'Just now',
            },
          ],
        }
      })
    )
  }

  const handleAddTag = (ticketId: string, newTag: TicketTag) => {
    if (!allTags.some((t) => t.id === newTag.id)) {
      setAllTags((prev) => [...prev, newTag])
    }
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t
        const existingTags = t.tags || []
        if (existingTags.some((tag) => tag.id === newTag.id)) return t
        return {
          ...t,
          tags: [...existingTags, newTag],
        }
      })
    )
  }

  const handleRemoveTag = (ticketId: string, tagId: number) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t
        return {
          ...t,
          tags: (t.tags || []).filter((tag) => tag.id !== tagId),
        }
      })
    )
  }

  const handleDeleteTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId))
    if (selectedTicketId === ticketId) {
      const remaining = tickets.filter((t) => t.id !== ticketId)
      setSelectedTicketId(remaining[0]?.id ?? null)
    }
  }

  const handleComposerSubmit = (
    ticketId: string,
    payload: ComposerSubmitPayload
  ) => {
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

    setTickets((prev) =>
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
  }

  return (
    <div
      data-testid="tickets-queue-view"
      className="w-full h-full flex flex-col relative select-text"
    >
      <TicketCockpit.Provider
        tickets={tickets}
        selectedTicketId={selectedTicketId}
        onSelectTicket={setSelectedTicketId}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={allTags}
        currentUserId={currentUserId}
        userRole={userRole}
        onClaimTicket={handleClaimTicket}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePriority={handleUpdatePriority}
        onAssign={handleAssign}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onDeleteTicket={handleDeleteTicket}
        onComposerSubmit={handleComposerSubmit}
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

export default TicketQueueView
