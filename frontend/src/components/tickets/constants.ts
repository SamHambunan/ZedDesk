import React from 'react'
import {
  Inbox,
  UserCheck,
  Users2,
  FolderArchive,
  Filter,
} from 'lucide-react'
import type {
  PresetFilter,
  TicketAssignmentAudit,
  TicketItem,
  TicketMessage,
  TicketPriority,
  TicketStatus,
} from './types'

export const PRESET_DEFINITIONS: readonly {
  readonly id: PresetFilter
  readonly label: string
  readonly icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'all_open', label: 'All Open', icon: Inbox },
  { id: 'my_tickets', label: 'My Tickets', icon: UserCheck },
  { id: 'unassigned', label: 'Unassigned', icon: Filter },
  { id: 'team_queue', label: 'Team Queue', icon: Users2 },
  { id: 'resolved_closed', label: 'Resolved & Closed', icon: FolderArchive },
]

export function parseTicketNumberFromPath(path?: string): number | null {
  if (!path) return null
  const match = path.match(/\/tickets\/(\d+)/)
  return match ? Number(match[1]) : null
}

export function matchesPreset(
  ticket: { status: string; assigned_member_id?: number | null; assigned_team_id?: number | null },
  preset: PresetFilter,
  currentUserId?: number
): boolean {
  switch (preset) {
    case 'all_open':
      return ['new', 'open', 'pending'].includes(ticket.status)
    case 'my_tickets':
      return Boolean(currentUserId && ticket.assigned_member_id === currentUserId)
    case 'unassigned':
      return !ticket.assigned_member_id
    case 'team_queue':
      return Boolean(ticket.assigned_team_id)
    case 'resolved_closed':
      return ['resolved', 'closed'].includes(ticket.status)
  }
}

export function getPresetQueryParams(preset: PresetFilter): Record<string, string> {
  switch (preset) {
    case 'all_open':
      return { status: 'new,open,pending' }
    case 'my_tickets':
      return { assigned_to: 'me' }
    case 'unassigned':
      return { unassigned: 'true' }
    case 'team_queue':
      return { team_queue: 'true' }
    case 'resolved_closed':
      return { status: 'resolved,closed' }
  }
}

export function getPriorityBadge(priority: string): { label: string; class: string } {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return { label: 'P0 Urgent', class: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    case 'high':
      return { label: 'P1 High', class: 'bg-amber-action/15 text-amber-action border-amber-action/30' }
    case 'medium':
      return { label: 'Medium', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    default:
      return { label: 'Low', class: 'bg-surface-container text-text-muted border-border-subtle' }
  }
}

export function getStatusBadge(status: string): { label: string; class: string } {
  switch (status.toLowerCase()) {
    case 'new':
      return { label: 'new', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    case 'open':
      return { label: 'open', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    case 'pending':
      return { label: 'pending', class: 'bg-amber-action/15 text-amber-action border-amber-action/30' }
    case 'resolved':
      return { label: 'resolved', class: 'bg-surface-container text-text-muted border-border-subtle' }
    case 'closed':
      return { label: 'closed', class: 'bg-surface-container text-text-muted border-border-subtle' }
    default:
      return { label: status, class: 'bg-surface-container text-text-muted border-border-subtle' }
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime()
    const diffMins = Math.max(1, Math.round(diffMs / (60 * 1000)))
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.round(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.round(diffHours / 24)
    return `${diffDays}d ago`
  } catch {
    return 'recently'
  }
}

export function normalizeTicketMessage(m: any, defaultTicketId: string): TicketMessage {
  return {
    id: String(m.id),
    ticket_id: String(m.ticket_id || defaultTicketId),
    message_type: m.message_type,
    author_type: (m.author_type && m.author_type.includes('Customer')) ? 'Customer' : 'OrganizationMember',
    author_name: m.author_name || m.author?.user?.name || m.author?.name || ((m.author_type && m.author_type.includes('Customer')) ? 'Customer' : 'Staff'),
    author_role: m.author_role || m.author?.role || ((m.author_type && m.author_type.includes('Customer')) ? undefined : 'Staff'),
    body: m.body || '',
    attachments: (m.attachments || []).map((att: any) => ({
      id: String(att.id),
      file_name: att.file_name || att.name || 'attachment',
      file_size_bytes: att.file_size_bytes ?? att.size ?? 0,
      mime_type: att.mime_type || 'application/octet-stream',
      url: att.url || `/api/attachments/${att.id}/download`,
    })),
    created_at: m.created_at || new Date().toISOString(),
  }
}

export function normalizeTicketAssignments(rawList?: readonly any[] | null): TicketAssignmentAudit[] {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map((raw) => {
    const memberName =
      raw.member_name ||
      raw.member?.user?.name ||
      raw.member?.name ||
      null
    const teamName =
      raw.team_name ||
      raw.team?.name ||
      null
    const assignedByName =
      raw.assigned_by_name ||
      raw.assigned_by?.user?.name ||
      raw.assigned_by?.name ||
      'System'

    return {
      id: raw.id,
      ticket_id: String(raw.ticket_id),
      team_id: raw.team_id ?? raw.team?.id ?? null,
      team_name: teamName,
      member_id: raw.member_id ?? raw.member?.id ?? null,
      member_name: memberName,
      assigned_by_name: assignedByName,
      created_at: raw.created_at || new Date().toISOString(),
      note: raw.note ?? undefined,
    }
  })
}

export function formatAssignmentAuditTitle(asg: TicketAssignmentAudit): string {
  if (asg.note) return asg.note
  if (asg.member_name && asg.team_name) {
    return `Assigned to ${asg.member_name} (${asg.team_name})`
  }
  if (asg.member_name) {
    return `Assigned to ${asg.member_name}`
  }
  if (asg.team_name) {
    return `Assigned to ${asg.team_name}`
  }
  return 'Unassigned'
}

export function formatAuditTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function normalizeTicketItem(rawTicket: any): TicketItem {
  return {
    id: String(rawTicket.id),
    organization_id: rawTicket.organization_id ?? 1,
    ticket_number: rawTicket.ticket_number ?? 1001,
    subject: rawTicket.subject || 'Support Inquiry',
    status: (rawTicket.status as TicketStatus) || 'new',
    priority: (rawTicket.priority as TicketPriority) || 'medium',
    revision: rawTicket.revision ?? 1,
    status_revision: rawTicket.status_revision,
    priority_revision: rawTicket.priority_revision,
    assignment_revision: rawTicket.assignment_revision,
    customer: rawTicket.customer || {
      id: 'cust-unknown',
      name: 'External Requester',
      email: 'requester@example.com',
    },
    assigned_team_id: rawTicket.assigned_team_id ?? null,
    assigned_team_name: rawTicket.assigned_team?.name ?? rawTicket.assigned_team_name ?? null,
    assigned_member_id: rawTicket.assigned_member_id ?? null,
    assigned_member_name: rawTicket.assigned_member?.user?.name ?? rawTicket.assigned_member_name ?? null,
    tags: rawTicket.tags || [],
    messages: rawTicket.messages || [],
    assignments: normalizeTicketAssignments(rawTicket.assignments || rawTicket.ticket_assignments),
    created_at: rawTicket.created_at,
    updated_at: rawTicket.updated_at,
  }
}

