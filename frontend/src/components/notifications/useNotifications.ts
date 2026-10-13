import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ILiveClient } from '../../lib/live-client'
import type { UnreadCountResponse, NotificationFeedResponse } from './types'

export interface UseNotificationsOptions {
  readonly apiUrl: string
  readonly token?: string | null
  readonly organizationId?: number | string
  readonly liveClient?: ILiveClient
}

export interface UseNotificationsReturn {
  readonly unreadCount: number
  readonly markRead: (notificationId: string) => Promise<void>
  readonly markAllRead: () => Promise<void>
  readonly resolvedApiUrl: string
  readonly token: string | null
  readonly activeOrgId: number | string
}

export function useNotifications({
  apiUrl,
  token,
  organizationId,
  liveClient,
}: UseNotificationsOptions): UseNotificationsReturn {
  const queryClient = useQueryClient()
  const resolvedApiUrl = apiUrl.replace(/\/+$/, '')
  const activeOrgId = organizationId ?? 1
  const authToken = token ?? null

  // 1. Unread count query
  const { data: unreadData } = useQuery<UnreadCountResponse>({
    queryKey: ['notifications', 'unread-count', activeOrgId, authToken],
    queryFn: async () => {
      if (!authToken) return { unread_count: 0 }
      try {
        const res = await fetch(`${resolvedApiUrl}/api/notifications/unread-count`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: 'application/json',
          },
        })
        if (!res.ok) return { unread_count: 0 }
        return res.json()
      } catch {
        return { unread_count: 0 }
      }
    },
    enabled: Boolean(authToken),
  })

  const unreadCount = unreadData?.unread_count ?? 0

  // 2. Quiet live signal listener (inbox.changed) without routine toasts or cross-org leakage
  useEffect(() => {
    if (!liveClient?.subscribeToNotifications) return

    const unsubscribe = liveClient.subscribeToNotifications((signal) => {
      if (Number(signal.organization_id) !== Number(activeOrgId)) {
        return
      }

      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })

    return () => {
      unsubscribe()
    }
  }, [liveClient, activeOrgId, queryClient])

  // 3. Mark single notification as read
  const markRead = async (notificationId: string) => {
    if (!authToken) return

    const nowIso = new Date().toISOString()

    // Optimistically update recent query
    queryClient.setQueriesData<NotificationFeedResponse>(
      { queryKey: ['notifications', 'recent', activeOrgId] },
      (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          data: prev.data.map((item) =>
            item.id === notificationId ? { ...item, read_at: nowIso } : item
          ),
        }
      }
    )

    // Optimistically update history queries
    queryClient.setQueriesData<NotificationFeedResponse>(
      { queryKey: ['notifications', 'history', activeOrgId] },
      (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          data: prev.data.map((item) =>
            item.id === notificationId ? { ...item, read_at: nowIso } : item
          ),
        }
      }
    )

    // Optimistically decrement unread count
    queryClient.setQueriesData<UnreadCountResponse>(
      { queryKey: ['notifications', 'unread-count', activeOrgId] },
      (prev) => ({ unread_count: Math.max(0, (prev?.unread_count ?? 1) - 1) })
    )

    try {
      await fetch(`${resolvedApiUrl}/api/notifications/${notificationId}/mark-read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  }

  // 4. Mark all notifications as read
  const markAllRead = async () => {
    if (!authToken) return

    const nowIso = new Date().toISOString()

    queryClient.setQueriesData<NotificationFeedResponse>(
      { queryKey: ['notifications', 'recent', activeOrgId] },
      (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          data: prev.data.map((item) => ({ ...item, read_at: item.read_at ?? nowIso })),
        }
      }
    )

    queryClient.setQueriesData<NotificationFeedResponse>(
      { queryKey: ['notifications', 'history', activeOrgId] },
      (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          data: prev.data.map((item) => ({ ...item, read_at: item.read_at ?? nowIso })),
        }
      }
    )

    queryClient.setQueriesData<UnreadCountResponse>(
      { queryKey: ['notifications', 'unread-count', activeOrgId] },
      () => ({ unread_count: 0 })
    )

    try {
      await fetch(`${resolvedApiUrl}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  }

  return {
    unreadCount,
    markRead,
    markAllRead,
    resolvedApiUrl,
    token: authToken,
    activeOrgId,
  }
}
