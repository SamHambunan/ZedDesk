import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationBell } from './NotificationBell'
import { createMockLiveClient } from '../../lib/live-client'
import type { NotificationItem } from './types'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  })
}

const mockRecentNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-101',
    ticket_number: 101,
    subject: 'Server connection error',
    activity: 'customer_public_reply',
    activity_type: 'customer_public_reply',
    actor: { id: 5, name: 'Alice Customer', email: 'alice@test.com', type: 'customer' },
    actor_name: 'Alice Customer',
    time: '2026-10-13T09:00:00Z',
    read_at: null,
    created_at: '2026-10-13T09:00:00Z',
    updated_at: '2026-10-13T09:00:00Z',
    ticket: { id: 't-101', ticket_number: 101, subject: 'Server connection error', status: 'open' },
    is_available: true,
  },
  {
    id: 'notif-2',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-102',
    ticket_number: 102,
    subject: 'Billing inquiry',
    activity: 'ticket_created',
    activity_type: 'ticket_created',
    actor: { id: 6, name: 'Bob Customer', email: 'bob@test.com', type: 'customer' },
    actor_name: 'Bob Customer',
    time: '2026-10-13T08:50:00Z',
    read_at: null,
    created_at: '2026-10-13T08:50:00Z',
    updated_at: '2026-10-13T08:50:00Z',
    ticket: { id: 't-102', ticket_number: 102, subject: 'Billing inquiry', status: 'new' },
    is_available: true,
  },
  {
    id: 'notif-3',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-103',
    ticket_number: 103,
    subject: 'Password reset',
    activity: 'assignment_changed',
    activity_type: 'assignment_changed',
    actor: { id: 3, name: 'Agent Smith', email: 'smith@test.com', type: 'member' },
    actor_name: 'Agent Smith',
    time: '2026-10-13T08:40:00Z',
    read_at: '2026-10-13T08:45:00Z', // already read
    created_at: '2026-10-13T08:40:00Z',
    updated_at: '2026-10-13T08:45:00Z',
    ticket: { id: 't-103', ticket_number: 103, subject: 'Password reset', status: 'assigned' },
    is_available: true,
  },
  {
    id: 'notif-4',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-104',
    ticket_number: null,
    subject: null,
    activity: 'internal_note',
    activity_type: 'internal_note',
    actor: null,
    actor_name: null,
    time: '2026-10-13T08:30:00Z',
    read_at: null,
    created_at: '2026-10-13T08:30:00Z',
    updated_at: '2026-10-13T08:30:00Z',
    ticket: null,
    is_available: false, // unavailable ticket
  },
  {
    id: 'notif-5',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-105',
    ticket_number: 105,
    subject: 'Feature request',
    activity: 'status_changed',
    activity_type: 'status_changed',
    actor: { id: 4, name: 'Agent Jones', email: 'jones@test.com', type: 'member' },
    actor_name: 'Agent Jones',
    time: '2026-10-13T08:20:00Z',
    read_at: '2026-10-13T08:25:00Z',
    created_at: '2026-10-13T08:20:00Z',
    updated_at: '2026-10-13T08:25:00Z',
    ticket: { id: 't-105', ticket_number: 105, subject: 'Feature request', status: 'solved' },
    is_available: true,
  },
]

describe('NotificationBell Component', () => {
  let queryClient: QueryClient
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    queryClient = createTestQueryClient()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function setupMockFetch(overrides: {
    unreadCount?: number
    recentItems?: NotificationItem[]
    markReadData?: Partial<NotificationItem>
  } = {}) {
    let unreadCount = overrides.unreadCount ?? 3
    let recentItems = overrides.recentItems ? [...overrides.recentItems] : [...mockRecentNotifications]

    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      const urlStr = String(url)

      if (urlStr.includes('/api/notifications/unread-count')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ unread_count: unreadCount }),
        })
      }

      if (urlStr.includes('/api/notifications') && (urlStr.includes('mode=recent') || urlStr.includes('recent=true'))) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              current_page: 1,
              data: recentItems,
              from: 1,
              last_page: 1,
              per_page: 5,
              to: recentItems.length,
              total: recentItems.length,
            }),
        })
      }

      if (urlStr.includes('/mark-all-read')) {
        unreadCount = 0
        recentItems = recentItems.map((item) => ({ ...item, read_at: '2026-10-13T10:00:00Z' }))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ marked_read: 3 }),
        })
      }

      if (urlStr.includes('/mark-read')) {
        const idMatch = urlStr.match(/\/api\/notifications\/([^/]+)\/mark-read/)
        const targetId = idMatch ? idMatch[1] : ''
        unreadCount = Math.max(0, unreadCount - 1)
        recentItems = recentItems.map((item) =>
          item.id === targetId ? { ...item, read_at: '2026-10-13T10:00:00Z', ...overrides.markReadData } : item
        )
        const updatedItem = recentItems.find((i) => i.id === targetId) || { id: targetId, read_at: '2026-10-13T10:00:00Z' }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: updatedItem }),
        })
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  }

  it('renders bell button with unread count badge and screen-reader announcement', async () => {
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    expect(bellBtn).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('notifications-unread-badge')).toHaveTextContent('3')
    })

    const liveAnnouncement = screen.getByTestId('notifications-live-announcement')
    expect(liveAnnouncement).toHaveTextContent(/3 unread notification/i)
  })

  it('opens 5-item popover on click and shows ticket and activity details', async () => {
    const user = userEvent.setup()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    expect(await screen.findByTestId('notifications-popover')).toBeInTheDocument()

    // Expect 5 recent notifications
    expect(await screen.findByText('Server connection error')).toBeInTheDocument()
    expect(screen.getByText('Billing inquiry')).toBeInTheDocument()
    expect(screen.getByText('Password reset')).toBeInTheDocument()
    expect(screen.getByText('Feature request')).toBeInTheDocument()

    // Check activity description
    expect(screen.getByText(/Reply from Alice Customer/i)).toBeInTheDocument()
    expect(screen.getByText(/Ticket created by Bob Customer/i)).toBeInTheDocument()
  })

  it('opening a notification follows its ticket number deep link without marking it read', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    const ticketLink = await screen.findByTestId('notification-link-notif-1')
    await user.click(ticketLink)

    // Deep links to ticket
    expect(onNavigate).toHaveBeenCalledWith('tickets/101')

    // Must NOT mark as read
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/mark-read'),
      expect.anything()
    )
  })

  it('shows unavailable state for inaccessible destination without navigating', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    // notif-4 is unavailable
    const unavailableItem = await screen.findByTestId('notification-unavailable-notif-4')
    expect(unavailableItem).toBeInTheDocument()
    expect(unavailableItem).toHaveTextContent(/Ticket unavailable/i)

    await user.click(unavailableItem)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('explicit Mark read marks item and retains it in the popover', async () => {
    const user = userEvent.setup()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    const markReadBtn = await screen.findByTestId('mark-read-btn-notif-1')
    await user.click(markReadBtn)

    // Called mark-read endpoint
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/notif-1/mark-read'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    // Retained read item: still visible in popover, but unread badge/indicator is gone or read state shown
    expect(screen.getByText('Server connection error')).toBeInTheDocument()
    expect(screen.queryByTestId('mark-read-btn-notif-1')).not.toBeInTheDocument()
  })

  it('Mark all read marks all items and clears unread count', async () => {
    const user = userEvent.setup()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    const markAllReadBtn = await screen.findByTestId('notifications-mark-all-read-btn')
    await user.click(markAllReadBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/mark-all-read'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('notifications-unread-badge')).not.toBeInTheDocument()
    })
  })

  it('View full history button navigates to notifications view and closes popover', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    const viewAllBtn = await screen.findByTestId('view-all-notifications-btn')
    await user.click(viewAllBtn)

    expect(onNavigate).toHaveBeenCalledWith('notifications')
    expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument()
  })

  it('inbox.changed quietly refreshes unread count without routine toasts or cross-org leakage', async () => {
    const mockLive = createMockLiveClient('connected')
    setupMockFetch({ unreadCount: 2 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          liveClient={mockLive}
        />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notifications-unread-badge')).toHaveTextContent('2')
    })

    // Simulate cross-org signal (organization_id: 999 instead of 1) -> must be IGNORED
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/unread-count')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ unread_count: 5 }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    mockLive.emitInboxSignal({
      event_id: 'signal-other-org',
      organization_id: 999,
      recipient_member_id: 2,
    })

    // Count must remain 2 because signal from org 999 is leaked/ignored
    expect(screen.getByTestId('notifications-unread-badge')).toHaveTextContent('2')

    // Now emit legitimate signal for active org 1
    mockLive.emitInboxSignal({
      event_id: 'signal-active-org',
      organization_id: 1,
      recipient_member_id: 2,
    })

    // Quietly refetched and updated count to 5
    await waitFor(() => {
      expect(screen.getByTestId('notifications-unread-badge')).toHaveTextContent('5')
    })

    // Screen reader announcement updated quietly
    const liveAnnouncement = screen.getByTestId('notifications-live-announcement')
    expect(liveAnnouncement).toHaveTextContent(/5 unread notification/i)
  })

  it('closes popover on Escape key and restores focus to bell button', async () => {
    const user = userEvent.setup()
    setupMockFetch({ unreadCount: 3 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const bellBtn = screen.getByTestId('notifications-bell-btn')
    await user.click(bellBtn)

    expect(await screen.findByTestId('notifications-popover')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument()
    })
    expect(bellBtn).toHaveFocus()
  })
})
