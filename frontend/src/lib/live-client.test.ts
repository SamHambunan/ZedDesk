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
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
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
})

