import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LiveClient, createMockLiveClient, type LiveSignalPayload } from './live-client'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  readyState: number = 0 // CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = 1 // OPEN
      this.onopen?.()
    }, 0)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.()
  }

  receive(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }
}

describe('LiveClient and MockLiveClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('establishes connection and handles Pusher handshake and ping/pong', async () => {
    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    const statusSpy = vi.fn()
    client.onStatusChange(statusSpy)

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    expect(socket.url).toContain('/app/zeddesk-local-key?protocol=7&client=js&version=8.0&flash=false')

    // Simulate pusher:connection_established
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    expect(client.status).toBe('connected')
    expect(statusSpy).toHaveBeenCalledWith('connected')

    // Simulate ping
    socket.receive({
      event: 'pusher:ping',
      data: {},
    })

    const pongFrame = socket.sent.find((msg) => msg.includes('pusher:pong'))
    expect(pongFrame).toBeDefined()

    client.disconnect()
    expect(client.status).toBe('disconnected')
  })

  it('authorizes and subscribes to organization channel using Bearer credential', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/live/organization-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ channel: 'private-organization.1.700' }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer test-token',
        })
        const body = JSON.parse(init?.body as string)
        expect(body.socket_id).toBe('123.456')
        expect(body.channel_name).toBe('private-organization.1.700')
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ auth: 'sig-abc' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const signalSpy = vi.fn()
    client.subscribeToOrganization(signalSpy)

    await vi.advanceTimersByTimeAsync(50)

    const subscribeFrame = socket.sent.find((msg) => msg.includes('pusher:subscribe'))
    expect(subscribeFrame).toBeDefined()
    expect(JSON.parse(subscribeFrame!)).toEqual({
      event: 'pusher:subscribe',
      data: {
        channel: 'private-organization.1.700',
        auth: 'sig-abc',
      },
    })

    // Dispatch ticket.changed signal
    const payload: LiveSignalPayload = {
      event_id: 'ev-1',
      organization_id: 1,
      ticket_id: 'ticket-123',
      change_type: 'status_changed',
      revision: 2,
    }

    socket.receive({
      event: 'ticket.changed',
      channel: 'private-organization.1.700',
      data: JSON.stringify(payload),
    })

    expect(signalSpy).toHaveBeenCalledWith(payload)

    client.disconnect()
    global.fetch = originalFetch
  })

  it('createMockLiveClient emits signals and simulates disconnect/reconnect', () => {
    const mock = createMockLiveClient()
    const signalSpy = vi.fn()
    const statusSpy = vi.fn()
    const reconnectSpy = vi.fn()

    mock.onStatusChange(statusSpy)
    mock.onReconnect(reconnectSpy)
    mock.subscribeToOrganization(signalSpy)

    expect(mock.status).toBe('connected')

    const payload: LiveSignalPayload = {
      event_id: 'ev-test',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'created',
      revision: 1,
    }
    mock.emitSignal(payload)
    expect(signalSpy).toHaveBeenCalledWith(payload)

    mock.simulateDisconnect()
    expect(mock.status).toBe('disconnected')
    expect(statusSpy).toHaveBeenCalledWith('disconnected')

    mock.simulateReconnect()
    expect(mock.status).toBe('connected')
    expect(reconnectSpy).toHaveBeenCalled()
  })

  it('authorizes and subscribes to member notification channel and dispatches inbox.changed', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes('/api/live/notification-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ channel: 'private-organization.1.member.2.notifications.gen1' }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ auth: 'sig-notif' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const notifSpy = vi.fn()
    client.subscribeToNotifications?.(notifSpy)

    await vi.advanceTimersByTimeAsync(50)

    const subscribeFrame = socket.sent.find((msg) => msg.includes('private-organization.1.member.2.notifications.gen1'))
    expect(subscribeFrame).toBeDefined()

    socket.receive({
      event: 'inbox.changed',
      channel: 'private-organization.1.member.2.notifications.gen1',
      data: JSON.stringify({
        event_id: 'notif-ev-1',
        organization_id: 1,
        recipient_member_id: 2,
      }),
    })

    expect(notifSpy).toHaveBeenCalledWith({
      event_id: 'notif-ev-1',
      organization_id: 1,
      recipient_member_id: 2,
    })

    client.disconnect()
    global.fetch = originalFetch
  })

  it('MockLiveClient emits inbox signals to notification listeners', () => {
    const mock = createMockLiveClient()
    const notifSpy = vi.fn()

    mock.subscribeToNotifications?.(notifSpy)

    mock.emitInboxSignal({
      event_id: 'ev-inbox-1',
      organization_id: 1,
      recipient_member_id: 2,
    })

    expect(notifSpy).toHaveBeenCalledWith({
      event_id: 'ev-inbox-1',
      organization_id: 1,
      recipient_member_id: 2,
    })
  })

  it('subscribes to Organization presence channel, authorizes with channel_data, and tracks member joins and leaves', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes('/api/live/presence-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: 'presence-organization.1.members.gen100',
            offline_grace_seconds: 30,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            auth: 'sig-org-presence',
            channel_data: JSON.stringify({
              user_id: '1',
              user_info: { member_id: 1, name: 'Alice' },
            }),
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const presenceSpy = vi.fn()
    const unsubscribe = client.subscribeToOrganizationPresence?.(presenceSpy)

    await vi.advanceTimersByTimeAsync(50)

    const subscribeFrame = socket.sent.find((msg) => msg.includes('presence-organization.1.members.gen100'))
    expect(subscribeFrame).toBeDefined()
    expect(JSON.parse(subscribeFrame!)).toEqual({
      event: 'pusher:subscribe',
      data: {
        channel: 'presence-organization.1.members.gen100',
        auth: 'sig-org-presence',
        channel_data: JSON.stringify({
          user_id: '1',
          user_info: { member_id: 1, name: 'Alice' },
        }),
      },
    })

    // Subscription succeeded snapshot
    socket.receive({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'presence-organization.1.members.gen100',
      data: JSON.stringify({
        presence: {
          ids: ['1', '2'],
          hash: {
            '1': { member_id: 1, name: 'Alice' },
            '2': { member_id: 2, name: 'Bob' },
          },
          count: 2,
        },
      }),
    })

    expect(presenceSpy).toHaveBeenCalledWith([
      { member_id: 1, name: 'Alice' },
      { member_id: 2, name: 'Bob' },
    ])

    // Member added
    socket.receive({
      event: 'pusher_internal:member_added',
      channel: 'presence-organization.1.members.gen100',
      data: JSON.stringify({
        user_id: '3',
        user_info: { member_id: 3, name: 'Charlie' },
      }),
    })

    expect(presenceSpy).toHaveBeenLastCalledWith([
      { member_id: 1, name: 'Alice' },
      { member_id: 2, name: 'Bob' },
      { member_id: 3, name: 'Charlie' },
    ])

    // Duplicate add for existing member (multi-tab) does not duplicate
    socket.receive({
      event: 'pusher_internal:member_added',
      channel: 'presence-organization.1.members.gen100',
      data: JSON.stringify({
        user_id: '3',
        user_info: { member_id: 3, name: 'Charlie' },
      }),
    })
    expect(presenceSpy).toHaveBeenLastCalledWith([
      { member_id: 1, name: 'Alice' },
      { member_id: 2, name: 'Bob' },
      { member_id: 3, name: 'Charlie' },
    ])

    // Member removed
    socket.receive({
      event: 'pusher_internal:member_removed',
      channel: 'presence-organization.1.members.gen100',
      data: JSON.stringify({
        user_id: '2',
      }),
    })

    expect(presenceSpy).toHaveBeenLastCalledWith([
      { member_id: 1, name: 'Alice' },
      { member_id: 3, name: 'Charlie' },
    ])

    // Unsubscribe sends pusher:unsubscribe
    unsubscribe?.()
    const unsubFrame = socket.sent.find((msg) => msg.includes('pusher:unsubscribe') && msg.includes('presence-organization.1.members.gen100'))
    expect(unsubFrame).toBeDefined()

    client.disconnect()
    global.fetch = originalFetch
  })

  it('subscribes to Ticket viewing presence channel and tracks active ticket viewers', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes('/api/tickets/ticket-42/viewing-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: 'presence-ticket.ticket-42.viewers.gen100',
            typing_expires_after_seconds: 5,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            auth: 'sig-ticket-presence',
            channel_data: JSON.stringify({
              user_id: '1',
              user_info: { member_id: 1, name: 'Alice' },
            }),
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const viewersSpy = vi.fn()
    const unsubscribe = client.subscribeToTicketViewers?.('ticket-42', viewersSpy)

    await vi.advanceTimersByTimeAsync(50)

    const subscribeFrame = socket.sent.find((msg) => msg.includes('presence-ticket.ticket-42.viewers.gen100'))
    expect(subscribeFrame).toBeDefined()

    socket.receive({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      data: JSON.stringify({
        presence: {
          ids: ['1'],
          hash: {
            '1': { member_id: 1, name: 'Alice' },
          },
          count: 1,
        },
      }),
    })

    expect(viewersSpy).toHaveBeenCalledWith([{ member_id: 1, name: 'Alice' }])

    unsubscribe?.()
    const unsubFrame = socket.sent.find((msg) => msg.includes('pusher:unsubscribe') && msg.includes('presence-ticket.ticket-42.viewers.gen100'))
    expect(unsubFrame).toBeDefined()

    client.disconnect()
    global.fetch = originalFetch
  })

  it('handles denied authorization gracefully by clearing presence members', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/live/presence-channel')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ message: 'Forbidden' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'bad-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const presenceSpy = vi.fn()
    client.subscribeToOrganizationPresence?.(presenceSpy)

    await vi.advanceTimersByTimeAsync(50)

    expect(presenceSpy).toHaveBeenCalledWith([])

    client.disconnect()
    global.fetch = originalFetch
  })

  it('clears presence when broadcasting auth is denied with 403', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/live/presence-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: 'presence-organization.1.members.gen100',
            offline_grace_seconds: 30,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ message: 'Forbidden' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'some-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const presenceSpy = vi.fn()
    client.subscribeToOrganizationPresence?.(presenceSpy)

    await vi.advanceTimersByTimeAsync(50)

    // Initially called with [] and after 403 auth denied cleared to []
    expect(presenceSpy).toHaveBeenCalledWith([])

    client.disconnect()
    global.fetch = originalFetch
  })

  it('renews presence subscriptions via discovery endpoints upon reconnect', async () => {
    const originalFetch = global.fetch
    let discoveryCallCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/live/presence-channel')) {
        discoveryCallCount++
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: `presence-organization.1.members.gen${discoveryCallCount * 100}`,
            offline_grace_seconds: 30,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            auth: 'auth-key:signature',
            channel_data: JSON.stringify({ user_id: '1', user_info: { member_id: 1, name: 'Alice' } }),
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'some-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket1 = MockWebSocket.instances[0]
    socket1.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const presenceSpy = vi.fn()
    client.subscribeToOrganizationPresence?.(presenceSpy)

    await vi.advanceTimersByTimeAsync(50)
    expect(discoveryCallCount).toBe(1)

    // Simulate connection drop and reconnect
    socket1.close()
    await vi.advanceTimersByTimeAsync(3000)

    const socket2 = MockWebSocket.instances[1]
    socket2.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '789.012' }),
    })

    await vi.advanceTimersByTimeAsync(50)
    // Reconnect triggered second discovery for new generation
    expect(discoveryCallCount).toBe(2)

    client.disconnect()
    global.fetch = originalFetch
  })

  it('MockLiveClient supports presence and viewer emitting', () => {
    const mock = createMockLiveClient()
    const orgPresenceSpy = vi.fn()
    const ticketViewersSpy = vi.fn()

    mock.subscribeToOrganizationPresence?.(orgPresenceSpy)
    mock.subscribeToTicketViewers?.('ticket-10', ticketViewersSpy)

    mock.emitOrganizationPresence([
      { member_id: 1, name: 'Alice' },
      { member_id: 2, name: 'Bob' },
    ])
    expect(orgPresenceSpy).toHaveBeenCalledWith([
      { member_id: 1, name: 'Alice' },
      { member_id: 2, name: 'Bob' },
    ])

    mock.emitTicketViewers('ticket-10', [{ member_id: 1, name: 'Alice' }])
    expect(ticketViewersSpy).toHaveBeenCalledWith([{ member_id: 1, name: 'Alice' }])
  })

  it('MockLiveClient supports typing subscription, emission, and sendTicketTyping recording (Issue #152)', () => {
    const mock = createMockLiveClient()
    const typingSpy = vi.fn()

    const unsub = mock.subscribeToTicketTyping?.('ticket-10', typingSpy)
    expect(typingSpy).toHaveBeenCalledWith([])

    mock.emitTicketTyping?.('ticket-10', [{ member_id: 2, name: 'Bob Admin' }])
    expect(typingSpy).toHaveBeenCalledWith([{ member_id: 2, name: 'Bob Admin' }])

    mock.sendTicketTyping?.('ticket-10', true)
    mock.sendTicketTyping?.('ticket-10', false)
    expect(mock.sentTypingFrames).toEqual([
      { ticketId: 'ticket-10', typing: true },
      { ticketId: 'ticket-10', typing: false },
    ])

    unsub?.()
  })

  it('LiveClient sends boolean client-typing frame over viewing channel without draft or user_id (Issue #152)', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets/ticket-42/viewing-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: 'presence-ticket.ticket-42.viewers.gen100',
            typing_expires_after_seconds: 5,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ auth: 'signed-key:signed-sig' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const typingSpy = vi.fn()
    const unsubscribe = client.subscribeToTicketTyping?.('ticket-42', typingSpy)

    await vi.advanceTimersByTimeAsync(50)

    // Send typing true
    client.sendTicketTyping?.('ticket-42', true)
    const typingFrame1 = socket.sent.find((msg) => msg.includes('client-typing') && msg.includes('"typing":true'))
    expect(typingFrame1).toBeDefined()
    const parsed1 = JSON.parse(typingFrame1!)
    expect(parsed1.event).toBe('client-typing')
    expect(parsed1.channel).toBe('presence-ticket.ticket-42.viewers.gen100')
    expect(parsed1.data).toEqual({ typing: true })
    // Ensure draft text and claimed user_id are strictly NOT on the wire
    expect(parsed1.user_id).toBeUndefined()
    expect(parsed1.draft).toBeUndefined()

    // Send typing false
    client.sendTicketTyping?.('ticket-42', false)
    const typingFrame2 = socket.sent.find((msg) => msg.includes('client-typing') && msg.includes('"typing":false'))
    expect(typingFrame2).toBeDefined()
    const parsed2 = JSON.parse(typingFrame2!)
    expect(parsed2.data).toEqual({ typing: false })

    unsubscribe?.()
    client.disconnect()
    global.fetch = originalFetch
  })

  it('LiveClient handles incoming client-typing, maps user_id to viewer name, and expires automatically (Issue #152)', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets/ticket-42/viewing-channel')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channel: 'presence-ticket.ticket-42.viewers.gen100',
            typing_expires_after_seconds: 5,
          }),
        })
      }
      if (url.includes('/api/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ auth: 'signed-key:signed-sig' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      token: 'test-token',
      webSocketClass: MockWebSocket as any,
    })

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const viewersSpy = vi.fn()
    const typingSpy = vi.fn()
    client.subscribeToTicketViewers?.('ticket-42', viewersSpy)
    client.subscribeToTicketTyping?.('ticket-42', typingSpy)

    await vi.advanceTimersByTimeAsync(50)

    // Seed viewers so presence identity map knows member 10 is Alice
    socket.receive({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      data: JSON.stringify({
        presence: {
          ids: ['10'],
          hash: {
            '10': { member_id: 10, name: 'Alice Agent' },
          },
          count: 1,
        },
      }),
    })

    // Other member 10 begins typing
    socket.receive({
      event: 'client-typing',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      user_id: '10',
      data: JSON.stringify({ typing: true }),
    })

    expect(typingSpy).toHaveBeenLastCalledWith([
      { member_id: 10, name: 'Alice Agent' },
    ])

    // After 5 seconds without renewal, typing cue expires automatically
    await vi.advanceTimersByTimeAsync(5000)
    expect(typingSpy).toHaveBeenLastCalledWith([])

    // Member 10 types again then explicitly stops
    socket.receive({
      event: 'client-typing',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      user_id: '10',
      data: JSON.stringify({ typing: true }),
    })
    expect(typingSpy).toHaveBeenLastCalledWith([
      { member_id: 10, name: 'Alice Agent' },
    ])

    socket.receive({
      event: 'client-typing',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      user_id: '10',
      data: JSON.stringify({ typing: false }),
    })
    expect(typingSpy).toHaveBeenLastCalledWith([])

    // Member 10 types again and then disconnects from presence
    socket.receive({
      event: 'client-typing',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      user_id: '10',
      data: JSON.stringify({ typing: true }),
    })
    expect(typingSpy).toHaveBeenLastCalledWith([
      { member_id: 10, name: 'Alice Agent' },
    ])

    socket.receive({
      event: 'pusher_internal:member_removed',
      channel: 'presence-ticket.ticket-42.viewers.gen100',
      data: JSON.stringify({ user_id: '10' }),
    })
    expect(typingSpy).toHaveBeenLastCalledWith([])

    client.disconnect()
    global.fetch = originalFetch
  })

  it('LiveClient discovers, authorizes, and subscribes to customer ticket channel using X-Customer-Token (#156)', async () => {
    const originalFetch = global.fetch
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes('/api/portal/tickets/ticket-99/live-channel')) {
        expect(options?.headers?.['X-Customer-Token']).toBe('signed-customer-token')
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ channel: 'private-customer.ticket.ticket-99.gen1' }),
        })
      }
      if (url.includes('/api/portal/tickets/ticket-99/broadcasting/auth')) {
        expect(options?.headers?.['X-Customer-Token']).toBe('signed-customer-token')
        const body = JSON.parse(options?.body || '{}')
        expect(body.socket_id).toBe('123.456')
        expect(body.channel_name).toBe('private-customer.ticket.ticket-99.gen1')
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ auth: 'customer-auth-sig' }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
    global.fetch = fetchMock

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      webSocketClass: MockWebSocket as any,
    })

    const signalSpy = vi.fn()
    const unavailableSpy = vi.fn()

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()

    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    const unsubscribe = client.subscribeToCustomerTicket!(
      'ticket-99',
      'signed-customer-token',
      signalSpy,
      unavailableSpy
    )

    await vi.advanceTimersByTimeAsync(50)

    expect(socket.sent).toContain(
      JSON.stringify({
        event: 'pusher:subscribe',
        data: {
          channel: 'private-customer.ticket.ticket-99.gen1',
          auth: 'customer-auth-sig',
        },
      })
    )

    // Receive ticket.changed signal
    socket.receive({
      event: 'ticket.changed',
      channel: 'private-customer.ticket.ticket-99.gen1',
      data: JSON.stringify({
        event_id: 'evt-1',
        organization_id: 1,
        ticket_id: 'ticket-99',
        change_type: 'message_created',
        revision: 2,
      }),
    })
    expect(signalSpy).toHaveBeenCalledWith({
      event_id: 'evt-1',
      organization_id: 1,
      ticket_id: 'ticket-99',
      change_type: 'message_created',
      revision: 2,
    })

    // Receive ticket.unavailable signal (soft delete / deletion)
    socket.receive({
      event: 'ticket.unavailable',
      channel: 'private-customer.ticket.ticket-99.gen1',
      data: '{}',
    })
    expect(unavailableSpy).toHaveBeenCalledWith('unavailable')

    unsubscribe()
    expect(socket.sent).toContain(
      JSON.stringify({
        event: 'pusher:unsubscribe',
        data: {
          channel: 'private-customer.ticket.ticket-99.gen1',
        },
      })
    )

    client.disconnect()
    global.fetch = originalFetch
  })

  it('MockLiveClient supports subscribeToCustomerTicket, emitSignal, and emitTicketUnavailable (#156)', () => {
    const mock = createMockLiveClient()
    const signalSpy = vi.fn()
    const unavailableSpy = vi.fn()

    const unsubscribe = mock.subscribeToCustomerTicket!(
      'ticket-55',
      'cust-tok',
      signalSpy,
      unavailableSpy
    )

    mock.emitSignal({
      event_id: 'e-1',
      organization_id: 1,
      ticket_id: 'ticket-55',
      change_type: 'status_changed',
      revision: 3,
    })
    expect(signalSpy).toHaveBeenCalledWith({
      event_id: 'e-1',
      organization_id: 1,
      ticket_id: 'ticket-55',
      change_type: 'status_changed',
      revision: 3,
    })

    mock.emitTicketUnavailable!('ticket-55', 'unavailable')
    expect(unavailableSpy).toHaveBeenCalledWith('unavailable')

    unsubscribe()
  })

  it('LiveClient notifies unavailable listener with expired when token is rejected with 401 (#156)', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/portal/tickets/ticket-expired/live-channel')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ message: 'Customer access token has expired.' }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      webSocketClass: MockWebSocket as any,
    })

    const signalSpy = vi.fn()
    const unavailableSpy = vi.fn()

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    client.subscribeToCustomerTicket!(
      'ticket-expired',
      'expired-token',
      signalSpy,
      unavailableSpy
    )

    await vi.advanceTimersByTimeAsync(50)

    expect(unavailableSpy).toHaveBeenCalledWith('expired')

    client.disconnect()
    global.fetch = originalFetch
  })

  it('LiveClient rotates customer ticket channels and notifies reconnect listeners (#156)', async () => {
    const originalFetch = global.fetch
    let generation = 1
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/portal/tickets/ticket-rotate/live-channel')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ channel: `private-customer.ticket.ticket-rotate.gen${generation}` }),
        })
      }
      if (url.includes('/api/portal/tickets/ticket-rotate/broadcasting/auth')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ auth: `auth-${generation}` }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const client = new LiveClient({
      apiUrl: 'http://localhost:8000',
      webSocketClass: MockWebSocket as any,
    })

    const signalSpy = vi.fn()
    const reconnectSpy = vi.fn()
    client.onReconnect(reconnectSpy)

    await vi.advanceTimersByTimeAsync(10)
    const socket = MockWebSocket.instances[0]
    socket.receive({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })

    client.subscribeToCustomerTicket!(
      'ticket-rotate',
      'valid-token',
      signalSpy
    )

    await vi.advanceTimersByTimeAsync(50)
    expect(socket.sent).toContain(
      JSON.stringify({
        event: 'pusher:subscribe',
        data: {
          channel: 'private-customer.ticket.ticket-rotate.gen1',
          auth: 'auth-1',
        },
      })
    )

    // Simulate generation rotation
    generation = 2
    await client.rotateChannels!()

    expect(socket.sent).toContain(
      JSON.stringify({
        event: 'pusher:unsubscribe',
        data: {
          channel: 'private-customer.ticket.ticket-rotate.gen1',
        },
      })
    )
    expect(socket.sent).toContain(
      JSON.stringify({
        event: 'pusher:subscribe',
        data: {
          channel: 'private-customer.ticket.ticket-rotate.gen2',
          auth: 'auth-2',
        },
      })
    )
    expect(reconnectSpy).toHaveBeenCalled()

    client.disconnect()
    global.fetch = originalFetch
  })
})



