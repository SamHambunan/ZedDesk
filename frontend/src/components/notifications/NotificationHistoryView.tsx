import React, { useState, use } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getApiBaseUrl } from '../../utils/url'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { ILiveClient } from '../../lib/live-client'
import {
  type NotificationFeedResponse,
  formatActivityDescription,
  formatRelativeTime,
} from './types'
import { useNotifications } from './useNotifications'

export interface NotificationHistoryViewProps {
  readonly apiUrl?: string
  readonly token?: string | null
  readonly organizationId?: number | string
  readonly liveClient?: ILiveClient
  readonly onNavigate?: (view: string) => void
  readonly className?: string
}

export const NotificationHistoryView: React.FC<NotificationHistoryViewProps> = ({
  apiUrl: propApiUrl,
  token: propToken,
  organizationId: propOrgId,
  liveClient: propLiveClient,
  onNavigate: propOnNavigate,
  className = '',
}) => {
  const shellContext = use(WorkspaceShellContext)

  const resolvedApiUrl = (propApiUrl ?? shellContext?.apiUrl ?? getApiBaseUrl(null)).replace(/\/+$/, '')
  const token = propToken ?? shellContext?.token ?? (typeof window !== 'undefined' ? localStorage.getItem('zeddesk_token') : null)
  const activeOrgId = propOrgId ?? shellContext?.organization?.id ?? 1
  const onNavigate = propOnNavigate ?? shellContext?.onNavigate
  const liveClient = propLiveClient ?? (shellContext as any)?.liveClient

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // 1. Shared notifications hook (unread count, quiet live listener, mark read mutations)
  const { unreadCount, markRead, markAllRead } = useNotifications({
    apiUrl: resolvedApiUrl,
    token,
    organizationId: activeOrgId,
    liveClient,
  })

  // 2. Paginated notifications query
  const { data: feedData, isLoading: isLoadingFeed } = useQuery<NotificationFeedResponse>({
    queryKey: ['notifications', 'history', activeOrgId, activeTab, currentPage, token],
    queryFn: async () => {
      if (!token) {
        return { current_page: 1, data: [], from: null, last_page: 1, per_page: 20, to: null, total: 0 }
      }
      try {
        const filterParam = activeTab === 'unread' ? '&filter=unread' : ''
        const res = await fetch(`${resolvedApiUrl}/api/notifications?page=${currentPage}&per_page=20${filterParam}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
        if (!res.ok) {
          return { current_page: 1, data: [], from: null, last_page: 1, per_page: 20, to: null, total: 0 }
        }
        return res.json()
      } catch {
        return { current_page: 1, data: [], from: null, last_page: 1, per_page: 20, to: null, total: 0 }
      }
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(token),
  })

  // Reset to page 1 on tab change
  const handleTabChange = (tab: 'all' | 'unread') => {
    setActiveTab(tab)
    setCurrentPage(1)
  }

  // Mark single notification as read
  const handleMarkRead = (notificationId: string) => {
    markRead(notificationId)
  }

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    markAllRead()
  }

  const items = feedData?.data ?? []
  const total = feedData?.total ?? 0
  const from = feedData?.from ?? (items.length > 0 ? (currentPage - 1) * 20 + 1 : 0)
  const to = feedData?.to ?? (items.length > 0 ? Math.min(currentPage * 20, total) : 0)
  const lastPage = feedData?.last_page ?? 1

  return (
    <div
      data-testid="notifications-history-view"
      className={`max-w-7xl mx-auto py-6 px-4 sm:px-6 flex flex-col gap-6 select-text ${className}`}
    >
      {/* Contextual screen-reader status announcement */}
      <div
        data-testid="history-live-announcement"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
      </div>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-subpanel border border-border-subtle flex items-center justify-center text-primary-container">
              <Bell className="w-4 h-4" />
            </div>
            <h1 className="text-headline-md font-headline-md font-bold text-text-primary tracking-tight">
              Notification History
            </h1>
          </div>
          <p className="text-body-default text-text-secondary text-sm">
            Review workspace alerts, track ticket activity, and manage read status.
          </p>
        </div>

        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            data-testid="history-mark-all-read-btn"
            onClick={handleMarkAllRead}
            leftIcon={<CheckCheck className="w-4 h-4 text-primary-container" />}
            className="border-primary-container/30 hover:border-primary-container/60 cursor-pointer self-start sm:self-auto"
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      {/* Filter Tabs and Count Bar */}
      <div className="flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Notification filters"
          className="flex items-center gap-1 p-1 bg-surface-subpanel rounded-lg border border-border-subtle"
        >
          <button
            type="button"
            role="tab"
            id="tab-all"
            aria-selected={activeTab === 'all'}
            aria-controls="notifications-tabpanel"
            data-testid="filter-tab-all"
            onClick={() => handleTabChange('all')}
            className={`px-3 py-1.5 rounded-md text-body-compact font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber ${
              activeTab === 'all'
                ? 'bg-surface-panel text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-container-high'
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            id="tab-unread"
            aria-selected={activeTab === 'unread'}
            aria-controls="notifications-tabpanel"
            data-testid="filter-tab-unread"
            onClick={() => handleTabChange('unread')}
            className={`px-3 py-1.5 rounded-md text-body-compact font-medium transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber ${
              activeTab === 'unread'
                ? 'bg-surface-panel text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-container-high'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 ? (
              <span className="bg-primary-container text-canvas-base text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 font-mono-data">
                {unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        <div
          data-testid="pagination-summary"
          className="text-body-compact text-text-muted text-xs font-mono-data"
        >
          {total > 0 ? `Showing ${from} to ${to} of ${total} notifications` : '0 notifications'}
        </div>
      </div>

      {/* Main Ledger Panel */}
      <div
        id="notifications-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="bg-surface-panel border border-border-subtle rounded-xl shadow-card overflow-hidden"
      >
        {isLoadingFeed ? (
          <div
            data-testid="history-loading"
            className="flex items-center justify-center py-16 text-text-muted text-body-default gap-3"
          >
            <div className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
            <span>Loading notifications...</span>
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="history-empty"
            className="flex flex-col items-center justify-center py-16 px-4 text-center"
          >
            <Filter className="w-8 h-8 text-text-muted mb-2 opacity-50" />
            <p className="text-body-default font-medium text-text-primary">No notifications found</p>
            <p className="text-body-compact text-text-muted mt-1 text-sm">
              {activeTab === 'unread' ? 'All notifications have been read.' : 'Your notification feed is empty.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-default border-collapse">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-subpanel/50 text-[11px] font-semibold text-text-muted uppercase tracking-wider font-mono">
                  <th scope="col" className="py-3 px-4 w-24">Status</th>
                  <th scope="col" className="py-3 px-4 w-28">Ticket</th>
                  <th scope="col" className="py-3 px-4">Subject</th>
                  <th scope="col" className="py-3 px-4">Activity</th>
                  <th scope="col" className="py-3 px-4 w-40">Actor</th>
                  <th scope="col" className="py-3 px-4 w-32">Time</th>
                  <th scope="col" className="py-3 px-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const isUnread = item.read_at === null
                  const isAvailable = item.is_available && item.ticket_number !== null

                  return (
                    <tr
                      key={item.id}
                      data-testid={`history-row-${item.id}`}
                      className={`hover:bg-surface-subpanel/40 transition-colors ${
                        isUnread ? 'bg-surface-subpanel/20' : ''
                      }`}
                    >
                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isUnread ? (
                          <Badge
                            variant="primary"
                            data-testid={`status-badge-unread-${item.id}`}
                            className="text-[10px] font-mono uppercase"
                          >
                            Unread
                          </Badge>
                        ) : (
                          <Badge
                            variant="neutral"
                            data-testid={`status-badge-read-${item.id}`}
                            className="text-[10px] font-mono uppercase"
                          >
                            Read
                          </Badge>
                        )}
                      </td>

                      {/* Ticket Number Deep Link */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isAvailable ? (
                          <button
                            type="button"
                            data-testid={`history-ticket-link-${item.id}`}
                            onClick={() => onNavigate?.(`tickets/${item.ticket_number}`)}
                            className="font-mono text-body-compact font-semibold text-primary-container hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber rounded px-1"
                          >
                            #{item.ticket_number}
                          </button>
                        ) : (
                          <span
                            data-testid={`history-unavailable-${item.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-sentiment-warning bg-sentiment-warning/10 px-1.5 py-0.5 rounded border border-sentiment-warning/30"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Ticket unavailable
                          </span>
                        )}
                      </td>

                      {/* Subject */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-text-primary text-body-default line-clamp-1">
                          {isAvailable ? item.subject || 'Ticket' : 'Ticket unavailable'}
                        </span>
                      </td>

                      {/* Activity */}
                      <td className="py-3 px-4 text-text-secondary text-body-compact whitespace-nowrap">
                        {formatActivityDescription(item)}
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 text-text-secondary text-body-compact whitespace-nowrap">
                        {item.actor?.name || item.actor_name || 'System'}
                      </td>

                      {/* Time */}
                      <td className="py-3 px-4 text-text-muted text-xs font-mono-data whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-text-muted" />
                          <span>{formatRelativeTime(item.time)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isUnread ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            data-testid={`history-mark-read-btn-${item.id}`}
                            onClick={() => handleMarkRead(item.id)}
                            leftIcon={<Check className="w-3.5 h-3.5 text-primary-container" />}
                            className="text-xs py-1 px-2 border-border-subtle hover:border-primary-container/40 cursor-pointer"
                          >
                            Mark read
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {lastPage > 1 ? (
          <div
            data-testid="history-pagination"
            className="flex items-center justify-between px-4 py-3 border-t border-border-subtle bg-surface-subpanel/30"
          >
            <Button
              type="button"
              variant="secondary"
              size="compact"
              data-testid="pagination-prev-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              className="cursor-pointer"
            >
              Previous
            </Button>

            <span
              data-testid="pagination-page-indicator"
              className="text-body-compact text-text-muted font-mono-data text-xs"
            >
              Page {currentPage} of {lastPage}
            </span>

            <Button
              type="button"
              variant="secondary"
              size="compact"
              data-testid="pagination-next-btn"
              disabled={currentPage >= lastPage}
              onClick={() => setCurrentPage((prev) => Math.min(lastPage, prev + 1))}
              rightIcon={<ChevronRight className="w-4 h-4" />}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default NotificationHistoryView
