import React from 'react'
import {
  Inbox,
  UserCheck,
  Users2,
  FolderArchive,
  Filter,
} from 'lucide-react'
import type { PresetFilter } from './types'

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

export function getPriorityBadge(priority: string): { label: string; class: string } {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return { label: 'P0 Urgent', class: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    case 'high':
      return { label: 'P1 High', class: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30' }
    case 'medium':
      return { label: 'Medium', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    default:
      return { label: 'Low', class: 'bg-[#16181D] text-[#8C90A0] border-[#282A33]' }
  }
}

export function getStatusBadge(status: string): { label: string; class: string } {
  switch (status.toLowerCase()) {
    case 'new':
      return { label: 'new', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    case 'open':
      return { label: 'open', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    case 'pending':
      return { label: 'pending', class: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30' }
    case 'resolved':
      return { label: 'resolved', class: 'bg-[#16181D] text-[#8C90A0] border-[#282A33]' }
    case 'closed':
      return { label: 'closed', class: 'bg-[#16181D] text-[#8C90A0] border-[#282A33]' }
    default:
      return { label: status, class: 'bg-[#16181D] text-[#8C90A0] border-[#282A33]' }
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
