export interface LiveSignalPayload {
  readonly event_id: string
  readonly organization_id: number
  readonly ticket_id: string
  readonly change_type: string
  readonly revision: number
}

export type LiveStatus = 'connecting' | 'connected' | 'disconnected'

export interface ILiveClient {
  readonly status: LiveStatus
  readonly subscribeToOrganization: (
    onSignal: (signal: LiveSignalPayload) => void
  ) => () => void
  readonly subscribeToTicket: (
    ticketId: string,
    onSignal: (signal: LiveSignalPayload) => void
  ) => () => void
  readonly onStatusChange: (listener: (status: LiveStatus) => void) => () => void
  readonly onReconnect: (listener: () => void) => () => void
  readonly disconnect: () => void
  readonly rotateChannels?: () => Promise<void>
}

export interface LiveClientOptions {
  readonly apiUrl: string
  readonly token?: string | null
  readonly appKey?: string
  readonly wsUrl?: string
  readonly webSocketClass?: typeof WebSocket
  readonly reconnectIntervalMs?: number
  readonly channelRotationIntervalMs?: number
}

function resolveWsUrl(apiUrl: string, appKey: string): string {
  try {
    const url = new URL(apiUrl)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = url.host
    return `${protocol}//${host}/app/${appKey}?protocol=7&client=js&version=8.0&flash=false`
  } catch {
    return `ws://localhost:8000/app/${appKey}?protocol=7&client=js&version=8.0&flash=false`
  }
}

export class LiveClient implements ILiveClient {
  private _status: LiveStatus = 'disconnected'
  private socket: WebSocket | null = null
  private socketId: string | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private rotationTimer: ReturnType<typeof setInterval> | null = null
  private isExplicitlyClosed = false
  private retryCount = 0

  private readonly statusListeners = new Set<(status: LiveStatus) => void>()
  private readonly reconnectListeners = new Set<() => void>()

  private orgSignalListeners = new Set<(signal: LiveSignalPayload) => void>()
  private ticketSignalListeners = new Map<string, Set<(signal: LiveSignalPayload) => void>>()

  private currentOrgChannel: string | null = null
  private currentTicketChannels = new Map<string, string>() // ticketId -> channelName

  private readonly apiUrl: string
  private readonly token?: string | null
  private readonly appKey: string
  private readonly wsUrl: string
  private readonly WebSocketConstructor: typeof WebSocket
  private readonly reconnectIntervalMs: number
  private readonly channelRotationIntervalMs: number

  constructor(options: LiveClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '')
    this.token = options.token
    this.appKey = options.appKey || 'zeddesk-local-key'
    this.wsUrl = options.wsUrl || resolveWsUrl(this.apiUrl, this.appKey)
    this.WebSocketConstructor = options.webSocketClass || (typeof WebSocket !== 'undefined' ? WebSocket : (null as any))
    this.reconnectIntervalMs = options.reconnectIntervalMs || 3000
    // Default rotation check every 4.5 minutes (270s) to refresh before 300s expiration
    this.channelRotationIntervalMs = options.channelRotationIntervalMs || 270_000

    this.connect()
    this.startRotationTimer()
  }

  get status(): LiveStatus {
    return this._status
  }

  private setStatus(newStatus: LiveStatus): void {
    if (this._status !== newStatus) {
      this._status = newStatus
      for (const listener of this.statusListeners) {
        listener(newStatus)
      }
    }
  }

  public onStatusChange(listener: (status: LiveStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this._status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  public onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener)
    return () => {
      this.reconnectListeners.delete(listener)
    }
  }

  private connect(): void {
    if (this.isExplicitlyClosed || !this.WebSocketConstructor) {
      this.setStatus('disconnected')
      return
    }

    this.setStatus('connecting')

    try {
      this.socket = new this.WebSocketConstructor(this.wsUrl)
    } catch {
      this.setStatus('disconnected')
      this.scheduleReconnect()
      return
    }

    this.socket.onopen = () => {
      // Waiting for pusher:connection_established
    }

    this.socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data)
    }

    this.socket.onerror = () => {
      this.setStatus('disconnected')
    }

    this.socket.onclose = () => {
      this.setStatus('disconnected')
      this.socketId = null
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || this.reconnectTimer) return
    const delay = Math.min(this.reconnectIntervalMs * Math.pow(1.5, this.retryCount), 15000)
    this.retryCount++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private handleMessage(raw: unknown): void {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!parsed || typeof parsed !== 'object') return

      const eventName = parsed.event

      if (eventName === 'pusher:connection_established') {
        const data = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.socketId = data?.socket_id ?? null
        const wasDisconnected = this._status !== 'connected'
        this.setStatus('connected')
        this.retryCount = 0

        // Resubscribe to existing channels
        this.resubscribeAllChannels()

        if (wasDisconnected) {
          for (const listener of this.reconnectListeners) {
            listener()
          }
        }
      } else if (eventName === 'pusher:ping') {
        this.send({ event: 'pusher:pong', data: {} })
      } else if (eventName === 'ticket.changed') {
        const payload: LiveSignalPayload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.dispatchSignal(parsed.channel, payload)
      }
    } catch {
      // Ignore unparseable frames
    }
  }

  private send(message: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private dispatchSignal(channel: string, payload: LiveSignalPayload): void {
    // Check if channel is org channel
    if (channel === this.currentOrgChannel) {
      for (const listener of this.orgSignalListeners) {
        listener(payload)
      }
    }

    // Check if channel matches any ticket channel
    for (const [ticketId, ticketChannel] of this.currentTicketChannels.entries()) {
      if (ticketChannel === channel) {
        const listeners = this.ticketSignalListeners.get(ticketId)
        if (listeners) {
          for (const listener of listeners) {
            listener(payload)
          }
        }
      }
    }
  }

  private async authorizeChannel(channelName: string): Promise<string | null> {
    if (!this.socketId || !this.token) return null
    try {
      const url = `${this.apiUrl}/api/broadcasting/auth`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          socket_id: this.socketId,
          channel_name: channelName,
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.auth ?? null
    } catch {
      return null
    }
  }

  private async subscribeChannel(channelName: string): Promise<void> {
    if (!this.socketId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const auth = await this.authorizeChannel(channelName)
    if (!auth) return
    this.send({
      event: 'pusher:subscribe',
      data: {
        channel: channelName,
        auth,
      },
    })
  }

  private unsubscribeChannel(channelName: string): void {
    this.send({
      event: 'pusher:unsubscribe',
      data: {
        channel: channelName,
      },
    })
  }

  private async resubscribeAllChannels(): Promise<void> {
    const promises: Promise<void>[] = []
    if (this.currentOrgChannel) {
      promises.push(this.subscribeChannel(this.currentOrgChannel))
    }
    for (const channelName of this.currentTicketChannels.values()) {
      promises.push(this.subscribeChannel(channelName))
    }
    await Promise.all(promises)
  }

  public subscribeToOrganization(
    onSignal: (signal: LiveSignalPayload) => void
  ): () => void {
    this.orgSignalListeners.add(onSignal)

    // Discover organization channel if not already discovered
    if (!this.currentOrgChannel) {
      this.discoverOrgChannel()
    }

    return () => {
      this.orgSignalListeners.delete(onSignal)
      if (this.orgSignalListeners.size === 0 && this.currentOrgChannel) {
        this.unsubscribeChannel(this.currentOrgChannel)
        this.currentOrgChannel = null
      }
    }
  }

  private async discoverOrgChannel(): Promise<void> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const res = await fetch(`${this.apiUrl}/api/live/organization-channel`, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.channel) {
        this.currentOrgChannel = data.channel
        await this.subscribeChannel(data.channel)
      }
    } catch {
      // Channel discovery failure
    }
  }

  public subscribeToTicket(
    ticketId: string,
    onSignal: (signal: LiveSignalPayload) => void
  ): () => void {
    let listeners = this.ticketSignalListeners.get(ticketId)
    if (!listeners) {
      listeners = new Set()
      this.ticketSignalListeners.set(ticketId, listeners)
    }
    listeners.add(onSignal)

    this.discoverTicketChannel(ticketId)

    return () => {
      const currentListeners = this.ticketSignalListeners.get(ticketId)
      if (currentListeners) {
        currentListeners.delete(onSignal)
        if (currentListeners.size === 0) {
          this.ticketSignalListeners.delete(ticketId)
          const channelName = this.currentTicketChannels.get(ticketId)
          if (channelName) {
            this.unsubscribeChannel(channelName)
            this.currentTicketChannels.delete(ticketId)
          }
        }
      }
    }
  }

  private async discoverTicketChannel(ticketId: string): Promise<void> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const res = await fetch(`${this.apiUrl}/api/tickets/${ticketId}/live-channel`, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.channel) {
        const oldChannel = this.currentTicketChannels.get(ticketId)
        if (oldChannel && oldChannel !== data.channel) {
          this.unsubscribeChannel(oldChannel)
        }
        this.currentTicketChannels.set(ticketId, data.channel)
        await this.subscribeChannel(data.channel)
      }
    } catch {
      // Ticket channel discovery failure
    }
  }

  private startRotationTimer(): void {
    if (this.channelRotationIntervalMs <= 0) return
    this.rotationTimer = setInterval(() => {
      this.rotateChannels()
    }, this.channelRotationIntervalMs)
  }

  public async rotateChannels(): Promise<void> {
    // Re-discover organization channel
    if (this.orgSignalListeners.size > 0) {
      const oldOrgChannel = this.currentOrgChannel
      await this.discoverOrgChannel()
      if (oldOrgChannel && oldOrgChannel !== this.currentOrgChannel) {
        this.unsubscribeChannel(oldOrgChannel)
      }
    }

    // Re-discover all active ticket channels in parallel
    await Promise.all(
      Array.from(this.ticketSignalListeners.keys()).map((ticketId) =>
        this.discoverTicketChannel(ticketId)
      )
    )

    // Notify reconnect listeners to refresh REST data
    for (const listener of this.reconnectListeners) {
      listener()
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer)
      this.rotationTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.setStatus('disconnected')
  }
}

export class MockLiveClient implements ILiveClient {
  public status: LiveStatus = 'connected'
  private readonly statusListeners = new Set<(status: LiveStatus) => void>()
  private readonly reconnectListeners = new Set<() => void>()
  private readonly orgListeners = new Set<(signal: LiveSignalPayload) => void>()
  private readonly ticketListeners = new Map<string, Set<(signal: LiveSignalPayload) => void>>()

  constructor(initialStatus: LiveStatus = 'connected') {
    this.status = initialStatus
  }

  public onStatusChange(listener: (status: LiveStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  public onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener)
    return () => {
      this.reconnectListeners.delete(listener)
    }
  }

  public subscribeToOrganization(onSignal: (signal: LiveSignalPayload) => void): () => void {
    this.orgListeners.add(onSignal)
    return () => {
      this.orgListeners.delete(onSignal)
    }
  }

  public subscribeToTicket(ticketId: string, onSignal: (signal: LiveSignalPayload) => void): () => void {
    let set = this.ticketListeners.get(ticketId)
    if (!set) {
      set = new Set()
      this.ticketListeners.set(ticketId, set)
    }
    set.add(onSignal)
    return () => {
      const current = this.ticketListeners.get(ticketId)
      if (current) {
        current.delete(onSignal)
        if (current.size === 0) {
          this.ticketListeners.delete(ticketId)
        }
      }
    }
  }

  public emitSignal(signal: LiveSignalPayload): void {
    // Deliver to org listeners
    for (const listener of this.orgListeners) {
      listener(signal)
    }
    // Deliver to ticket listeners if subscribed
    const ticketListeners = this.ticketListeners.get(signal.ticket_id)
    if (ticketListeners) {
      for (const listener of ticketListeners) {
        listener(signal)
      }
    }
  }

  public setStatus(status: LiveStatus): void {
    this.status = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  public simulateDisconnect(): void {
    this.setStatus('disconnected')
  }

  public simulateReconnect(): void {
    this.setStatus('connected')
    for (const listener of this.reconnectListeners) {
      listener()
    }
  }

  public async rotateChannels(): Promise<void> {
    for (const listener of this.reconnectListeners) {
      listener()
    }
  }

  public disconnect(): void {
    this.setStatus('disconnected')
  }
}

export function createLiveClient(options: LiveClientOptions): ILiveClient {
  return new LiveClient(options)
}

export function createMockLiveClient(initialStatus: LiveStatus = 'connected'): MockLiveClient {
  return new MockLiveClient(initialStatus)
}
