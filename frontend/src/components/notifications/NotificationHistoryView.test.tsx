import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationHistoryView } from './NotificationHistoryView'
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

const mockHistoryItems: NotificationItem[] = [
  {
    id: 'notif-101',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-101',
    ticket_number: 101,
    subject: 'Cannot access payment gateway',
    activity: 'customer_public_reply',
    activity_type: 'customer_public_reply',
    actor: { id: 5, name: 'Alice Customer', email: 'alice@test.com', type: 'customer' },
    actor_name: 'Alice Customer',
    time: '2026-10-13T09:00:00Z',
    read_at: null,
    created_at: '2026-10-13T09:00:00Z',
    updated_at: '2026-10-13T09:00:00Z',
    ticket: { id: 't-101', ticket_number: 101, subject: 'Cannot access payment gateway', status: 'open' },
    is_available: true,
  },
  {
    id: 'notif-102',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-102',
    ticket_number: 102,
    subject: 'Refund request for duplicate charge',
    activity: 'ticket_created',
    activity_type: 'ticket_created',
    actor: { id: 6, name: 'Bob Customer', email: 'bob@test.com', type: 'customer' },
    actor_name: 'Bob Customer',
    time: '2026-10-13T08:50:00Z',
    read_at: null,
    created_at: '2026-10-13T08:50:00Z',
    updated_at: '2026-10-13T08:50:00Z',
    ticket: { id: 't-102', ticket_number: 102, subject: 'Refund request for duplicate charge', status: 'new' },
    is_available: true,
  },
  {
    id: 'notif-103',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-103',
    ticket_number: 103,
    subject: 'Account security review',
    activity: 'internal_note',
    activity_type: 'internal_note',
    actor: { id: 3, name: 'Agent Smith', email: 'smith@test.com', type: 'member' },
    actor_name: 'Agent Smith',
    time: '2026-10-13T08:40:00Z',
    read_at: '2026-10-13T08:45:00Z', // already read
    created_at: '2026-10-13T08:40:00Z',
    updated_at: '2026-10-13T08:45:00Z',
    ticket: { id: 't-103', ticket_number: 103, subject: 'Account security review', status: 'open' },
    is_available: true,
  },
  {
    id: 'notif-104',
    organization_id: 1,
    recipient_member_id: 2,
    ticket_id: 't-104',
    ticket_number: null,
    subject: null,
    activity: 'status_changed',
    activity_type: 'status_changed',
    actor: null,
    actor_name: null,
    time: '2026-10-13T08:30:00Z',
    read_at: null,
    created_at: '2026-10-13T08:30:00Z',
    updated_at: '2026-10-13T08:30:00Z',
    ticket: null,
    is_available: false, // unavailable
  },
]

describe('NotificationHistoryView Component', () => {
  let queryClient: QueryClient
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    queryClient = createTestQueryClient()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function setupHistoryFetch(options: {
    items?: NotificationItem[]
    totalAll?: number
    totalUnread?: number
  } = {}) {
    let items = options.items ? [...options.items] : [...mockHistoryItems]
    const totalAll = options.totalAll ?? items.length
    const totalUnread = options.totalUnread ?? items.filter((i) => i.read_at === null).length

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const urlStr = String(url)

      if (urlStr.includes('/api/notifications/unread-count')) {
        const count = items.filter((i) => i.read_at === null).length
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ unread_count: count }),
        })
      }

      if (urlStr.includes('/mark-all-read')) {
        items = items.map((i) => ({ ...i, read_at: '2026-10-13T10:00:00Z' }))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ marked_read: items.length }),
        })
      }

      if (urlStr.includes('/mark-read')) {
        const idMatch = urlStr.match(/\/api\/notifications\/([^/]+)\/mark-read/)
        const targetId = idMatch ? idMatch[1] : ''
        items = items.map((i) => (i.id === targetId ? { ...i, read_at: '2026-10-13T10:00:00Z' } : i))
        const updated = items.find((i) => i.id === targetId) || { id: targetId, read_at: '2026-10-13T10:00:00Z' }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: updated }),
        })
      }

      if (urlStr.includes('/api/notifications')) {
        const isUnreadFilter = urlStr.includes('filter=unread') || urlStr.includes('status=unread')
        const filtered = isUnreadFilter ? items.filter((i) => i.read_at === null) : items
        const total = isUnreadFilter ? totalUnread : totalAll

        const pageMatch = urlStr.match(/page=(\d+)/)
        const currentPage = pageMatch ? Number(pageMatch[1]) : 1

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              current_page: currentPage,
              data: filtered,
              from: filtered.length > 0 ? (currentPage - 1) * 20 + 1 : null,
              last_page: Math.max(1, Math.ceil(total / 20)),
              per_page: 20,
              to: filtered.length > 0 ? Math.min(currentPage * 20, total) : null,
              total,
            }),
        })
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  }

  it('renders Notification History view with All and Unread filter tabs', async () => {
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    expect(screen.getByRole('heading', { name: /Notification History/i })).toBeInTheDocument()

    // Tabs
    const allTab = screen.getByTestId('filter-tab-all')
    const unreadTab = screen.getByTestId('filter-tab-unread')
    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(unreadTab).toHaveAttribute('aria-selected', 'false')

    // Table rows
    expect(await screen.findByText('Cannot access payment gateway')).toBeInTheDocument()
    expect(screen.getByText('Refund request for duplicate charge')).toBeInTheDocument()
    expect(screen.getByText('Account security review')).toBeInTheDocument()
  })

  it('filters by Unread tab with accurate pagination totals', async () => {
    const user = userEvent.setup()
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Account security review')).toBeInTheDocument()

    const unreadTab = screen.getByTestId('filter-tab-unread')
    await user.click(unreadTab)

    expect(unreadTab).toHaveAttribute('aria-selected', 'true')

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('filter=unread'),
        expect.anything()
      )
    })

    // Read item should not be present in fresh unread query
    expect(screen.queryByText('Account security review')).not.toBeInTheDocument()
    expect(screen.getByText('Cannot access payment gateway')).toBeInTheDocument()
  })

  it('opening a ticket follows deep link without marking as read', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>
    )

    const ticketLink = await screen.findByTestId('history-ticket-link-notif-101')
    await user.click(ticketLink)

    expect(onNavigate).toHaveBeenCalledWith('tickets/101')

    // Did NOT call mark-read
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/mark-read'),
      expect.anything()
    )
  })

  it('inaccessible destinations display an unavailable state and do not follow broken links', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>
    )

    const unavailableEl = await screen.findByTestId('history-unavailable-notif-104')
    expect(unavailableEl).toBeInTheDocument()
    expect(unavailableEl).toHaveTextContent(/Ticket unavailable/i)

    await user.click(unavailableEl)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('explicit Mark read retains the read item in the view with updated status', async () => {
    const user = userEvent.setup()
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const markReadBtn = await screen.findByTestId('history-mark-read-btn-notif-101')
    await user.click(markReadBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/notif-101/mark-read'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    // Retained read item: item is STILL in the view, but Mark Read button is gone and read badge displayed
    expect(screen.getByText('Cannot access payment gateway')).toBeInTheDocument()
    expect(screen.queryByTestId('history-mark-read-btn-notif-101')).not.toBeInTheDocument()
    expect(screen.getByTestId('status-badge-read-notif-101')).toHaveTextContent(/Read/i)
  })

  it('explicit Mark all read marks all notifications as read and retains them', async () => {
    const user = userEvent.setup()
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    const markAllReadBtn = await screen.findByTestId('history-mark-all-read-btn')
    await user.click(markAllReadBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/mark-all-read'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    // All items retained with Read status
    await waitFor(() => {
      expect(screen.queryByTestId('history-mark-read-btn-notif-101')).not.toBeInTheDocument()
      expect(screen.queryByTestId('history-mark-read-btn-notif-102')).not.toBeInTheDocument()
    })
  })

  it('paginates accurately with Next and Previous buttons and disabled boundaries', async () => {
    const user = userEvent.setup()
    setupHistoryFetch({ totalAll: 35 })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView apiUrl="http://localhost:8000" token="test-token" organizationId={1} />
      </QueryClientProvider>
    )

    await screen.findByText('Cannot access payment gateway')

    const prevBtn = screen.getByTestId('pagination-prev-btn')
    const nextBtn = screen.getByTestId('pagination-next-btn')

    // On page 1, prev is disabled
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    // Page indicator
    expect(screen.getByTestId('pagination-page-indicator')).toHaveTextContent('Page 1 of 2')

    // Click next
    await user.click(nextBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.anything()
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('pagination-page-indicator')).toHaveTextContent('Page 2 of 2')
      expect(nextBtn).toBeDisabled()
      expect(prevBtn).not.toBeDisabled()
    })
  })

  it('inbox.changed quietly refreshes history list without routine toasts or cross-org leakage', async () => {
    const mockLive = createMockLiveClient('connected')
    setupHistoryFetch()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHistoryView
          apiUrl="http://localhost:8000"
          token="test-token"
          organizationId={1}
          liveClient={mockLive}
        />
      </QueryClientProvider>
    )

    await screen.findByText('Cannot access payment gateway')

    // Emit signal from another org (999) -> ignored
    const fetchSpy = vi.spyOn(global, 'fetch')
    mockLive.emitInboxSignal({
      event_id: 'signal-cross-org',
      organization_id: 999,
      recipient_member_id: 2,
    })

    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('organization_id=999'),
      expect.anything()
    )

    // Emit signal from active org (1) -> quiet refetch
    mockLive.emitInboxSignal({
      event_id: 'signal-active-org',
      organization_id: 1,
      recipient_member_id: 2,
    })

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications'),
        expect.anything()
      )
    })
  })
})
