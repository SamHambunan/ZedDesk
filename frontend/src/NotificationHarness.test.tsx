import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { queryClient } from './lib/query-client'
import type { NotificationItem } from './components/notifications/types'

describe('Organization Notification Bell and History Harness', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    queryClient.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.location.hostname = 'localhost'
    window.location.pathname = '/'
    window.location.search = ''
  })

  const mockNotifications: NotificationItem[] = [
    {
      id: 'harness-notif-1',
      organization_id: 1,
      recipient_member_id: 10,
      ticket_id: 't-101',
      ticket_number: 101,
      subject: 'VPN authentication failure',
      activity: 'customer_public_reply',
      activity_type: 'customer_public_reply',
      actor: { id: 50, name: 'Carol Customer', email: 'carol@test.com', type: 'customer' },
      actor_name: 'Carol Customer',
      time: '2026-10-13T09:15:00Z',
      read_at: null,
      created_at: '2026-10-13T09:15:00Z',
      updated_at: '2026-10-13T09:15:00Z',
      ticket: { id: 't-101', ticket_number: 101, subject: 'VPN authentication failure', status: 'open' },
      is_available: true,
    },
    {
      id: 'harness-notif-2',
      organization_id: 1,
      recipient_member_id: 10,
      ticket_id: 't-102',
      ticket_number: 102,
      subject: 'Invoice #8493 discrepancy',
      activity: 'ticket_created',
      activity_type: 'ticket_created',
      actor: { id: 51, name: 'Dave Customer', email: 'dave@test.com', type: 'customer' },
      actor_name: 'Dave Customer',
      time: '2026-10-13T09:10:00Z',
      read_at: null,
      created_at: '2026-10-13T09:10:00Z',
      updated_at: '2026-10-13T09:10:00Z',
      ticket: { id: 't-102', ticket_number: 102, subject: 'Invoice #8493 discrepancy', status: 'new' },
      is_available: true,
    },
    {
      id: 'harness-notif-3',
      organization_id: 1,
      recipient_member_id: 10,
      ticket_id: 't-103',
      ticket_number: 103,
      subject: 'Security certificate update',
      activity: 'internal_note',
      activity_type: 'internal_note',
      actor: { id: 10, name: 'Alice Admin', email: 'admin@acme.test', type: 'member' },
      actor_name: 'Alice Admin',
      time: '2026-10-13T09:05:00Z',
      read_at: '2026-10-13T09:08:00Z',
      created_at: '2026-10-13T09:05:00Z',
      updated_at: '2026-10-13T09:08:00Z',
      ticket: { id: 't-103', ticket_number: 103, subject: 'Security certificate update', status: 'open' },
      is_available: true,
    },
    {
      id: 'harness-notif-4',
      organization_id: 1,
      recipient_member_id: 10,
      ticket_id: 't-104',
      ticket_number: null,
      subject: null,
      activity: 'assignment_changed',
      activity_type: 'assignment_changed',
      actor: null,
      actor_name: null,
      time: '2026-10-13T09:00:00Z',
      read_at: null,
      created_at: '2026-10-13T09:00:00Z',
      updated_at: '2026-10-13T09:00:00Z',
      ticket: null,
      is_available: false,
    },
  ]

  function setupAppFetch() {
    let items = [...mockNotifications]
    let unreadCount = items.filter((i) => i.read_at === null).length

    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      const urlStr = String(url)

      if (urlStr.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Handshake', slug: 'acme' },
            user: { id: 10, name: 'Alice Admin', email: 'admin@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }

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
              data: items.slice(0, 5),
              from: 1,
              last_page: 1,
              per_page: 5,
              to: Math.min(5, items.length),
              total: items.length,
            }),
        })
      }

      if (urlStr.includes('/mark-all-read')) {
        unreadCount = 0
        items = items.map((i) => ({ ...i, read_at: '2026-10-13T10:00:00Z' }))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ marked_read: 3 }),
        })
      }

      if (urlStr.includes('/mark-read')) {
        const idMatch = urlStr.match(/\/api\/notifications\/([^/]+)\/mark-read/)
        const targetId = idMatch ? idMatch[1] : ''
        unreadCount = Math.max(0, unreadCount - 1)
        items = items.map((i) => (i.id === targetId ? { ...i, read_at: '2026-10-13T10:00:00Z' } : i))
        const updated = items.find((i) => i.id === targetId) || { id: targetId, read_at: '2026-10-13T10:00:00Z' }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: updated }),
        })
      }

      if (urlStr.includes('/api/notifications')) {
        const isUnread = urlStr.includes('filter=unread')
        const filtered = isUnread ? items.filter((i) => i.read_at === null) : items
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              current_page: 1,
              data: filtered,
              from: 1,
              last_page: 1,
              per_page: 20,
              to: filtered.length,
              total: filtered.length,
            }),
        })
      }

      if (urlStr.includes('/api/tickets')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tickets: [
                {
                  id: 't-101',
                  ticket_number: 101,
                  subject: 'VPN authentication failure',
                  status: 'open',
                  priority: 'high',
                  customer: { id: 50, name: 'Carol Customer', email: 'carol@test.com' },
                  created_at: '2026-10-13T09:15:00Z',
                  updated_at: '2026-10-13T09:15:00Z',
                  messages: [],
                  tags: [],
                },
              ],
            }),
        })
      }

      if (urlStr.includes('/api/live/organization-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ channel: 'private-organization.1.700' }),
        })
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  }

  it('renders bell with unread count, navigates to ticket on notification click without mark-read, and opens full history', async () => {
    const user = userEvent.setup()
    setupAppFetch()
    localStorage.setItem('zeddesk_token', 'mock-admin-token')

    render(<App hostname="acme.localhost" />)

    // Workspace loads
    expect(await screen.findByTestId('workspace-org-name')).toHaveTextContent('Acme Handshake')

    // Bell button exists and has unread count badge (3 unread items)
    const bellBtn = await screen.findByTestId('notifications-bell-btn')
    expect(bellBtn).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('notifications-unread-badge')).toHaveTextContent('3')
    })

    // Click bell button to open 5-item popover
    await user.click(bellBtn)
    expect(await screen.findByTestId('notifications-popover')).toBeInTheDocument()

    // 5-item popover displays notification details
    expect(await screen.findByText('VPN authentication failure')).toBeInTheDocument()
    expect(screen.getByText('Invoice #8493 discrepancy')).toBeInTheDocument()
    expect(screen.getByText('Security certificate update')).toBeInTheDocument()

    // Unavailable destination shows unavailable state
    expect(screen.getByTestId('notification-unavailable-harness-notif-4')).toHaveTextContent(/Ticket unavailable/i)

    // Click ticket deep link for #101
    const ticketLink = screen.getByTestId('notification-link-harness-notif-1')
    await user.click(ticketLink)

    // Navigates to tickets view (deep link followed!)
    await waitFor(() => {
      expect(screen.getByTestId('tickets-queue-view')).toBeInTheDocument()
    })

    // Popover is closed
    expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument()

    // Did NOT call mark-read on opening ticket
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/mark-read'),
      expect.anything()
    )

    // Open bell again and click View full history
    await user.click(screen.getByTestId('notifications-bell-btn'))
    const viewAllBtn = await screen.findByTestId('view-all-notifications-btn')
    await user.click(viewAllBtn)

    // Navigates to Notification History view
    expect(await screen.findByTestId('notifications-history-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Notification History/i })).toBeInTheDocument()

    // All and Unread filter tabs work
    expect(screen.getByTestId('filter-tab-all')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('VPN authentication failure')).toBeInTheDocument()

    // Explicit Mark Read on item retains the item with Read status
    const markReadBtn = screen.getByTestId('history-mark-read-btn-harness-notif-1')
    await user.click(markReadBtn)

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-read-harness-notif-1')).toBeInTheDocument()
      expect(screen.queryByTestId('history-mark-read-btn-harness-notif-1')).not.toBeInTheDocument()
    })
  })
})
