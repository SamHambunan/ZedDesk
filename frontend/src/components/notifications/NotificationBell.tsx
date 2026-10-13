import React, { useState, useRef, useEffect, use } from 'react'
import { Bell, Check, CheckCheck, ExternalLink, AlertCircle, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getApiBaseUrl } from '../../utils/url'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { ILiveClient } from '../../lib/live-client'
import {
  type NotificationItem,
  type NotificationFeedResponse,
  formatActivityDescription,
  formatRelativeTime,
} from './types'
import { useNotifications } from './useNotifications'

export interface NotificationBellProps {
  readonly apiUrl?: string
  readonly token?: string | null
  readonly organizationId?: number | string
  readonly liveClient?: ILiveClient
  readonly onNavigate?: (view: string) => void
  readonly className?: string
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
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

  const [isOpen, setIsOpen] = useState(false)
  const bellButtonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // 1. Shared notifications hook (unread count, quiet live listener, mark read mutations)
  const { unreadCount, markRead, markAllRead } = useNotifications({
    apiUrl: resolvedApiUrl,
    token,
    organizationId: activeOrgId,
    liveClient,
  })

  // 2. Recent notifications query (5 newest, active when popover is open)
  const { data: recentFeed, isLoading: isLoadingRecent } = useQuery<NotificationFeedResponse>({
    queryKey: ['notifications', 'recent', activeOrgId, token],
    queryFn: async () => {
      if (!token) return { current_page: 1, data: [], from: null, last_page: 1, per_page: 5, to: null, total: 0 }
      try {
        const res = await fetch(`${resolvedApiUrl}/api/notifications?mode=recent`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
        if (!res.ok) {
          return { current_page: 1, data: [], from: null, last_page: 1, per_page: 5, to: null, total: 0 }
        }
        return res.json()
      } catch {
        return { current_page: 1, data: [], from: null, last_page: 1, per_page: 5, to: null, total: 0 }
      }
    },
    enabled: Boolean(token && isOpen),
  })

  const recentItems: NotificationItem[] = recentFeed?.data ?? []

  // 3. Handle Escape and outside click
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        bellButtonRef.current?.focus()
      }
    }

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  // Mark single notification as read
  const handleMarkRead = (notificationId: string) => {
    markRead(notificationId)
  }

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    markAllRead()
  }

  const handleOpenItem = (item: NotificationItem) => {
    if (!item.is_available || !item.ticket_number) {
      return
    }
    setIsOpen(false)
    onNavigate?.(`tickets/${item.ticket_number}`)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Contextual screen-reader status announcement */}
      <div
        data-testid="notifications-live-announcement"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
          : 'No unread notifications'}
      </div>

      {/* Bell Trigger Button */}
      <button
        ref={bellButtonRef}
        type="button"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        data-testid="notifications-bell-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative text-text-secondary hover:text-text-primary hover:bg-surface-subpanel p-2 rounded transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 ? (
          <span
            data-testid="notifications-unread-badge"
            className="absolute -top-0.5 -right-0.5 bg-primary-container text-canvas-base font-bold text-[10px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 font-mono-data leading-none"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {/* 5-item Inbox Popover */}
      {isOpen ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Recent notifications"
          data-testid="notifications-popover"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-panel border border-border-prominent rounded-lg shadow-modal z-50 flex flex-col overflow-hidden animate-in fade-in duration-100"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-subtle bg-surface-subpanel/50">
            <div className="flex items-center gap-2">
              <span className="text-label-regular font-semibold text-text-primary">Notifications</span>
              {unreadCount > 0 ? (
                <span className="bg-primary-container/20 text-primary-container border border-primary-container/40 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} unread
                </span>
              ) : null}
            </div>

            {unreadCount > 0 ? (
              <button
                type="button"
                data-testid="notifications-mark-all-read-btn"
                onClick={handleMarkAllRead}
                className="text-[11px] text-text-secondary hover:text-primary-container font-medium flex items-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber rounded px-1"
              >
                <CheckCheck className="w-3.5 h-3.5 text-primary-container" />
                <span>Mark all read</span>
              </button>
            ) : null}
          </div>

          {/* Popover Notification List (5 most recent items) */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
            {isLoadingRecent ? (
              <div
                data-testid="notifications-loading"
                className="flex items-center justify-center py-6 text-text-muted text-body-compact gap-2"
              >
                <div className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                <span>Loading notifications...</span>
              </div>
            ) : recentItems.length === 0 ? (
              <div
                data-testid="notifications-empty"
                className="py-8 px-4 text-center text-text-muted text-body-compact"
              >
                No notifications yet.
              </div>
            ) : (
              recentItems.slice(0, 5).map((item) => {
                const isUnread = item.read_at === null
                const isAvailable = item.is_available && item.ticket_number !== null

                return (
                  <div
                    key={item.id}
                    data-testid={`notification-item-${item.id}`}
                    onClick={() => handleOpenItem(item)}
                    className={`p-3 transition-colors flex flex-col gap-1.5 ${
                      isAvailable ? 'cursor-pointer hover:bg-surface-subpanel' : 'cursor-default opacity-85'
                    } ${isUnread ? 'bg-surface-subpanel/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isUnread ? (
                          <span
                            data-testid={`unread-indicator-${item.id}`}
                            className="w-2 h-2 rounded-full bg-primary-container shrink-0"
                            title="Unread"
                          />
                        ) : null}

                        {isAvailable ? (
                          <button
                            type="button"
                            data-testid={`notification-link-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenItem(item)
                            }}
                            className="text-[11px] font-mono font-semibold text-primary-container hover:underline shrink-0"
                          >
                            #{item.ticket_number}
                          </button>
                        ) : (
                          <span
                            data-testid={`notification-unavailable-${item.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-sentiment-warning bg-sentiment-warning/10 px-1.5 py-0.5 rounded border border-sentiment-warning/30 shrink-0"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Ticket unavailable
                          </span>
                        )}

                        <span className="text-body-compact font-medium text-text-primary truncate">
                          {isAvailable ? item.subject || 'Ticket' : 'Ticket unavailable'}
                        </span>
                      </div>

                      {/* Explicit Mark Read Button for unread items */}
                      {isUnread ? (
                        <button
                          type="button"
                          data-testid={`mark-read-btn-${item.id}`}
                          title="Mark read"
                          aria-label={`Mark notification ${item.id} as read`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkRead(item.id)
                          }}
                          className="text-text-muted hover:text-primary-container p-1 rounded hover:bg-surface-container-high transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-text-muted gap-2 pl-3.5">
                      <span className="truncate">{formatActivityDescription(item)}</span>
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono-data">
                        <Clock className="w-3 h-3 text-text-muted" />
                        {formatRelativeTime(item.time)}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Popover Footer: Link to full history */}
          <div className="p-2 border-t border-border-subtle bg-surface-subpanel/30">
            <button
              type="button"
              data-testid="view-all-notifications-btn"
              onClick={() => {
                setIsOpen(false)
                onNavigate?.('notifications')
              }}
              className="w-full py-1.5 px-3 rounded text-body-compact font-medium text-center text-text-secondary hover:text-text-primary hover:bg-surface-subpanel transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
            >
              <span>View full history</span>
              <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NotificationBell
