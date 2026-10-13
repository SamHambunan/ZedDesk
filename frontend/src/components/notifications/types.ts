export interface NotificationActor {
  readonly id: number
  readonly name: string
  readonly email?: string | null
  readonly type: 'customer' | 'member'
}

export interface NotificationTicketSummary {
  readonly id: string
  readonly ticket_number: number
  readonly subject: string
  readonly status: string
}

export interface NotificationItem {
  readonly id: string
  readonly organization_id: number
  readonly recipient_member_id: number
  readonly ticket_id: string
  readonly ticket_number: number | null
  readonly subject: string | null
  readonly activity: string
  readonly activity_type: string
  readonly actor: NotificationActor | null
  readonly actor_name: string | null
  readonly time: string
  readonly latest_activity_at?: string
  readonly read_at: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly ticket?: NotificationTicketSummary | null
  readonly is_available: boolean
}

export interface NotificationFeedResponse {
  readonly current_page: number
  readonly data: NotificationItem[]
  readonly from: number | null
  readonly last_page: number
  readonly per_page: number
  readonly to: number | null
  readonly total: number
}

export interface UnreadCountResponse {
  readonly unread_count: number
}

export function formatActivityDescription(item: NotificationItem): string {
  const actorName = item.actor?.name || item.actor_name
  switch (item.activity_type) {
    case 'ticket_created':
      return actorName ? `Ticket created by ${actorName}` : 'Ticket created'
    case 'customer_public_reply':
      return actorName ? `Reply from ${actorName}` : 'New customer reply'
    case 'internal_note':
      return actorName ? `Internal note by ${actorName}` : 'Internal note added'
    case 'assignment_changed':
      return actorName ? `Assignment updated by ${actorName}` : 'Assignment updated'
    case 'status_changed':
      return actorName ? `Status changed by ${actorName}` : 'Status changed'
    default:
      if (item.activity_type) {
        return item.activity_type.replace(/_/g, ' ')
      }
      return 'Activity updated'
  }
}

export function formatRelativeTime(isoString: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return ''
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (diffMs < 0) return 'Just now'
    const diffSecs = Math.floor(diffMs / 1000)
    if (diffSecs < 60) return 'Just now'
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
