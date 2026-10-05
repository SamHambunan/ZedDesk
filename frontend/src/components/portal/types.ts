export type PortalTicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed'
export type PortalTicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface PortalAttachment {
  readonly id: string | number
  readonly file_name: string
  readonly file_size_bytes: number
  readonly mime_type: string
  readonly url?: string
}

export interface PortalMessage {
  readonly id: string | number
  readonly ticket_id?: string | number
  readonly message_type: 'public_reply' | 'internal_note'
  readonly is_internal?: boolean
  readonly author_type?: string
  readonly author_id?: string | number
  readonly author_name?: string
  readonly author_role?: string
  readonly body: string
  readonly created_at: string
  readonly attachments?: readonly PortalAttachment[]
}

export interface PortalCustomer {
  readonly id: string | number
  readonly name: string
  readonly email: string
}

export interface PortalTicket {
  readonly id: string
  readonly ticket_number: number
  readonly subject: string
  readonly status: PortalTicketStatus
  readonly priority?: PortalTicketPriority
  readonly created_at?: string
}

export interface PortalTicketDetailResponse {
  readonly ticket: PortalTicket
  readonly customer?: PortalCustomer
  readonly messages: readonly PortalMessage[]
}

export interface PortalReplyResponse {
  readonly message: string
  readonly reply: PortalMessage
  readonly ticket: {
    readonly id: string | number
    readonly ticket_number: number
    readonly status: PortalTicketStatus
  }
}
