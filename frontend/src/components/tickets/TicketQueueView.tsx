import React, { useEffect, useState } from 'react'

export interface TicketCustomer {
  readonly id: string
  readonly name: string
  readonly email: string
}

export interface TicketItem {
  readonly id: string
  readonly organization_id: number
  readonly ticket_number: number
  readonly subject: string
  readonly status: string
  readonly priority: string
  readonly customer?: TicketCustomer | null
  readonly assigned_team_id?: number | null
  readonly assigned_member_id?: number | null
  readonly created_at?: string
  readonly updated_at?: string
}

export interface TicketQueueViewProps {
  readonly apiUrl: string
  readonly token: string | null
}

export const TicketQueueView: React.FC<TicketQueueViewProps> = ({ apiUrl, token }) => {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchTickets = async () => {
    if (!token) return
    setIsLoading(true)
    setError(null)

    try {
      const url = statusFilter !== 'all' ? `${apiUrl}/api/tickets?status=${statusFilter}` : `${apiUrl}/api/tickets`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.message || 'Failed to fetch tickets.')
        return
      }

      setTickets(data.data || [])
    } catch {
      setError('Network error loading tickets.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [apiUrl, token, statusFilter])

  const STATUS_BADGE_CLASSES: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    open: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    resolved: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }

  const PRIORITY_BADGE_CLASSES: Record<string, string> = {
    urgent: 'text-red-400 font-semibold',
    high: 'text-amber-400 font-medium',
    medium: 'text-blue-400',
    low: 'text-text-muted',
  }

  const getStatusBadgeClass = (status: string) =>
    STATUS_BADGE_CLASSES[status.toLowerCase()] ?? 'bg-surface-subpanel text-text-muted border-border-subtle'

  const getPriorityBadgeClass = (priority: string) =>
    PRIORITY_BADGE_CLASSES[priority.toLowerCase()] ?? 'text-text-secondary'

  return (
    <div className="space-y-6" data-testid="tickets-queue-view">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-headline-md font-headline-md text-text-primary">Tickets Queue</h2>
          <p className="text-body-sm text-text-secondary">
            Manage, triage, and collaborate on customer inquiries across your organization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-label-sm text-text-muted">
            Status:
          </label>
          <select
            id="status-filter"
            data-testid="ticket-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 bg-surface-panel border border-border-subtle rounded-lg text-body-sm text-text-primary focus:outline-none focus:border-accent-indigo-glow"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <button
            type="button"
            data-testid="refresh-tickets-btn"
            onClick={fetchTickets}
            className="h-9 px-3 bg-surface-subpanel hover:bg-surface-canvas border border-border-subtle rounded-lg text-body-sm text-text-secondary transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          data-testid="tickets-error"
          className="p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-sentiment-negative text-body-sm"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div data-testid="tickets-loading" className="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
          <div className="w-8 h-8 border-2 border-accent-indigo-glow border-t-transparent rounded-full animate-spin" />
          <span className="text-body-sm">Loading tickets queue...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div
          data-testid="tickets-empty"
          className="py-12 text-center bg-surface-panel border border-border-subtle rounded-xl p-8"
        >
          <h3 className="text-headline-sm text-text-primary mb-1">No Tickets Found</h3>
          <p className="text-body-sm text-text-muted">
            {statusFilter !== 'all' ? `No tickets found with status "${statusFilter}".` : 'There are no active tickets in this organization.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-panel border border-border-subtle rounded-xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="tickets-table">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-subpanel text-label-sm font-semibold text-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Number</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    data-testid={`ticket-row-${ticket.id}`}
                    className="hover:bg-surface-subpanel/50 transition-colors"
                  >
                    <td className="py-3.5 px-4 text-body-sm font-mono text-text-muted">
                      <span data-testid={`ticket-number-${ticket.id}`}>#{ticket.ticket_number}</span>
                    </td>
                    <td className="py-3.5 px-4 text-body-sm font-medium text-text-primary">
                      <span data-testid={`ticket-subject-${ticket.id}`}>{ticket.subject}</span>
                    </td>
                    <td className="py-3.5 px-4 text-body-sm text-text-secondary">
                      <span data-testid={`ticket-customer-${ticket.id}`}>
                        {ticket.customer?.name || ticket.customer?.email || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-body-sm">
                      <span
                        data-testid={`ticket-priority-${ticket.id}`}
                        className={`uppercase text-xs tracking-wider ${getPriorityBadgeClass(ticket.priority)}`}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-body-sm">
                      <span
                        data-testid={`ticket-status-${ticket.id}`}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wider ${getStatusBadgeClass(ticket.status)}`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
