import React, { useState, useMemo } from 'react'
import { GitPullRequest, ArrowRight, UserCheck, AlertTriangle, Clock, Inbox } from 'lucide-react'
import { Button } from '../ui/Button'
import type { OverviewTicket } from './types'

export interface TriageQueueBridgeProps {
  readonly tickets: readonly OverviewTicket[]
  readonly avgWaitTime?: string
  readonly onClaimTicket?: (ticketId: string | number) => Promise<void> | void
  readonly onViewAllTickets?: () => void
}

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  urgent: {
    label: 'P0 Urgent',
    className: 'bg-sentiment-critical/15 text-sentiment-critical border-sentiment-critical/30',
  },
  high: {
    label: 'P1 High',
    className: 'bg-sentiment-warning/15 text-sentiment-warning border-sentiment-warning/30',
  },
  medium: {
    label: 'Medium',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  low: {
    label: 'Low',
    className: 'bg-surface-subpanel text-text-muted border-border-subtle',
  },
}

function isP0P1(priority?: string): boolean {
  const p = priority?.toLowerCase()
  return p === 'urgent' || p === 'high' || p === 'p0' || p === 'p1'
}

export const TriageQueueBridge: React.FC<TriageQueueBridgeProps> = ({
  tickets,
  avgWaitTime,
  onClaimTicket,
  onViewAllTickets,
}) => {
  const [claimingId, setClaimingId] = useState<string | number | null>(null)

  const unassignedTickets = tickets.filter((t) => !t.assigned_member_id)
  const unassignedCount = unassignedTickets.length
  const p0p1Count = tickets.filter((t) => isP0P1(t.priority)).length

  const calculatedAvgWaitTime = useMemo(() => {
    if (avgWaitTime) return avgWaitTime
    const ticketsWithTime = tickets.filter((t) => t.created_at)
    if (ticketsWithTime.length === 0) return '14m avg wait'
    const now = Date.now()
    const totalMinutes = ticketsWithTime.reduce((acc, t) => {
      const created = new Date(t.created_at!).getTime()
      if (isNaN(created)) return acc + 14
      const diffMinutes = Math.max(1, Math.round((now - created) / (1000 * 60)))
      return acc + diffMinutes
    }, 0)
    const avg = Math.round(totalMinutes / ticketsWithTime.length)
    return `${avg}m avg wait`
  }, [avgWaitTime, tickets])

  // Preview unassigned tickets or first 4 tickets
  const previewTickets = unassignedTickets.length > 0 ? unassignedTickets.slice(0, 4) : tickets.slice(0, 4)

  const handleClaim = async (ticketId: string | number) => {
    setClaimingId(ticketId)
    try {
      await onClaimTicket?.(ticketId)
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div
      data-testid="stage2-triage-queue-bridge"
      className="bg-surface-subpanel/80 border border-border-subtle rounded-xl p-5 shadow-sm space-y-4"
    >
      {/* Header and Direct Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <GitPullRequest className="w-4 h-4 text-[#F59E0B]" />
          <h2 className="text-headline-sm font-semibold text-text-primary">
            Stage 2 Triage Queue Bridge
          </h2>
        </div>

        <button
          type="button"
          data-testid="view-all-tickets-link"
          onClick={onViewAllTickets}
          className="text-xs font-label-regular text-accent-glow hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] rounded px-1"
        >
          <span>View Full Triage Queue</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Triage Counters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface-panel/80 border border-border-subtle rounded-lg p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-text-secondary shrink-0">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <div
              data-testid="counter-unassigned"
              className="text-headline-sm font-semibold text-text-primary tabular-nums font-mono-data"
            >
              {unassignedCount}
            </div>
            <div className="text-[11px] text-text-muted">Unassigned Items</div>
          </div>
        </div>

        <div className="bg-surface-panel/80 border border-border-subtle rounded-lg p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sentiment-critical/10 flex items-center justify-center text-sentiment-critical shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div
              data-testid="counter-p0p1"
              className="text-headline-sm font-semibold text-text-primary tabular-nums font-mono-data"
            >
              {p0p1Count}
            </div>
            <div className="text-[11px] text-text-muted">P0/P1 Critical</div>
          </div>
        </div>

        <div className="bg-surface-panel/80 border border-border-subtle rounded-lg p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sentiment-positive/10 flex items-center justify-center text-sentiment-positive shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div
              data-testid="counter-avg-wait"
              className="text-headline-sm font-semibold text-text-primary tabular-nums font-mono-data"
            >
              {calculatedAvgWaitTime}
            </div>
            <div className="text-[11px] text-text-muted">Queue Response SLA</div>
          </div>
        </div>
      </div>

      {/* Ticket Preview Rows */}
      <div className="space-y-2.5 pt-1">
        {previewTickets.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-xs font-mono-data border border-dashed border-border-subtle rounded-lg">
            No incoming tickets awaiting triage. Queue clear.
          </div>
        ) : (
          previewTickets.map((ticket) => {
            const priorityInfo = PRIORITY_BADGES[ticket.priority.toLowerCase()] || PRIORITY_BADGES.medium
            const isClaiming = claimingId === ticket.id

            return (
              <div
                key={ticket.id}
                data-testid={`preview-ticket-${ticket.id}`}
                className="bg-surface-panel/60 border border-border-subtle/80 hover:border-border-prominent rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="font-mono-data text-xs text-text-muted shrink-0 pt-0.5">
                    #{ticket.ticket_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-default font-medium text-text-primary truncate">
                      {ticket.subject}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted font-mono-data">
                      {ticket.customer && (
                        <span>{ticket.customer.name}</span>
                      )}
                      <span>•</span>
                      <span>{ticket.wait_time || '12m wait'}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono-data px-2 py-0.5 rounded border shrink-0 ${priorityInfo.className}`}
                  >
                    {priorityInfo.label}
                  </span>
                </div>

                <div className="flex items-center shrink-0 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    data-testid={`claim-button-${ticket.id}`}
                    disabled={isClaiming}
                    onClick={() => handleClaim(ticket.id)}
                    leftIcon={<UserCheck className="w-3.5 h-3.5 text-accent-glow" />}
                  >
                    {isClaiming ? 'Routing...' : 'Claim & Route'}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
