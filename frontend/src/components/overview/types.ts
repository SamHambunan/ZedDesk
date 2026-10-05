export function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface OverviewTeamMember {
  readonly id: number
  readonly user_id?: number
  readonly name?: string
  readonly role?: string
  readonly user?: {
    readonly id: number
    readonly name: string
    readonly email: string
    readonly avatarUrl?: string
  } | null
}

export interface OverviewTeam {
  readonly id: number
  readonly name: string
  readonly description?: string | null
  readonly members?: readonly OverviewTeamMember[]
  readonly open_tickets_count?: number
  readonly capacity_percentage?: number
  readonly sla_target?: string
}

export interface OverviewAgent {
  readonly id: number
  readonly user_id?: number
  readonly name: string
  readonly email?: string
  readonly role?: string
  readonly teams?: readonly string[]
  readonly ticket_load?: number
  readonly status: 'active' | 'triage' | 'offline'
  readonly avatarUrl?: string
}

export interface OverviewTicket {
  readonly id: string | number
  readonly ticket_number: number
  readonly subject: string
  readonly priority: 'urgent' | 'high' | 'medium' | 'low' | string
  readonly status: string
  readonly customer?: {
    readonly id?: string | number
    readonly name: string
    readonly email: string
  } | null
  readonly assigned_team_id?: number | null
  readonly assigned_member_id?: number | null
  readonly created_at?: string
  readonly wait_time?: string
}

export interface OverviewInvitation {
  readonly id: number
  readonly email: string
  readonly role: string
  readonly token: string
  readonly expires_at?: string
  readonly created_at?: string
}

export interface WorkspaceOverviewProps {
  readonly organization?: { readonly id?: number; readonly name: string; readonly slug: string }
  readonly subdomain?: string
  readonly role?: 'admin' | 'agent' | string | null
  readonly token?: string | null
  readonly apiUrl?: string
  readonly teams?: readonly OverviewTeam[]
  readonly members?: readonly any[]
  readonly agents?: readonly OverviewAgent[]
  readonly invitations?: readonly OverviewInvitation[]
  readonly tickets?: readonly OverviewTicket[]
  readonly isLoading?: boolean
  readonly onNavigate?: (view: string) => void
  readonly onViewAllTickets?: () => void
  readonly onInviteMemberClick?: () => void
  readonly onCreateTeamClick?: () => void
  readonly onClaimTicket?: (ticketId: string | number) => Promise<void> | void
  readonly onRevokeInvitation?: (invitationId: number) => Promise<void> | void
  readonly onCopyInvitationLink?: (invitation: OverviewInvitation) => void
}
