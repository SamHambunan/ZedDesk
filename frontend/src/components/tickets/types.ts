export type TicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed'
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low'
export type MessageType = 'public_reply' | 'internal_note'
export type PresetFilter = 'all_open' | 'my_tickets' | 'unassigned' | 'team_queue' | 'resolved_closed'

export interface TicketCustomer {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly tier?: string
  readonly total_inquiries?: number
  readonly company?: string
}

export interface TicketTag {
  readonly id: number | string
  readonly name: string
  readonly slug: string
  readonly color?: string
}

export interface TicketAttachment {
  readonly id: string
  readonly file_name: string
  readonly file_size_bytes: number
  readonly mime_type: string
  readonly url?: string
}

export interface TicketMessage {
  readonly id: string
  readonly ticket_id: string
  readonly message_type: MessageType
  readonly author_type: 'Customer' | 'OrganizationMember'
  readonly author_name: string
  readonly author_email?: string
  readonly author_role?: string
  readonly body: string
  readonly attachments: readonly TicketAttachment[]
  readonly created_at: string
}

export interface TicketAssignmentAudit {
  readonly id: string | number
  readonly ticket_id: string
  readonly team_id: number | null
  readonly team_name?: string | null
  readonly member_id: number | null
  readonly member_name?: string | null
  readonly assigned_by_name: string
  readonly created_at: string
  readonly note?: string
}

export interface TicketItem {
  readonly id: string
  readonly organization_id: number
  readonly ticket_number: number
  readonly subject: string
  readonly status: TicketStatus
  readonly priority: TicketPriority
  readonly customer?: TicketCustomer | null
  readonly assigned_team_id?: number | null
  readonly assigned_team_name?: string | null
  readonly assigned_member_id?: number | null
  readonly assigned_member_name?: string | null
  readonly tags?: readonly TicketTag[]
  readonly messages?: readonly TicketMessage[]
  readonly assignments?: readonly TicketAssignmentAudit[]
  readonly created_at?: string
  readonly updated_at?: string
}

export interface OrgTeamOption {
  readonly id: number
  readonly name: string
  readonly memberIds: readonly number[]
}

export interface OrgMemberOption {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly role: 'admin' | 'agent'
  readonly teamIds: readonly number[]
}
