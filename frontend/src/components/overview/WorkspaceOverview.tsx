import React, { useState, useMemo, useContext } from 'react'
import {
  QueryClientContext,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import apiClient, { getAuthToken } from '../../lib/api-client'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import { ContextRibbon } from './ContextRibbon'
import { TeamCapacityLanes } from './TeamCapacityLanes'
import { TriageQueueBridge } from './TriageQueueBridge'
import { GuidedCommandDeck } from './GuidedCommandDeck'
import { ShiftRoster } from './ShiftRoster'
import { PendingInvitationsLedger } from './PendingInvitationsLedger'
import { QuickDispatchShortcuts } from './QuickDispatchShortcuts'
import { CreateTeamModal } from '../teams/CreateTeamModal'
import { InviteMemberModal } from '../members/InviteMemberModal'
import { Toast } from '../ui/Toast'
import type {
  WorkspaceOverviewProps,
  OverviewTeam,
  OverviewAgent,
  OverviewTicket,
  OverviewInvitation,
} from './types'

const WorkspaceOverviewInner: React.FC<WorkspaceOverviewProps> = (props) => {
  const shellContext = useContext(WorkspaceShellContext)
  const queryClient = useQueryClient()

  const effectiveOrg = props.organization ?? shellContext?.organization ?? {
    id: 1,
    name: 'Organization',
    slug: 'org',
  }
  const effectiveSubdomain = props.subdomain ?? shellContext?.subdomain ?? effectiveOrg.slug ?? ''
  const effectiveRole = props.role ?? shellContext?.role ?? 'agent'
  const effectiveToken = props.token ?? shellContext?.token ?? getAuthToken()
  const effectiveApiUrl = props.apiUrl ?? shellContext?.apiUrl ?? ''
  const isAdmin = effectiveRole === 'admin'

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Local Modal States
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false)
  const [createTeamError, setCreateTeamError] = useState<string | null>(null)

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Optimistic tracking for claimed tickets to immediately decrement unassigned counters
  const [claimedTicketIds, setClaimedTicketIds] = useState<(string | number)[]>([])

  const getRequestConfig = () => {
    return effectiveToken ? { headers: { Authorization: `Bearer ${effectiveToken}` } } : {}
  }
  const buildUrl = (path: string) => {
    return effectiveApiUrl ? `${effectiveApiUrl}${path}` : path
  }

  // TanStack Query for Teams
  const { data: fetchedTeams = [] } = useQuery<OverviewTeam[]>({
    queryKey: ['teams', effectiveOrg.id],
    queryFn: async () => {
      const res = await apiClient.get(buildUrl('/api/teams'), getRequestConfig())
      const list = res.data?.teams || []
      return list.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        members: t.members || [],
        open_tickets_count: t.open_tickets_count ?? (t.tickets?.length || 0),
        capacity_percentage:
          t.capacity_percentage ??
          Math.min(100, Math.round(((t.tickets?.length || 2) / Math.max(1, (t.members?.length || 1) * 5)) * 100)),
        sla_target: t.sla_target ?? '99.4% SLA',
      }))
    },
    enabled: props.teams === undefined && Boolean(effectiveToken),
  })

  // TanStack Query for Members
  const { data: fetchedMembers = [] } = useQuery<any[]>({
    queryKey: ['members', effectiveOrg.id],
    queryFn: async () => {
      const res = await apiClient.get(buildUrl('/api/members'), getRequestConfig())
      return res.data?.members || []
    },
    enabled: props.members === undefined && Boolean(effectiveToken),
  })

  // TanStack Query for Invitations
  const { data: fetchedInvitations = [] } = useQuery<OverviewInvitation[]>({
    queryKey: ['invitations', effectiveOrg.id],
    queryFn: async () => {
      const res = await apiClient.get(buildUrl('/api/invitations'), getRequestConfig())
      return res.data?.invitations || []
    },
    enabled: props.invitations === undefined && isAdmin && Boolean(effectiveToken),
  })

  // TanStack Query for Tickets
  const { data: fetchedTickets = [] } = useQuery<OverviewTicket[]>({
    queryKey: ['tickets', effectiveOrg.id],
    queryFn: async () => {
      const res = await apiClient.get(buildUrl('/api/tickets'), getRequestConfig())
      const list = res.data?.data || res.data?.tickets || []
      return list.map((t: any) => ({
        id: t.id,
        ticket_number: t.ticket_number,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        customer: t.customer,
        assigned_team_id: t.assigned_team_id,
        assigned_member_id: t.assigned_member_id,
        created_at: t.created_at,
        wait_time: '14m wait',
      }))
    },
    enabled: props.tickets === undefined && Boolean(effectiveToken),
  })

  // TanStack Query Mutations
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiClient.post(buildUrl('/api/teams'), data, getRequestConfig())
      return res.data
    },
    onSuccess: (_, variables) => {
      setIsCreateTeamOpen(false)
      setToastMessage(`Team "${variables.name}" created successfully.`)
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
    onError: (err: any) => {
      setCreateTeamError(err?.response?.data?.message || 'Failed to create team.')
    },
  })

  const inviteMemberMutation = useMutation({
    mutationFn: async (data: { email: string; role: 'agent' | 'admin' }) => {
      const res = await apiClient.post(buildUrl('/api/invitations'), data, getRequestConfig())
      return res.data
    },
    onSuccess: (_, variables) => {
      setIsInviteModalOpen(false)
      setToastMessage(`Invitation dispatched to ${variables.email}.`)
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (err: any) => {
      setInviteError(err?.response?.data?.message || 'Failed to send invitation.')
    },
  })

  const claimTicketMutation = useMutation({
    mutationFn: async (ticketId: string | number) => {
      const res = await apiClient.post(buildUrl(`/api/tickets/${ticketId}/claim`), {}, getRequestConfig())
      return res.data
    },
    onSuccess: (data, ticketId) => {
      const ticketNum = data?.data?.ticket_number ?? ticketId
      setToastMessage(`Ticket #${ticketNum} claimed and routed to your queue.`)
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      const res = await apiClient.delete(buildUrl(`/api/invitations/${invitationId}`), getRequestConfig())
      return res.data
    },
    onSuccess: () => {
      setToastMessage('Invitation revoked.')
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
  })

  // Resolve Effective Entities
  const effectiveTeams: readonly OverviewTeam[] = props.teams ?? fetchedTeams
  const effectiveMembers = props.members ?? fetchedMembers
  const effectiveInvitations: readonly OverviewInvitation[] = props.invitations ?? fetchedInvitations
  const effectiveRawTickets: readonly OverviewTicket[] = props.tickets ?? fetchedTickets

  const effectiveTickets: readonly OverviewTicket[] = useMemo(() => {
    if (claimedTicketIds.length === 0) return effectiveRawTickets
    return effectiveRawTickets.map((t) => {
      if (claimedTicketIds.includes(t.id) || claimedTicketIds.includes(t.ticket_number)) {
        return {
          ...t,
          assigned_member_id: shellContext?.user?.id ?? 1,
        }
      }
      return t
    })
  }, [effectiveRawTickets, claimedTicketIds, shellContext?.user?.id])

  // Derived Agents for On-Duty Shift Roster if not explicitly passed
  const effectiveAgents: readonly OverviewAgent[] = useMemo(() => {
    if (props.agents && props.agents.length > 0) {
      return props.agents
    }
    if (effectiveMembers.length > 0) {
      return effectiveMembers.map((m: any, idx: number) => {
        const memberTeams = effectiveTeams
          .filter((t) => t.members?.some((tm: any) => tm.user_id === m.user_id || tm.id === m.id))
          .map((t) => t.name)
        const assignedTicketsCount = effectiveTickets.filter(
          (t) => t.assigned_member_id === m.id || t.assigned_member_id === m.user_id
        ).length

        return {
          id: m.id,
          user_id: m.user_id,
          name: m.user?.name || m.name || `Agent ${idx + 1}`,
          email: m.user?.email || m.email,
          role: m.role || 'agent',
          teams: memberTeams.length > 0 ? memberTeams : ['General Queue'],
          ticket_load: assignedTicketsCount,
          status: idx % 3 === 1 ? ('triage' as const) : ('active' as const),
        }
      })
    }
    return []
  }, [props.agents, effectiveMembers, effectiveTeams, effectiveTickets])

  const lanesCount = effectiveTeams.length
  const membersCount = effectiveMembers.length || effectiveAgents.length
  const agentsOnDutyCount = useMemo(() => {
    if (effectiveAgents.length > 0) {
      return effectiveAgents.filter((a) => a.status === 'active' || a.status === 'triage').length
    }
    return 0
  }, [effectiveAgents])

  // 0-state transition condition: teams === 0 or members <= 1
  const isZeroState = effectiveTeams.length === 0 || membersCount <= 1

  // Navigation Helper
  const handleNavigate = (view: string) => {
    if (props.onNavigate) {
      props.onNavigate(view)
    } else if (shellContext?.onNavigate) {
      shellContext.onNavigate(view)
    } else if (typeof window !== 'undefined') {
      window.location.href = `/${view}`
    }
  }

  // Create Team Trigger
  const handleCreateTeamClick = () => {
    if (props.onCreateTeamClick) {
      props.onCreateTeamClick()
    } else {
      setIsCreateTeamOpen(true)
    }
  }

  // Invite Member Trigger
  const handleInviteMemberClick = () => {
    if (props.onInviteMemberClick) {
      props.onInviteMemberClick()
    } else {
      setIsInviteModalOpen(true)
    }
  }

  // Handle Team Creation Submit
  const handleCreateTeamSubmit = async (data: { name: string; description?: string }) => {
    setCreateTeamError(null)
    try {
      await createTeamMutation.mutateAsync(data)
    } catch {
      // Error handled in onError
    }
  }

  // Handle Invite Submit
  const handleSendInviteSubmit = async (email: string, role: 'agent' | 'admin') => {
    setInviteError(null)
    try {
      await inviteMemberMutation.mutateAsync({ email, role })
    } catch {
      // Error handled in onError
    }
  }

  // Handle Claim Ticket
  const handleClaimTicket = async (ticketId: string | number) => {
    const ticket = effectiveRawTickets.find((t) => t.id === ticketId || t.ticket_number === ticketId)
    const ticketNum = ticket?.ticket_number ?? ticketId

    if (props.onClaimTicket) {
      await props.onClaimTicket(ticketId)
      setClaimedTicketIds((prev) => (prev.includes(ticketId) ? prev : [...prev, ticketId]))
      handleNavigate(`tickets/${ticketNum}`)
      return
    }
    try {
      const res = await claimTicketMutation.mutateAsync(ticketId)
      setClaimedTicketIds((prev) => (prev.includes(ticketId) ? prev : [...prev, ticketId]))
      const finalTicketNum = res?.data?.ticket_number ?? ticketNum
      handleNavigate(`tickets/${finalTicketNum}`)
    } catch {
      // Silently handled
    }
  }

  // Handle Revoke Invitation
  const handleRevokeInvitation = async (invitationId: number) => {
    if (props.onRevokeInvitation) {
      await props.onRevokeInvitation(invitationId)
      return
    }
    try {
      await revokeInvitationMutation.mutateAsync(invitationId)
    } catch {
      // Silently handled
    }
  }

  return (
    <div
      data-testid="workspace-overview"
      className="max-w-[1600px] mx-auto space-y-6 relative z-10 w-full"
    >
      {/* Bilateral 65/35 Split-Pane Console */}
      <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
        {/* Left 65% Operations Ledger */}
        <section
          data-testid="operations-ledger-65"
          aria-label="Operations Ledger"
          className="w-full lg:w-[65%] flex flex-col gap-6"
        >
          <ContextRibbon
            organizationName={effectiveOrg.name}
            subdomain={effectiveSubdomain}
            lanesCount={lanesCount}
            agentsOnDutyCount={agentsOnDutyCount}
            isAdmin={isAdmin}
            onInviteMemberClick={handleInviteMemberClick}
          />

          {isZeroState ? (
            <GuidedCommandDeck
              teamsCount={lanesCount}
              membersCount={membersCount}
              ticketsCount={effectiveTickets.length}
              onCreateTeamClick={handleCreateTeamClick}
              onInviteMemberClick={handleInviteMemberClick}
              onVerifyIntakeClick={() => handleNavigate('portal')}
            />
          ) : (
            <TeamCapacityLanes
              teams={effectiveTeams}
              onTeamClick={(teamId) => handleNavigate(`teams?team=${teamId}`)}
            />
          )}

          <TriageQueueBridge
            tickets={effectiveTickets}
            onClaimTicket={handleClaimTicket}
            onViewAllTickets={() => {
              if (props.onViewAllTickets) {
                props.onViewAllTickets()
              } else {
                handleNavigate('tickets?preset=unassigned')
              }
            }}
          />
        </section>

        {/* Right 35% Action & Dispatch Ledger */}
        <section
          data-testid="action-dispatch-ledger-35"
          aria-label="Action and Dispatch Ledger"
          className="w-full lg:w-[35%] flex flex-col gap-6 shrink-0"
        >
          <ShiftRoster agents={effectiveAgents} />

          <PendingInvitationsLedger
            invitations={effectiveInvitations}
            subdomain={effectiveSubdomain}
            onRevokeInvitation={handleRevokeInvitation}
            onIssueNewInvitation={handleInviteMemberClick}
            onCopySuccess={(msg) => setToastMessage(msg)}
          />

          <QuickDispatchShortcuts
            onNavigate={(route) => handleNavigate(route)}
          />
        </section>
      </div>

      {/* Tactile 2-Second Notification Toast */}
      <Toast
        open={Boolean(toastMessage)}
        message={toastMessage || ''}
        duration={2000}
        onClose={() => setToastMessage(null)}
      />

      {/* Embedded Create Team Modal for 0-State Pipeline */}
      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        onSubmit={handleCreateTeamSubmit}
        isSubmitting={createTeamMutation.isPending}
        error={createTeamError}
      />

      {/* Embedded Invite Member Modal for 0-State Pipeline */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={handleSendInviteSubmit}
        isSubmitting={inviteMemberMutation.isPending}
        error={inviteError}
      />
    </div>
  )
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = (props) => {
  const existingClient = useContext(QueryClientContext)
  if (!existingClient) {
    return (
      <QueryClientProvider client={defaultQueryClient}>
        <WorkspaceOverviewInner {...props} />
      </QueryClientProvider>
    )
  }
  return <WorkspaceOverviewInner {...props} />
}

WorkspaceOverview.displayName = 'WorkspaceOverview'

export default WorkspaceOverview
