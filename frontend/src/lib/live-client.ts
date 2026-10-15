export interface LiveSignalPayload {
  readonly event_id: string
  readonly organization_id: number
  readonly ticket_id: string
  readonly change_type: string
  readonly revision: number
}

export interface InboxSignalPayload {
  readonly event_id: string
  readonly organization_id: number
  readonly recipient_member_id: number
}

export interface PresenceMember {
  readonly member_id: number
  readonly name: string
}

export type LiveStatus = 'connecting' | 'connected' | 'disconnected'
export type CustomerUnavailableReason = 'expired' | 'denied' | 'unavailable'

export interface ILiveClient {
  readonly status: LiveStatus
  readonly subscribeToOrganization: (
    onSignal: (signal: LiveSignalPayload) => void
  ) => () => void
  readonly subscribeToTicket: (
    ticketId: string,
    onSignal: (signal: LiveSignalPayload) => void
  ) => () => void
  readonly subscribeToCustomerTicket?: (
    ticketId: string,
    token: string,
    onSignal: (signal: LiveSignalPayload) => void,
    onUnavailable?: (reason?: CustomerUnavailableReason) => void
  ) => () => void
  readonly subscribeToNotifications?: (
    onSignal: (signal: InboxSignalPayload) => void
  ) => () => void
  readonly subscribeToOrganizationPresence?: (
    onPresenceChange: (members: readonly PresenceMember[]) => void
  ) => () => void
  readonly subscribeToTicketViewers?: (
    ticketId: string,
    onViewersChange: (viewers: readonly PresenceMember[]) => void
  ) => () => void
  readonly subscribeToTicketTyping?: (
    ticketId: string,
    onTypingChange: (typingMembers: readonly PresenceMember[]) => void
  ) => () => void
  readonly sendTicketTyping?: (ticketId: string, isTyping: boolean) => void
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
  private notificationSignalListeners = new Set<(signal: InboxSignalPayload) => void>()
  private orgPresenceListeners = new Set<(members: readonly PresenceMember[]) => void>()
  private ticketViewersListeners = new Map<string, Set<(viewers: readonly PresenceMember[]) => void>>()
  private ticketTypingListeners = new Map<string, Set<(typingMembers: readonly PresenceMember[]) => void>>()
  private customerTicketSignalListeners = new Map<string, Set<(signal: LiveSignalPayload) => void>>()
  private customerTicketUnavailableListeners = new Map<string, Set<(reason?: CustomerUnavailableReason) => void>>()

  private currentOrgChannel: string | null = null
  private currentTicketChannels = new Map<string, string>() // ticketId -> channelName
  private currentCustomerTicketChannels = new Map<string, { channelName: string; token: string }>()
  private currentNotificationChannel: string | null = null
  private currentOrgPresenceChannel: string | null = null
  private currentOrgPresenceMembers = new Map<number, PresenceMember>()
  private currentTicketViewingChannels = new Map<string, string>() // ticketId -> channelName
  private currentTicketViewersMembers = new Map<string, Map<number, PresenceMember>>()
  private currentTicketTypingMembers = new Map<string, Map<number, { member: PresenceMember; timer: ReturnType<typeof setTimeout> }>>()
  private ticketTypingExpirySeconds = new Map<string, number>()
  private channelToTicketId = new Map<string, string>() // channelName -> ticketId

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
      } else if (eventName === 'ticket.unavailable') {
        this.dispatchUnavailable(parsed.channel)
      } else if (eventName === 'inbox.changed' || eventName === '.inbox.changed') {
        const payload: InboxSignalPayload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.dispatchNotificationSignal(parsed.channel, payload)
      } else if (eventName === 'pusher_internal:subscription_succeeded' || eventName === 'pusher:subscription_succeeded') {
        const data = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.dispatchPresenceSubscriptionSucceeded(parsed.channel, data)
      } else if (eventName === 'pusher_internal:member_added' || eventName === 'pusher:member_added') {
        const data = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.dispatchPresenceMemberAdded(parsed.channel, data)
      } else if (eventName === 'pusher_internal:member_removed' || eventName === 'pusher:member_removed') {
        const data = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        this.dispatchPresenceMemberRemoved(parsed.channel, data)
      } else if (eventName === 'client-typing') {
        const rawData = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
        const isTyping = Boolean(rawData?.typing)
        const memberId = Number(parsed.user_id)
        const ticketId = this.channelToTicketId.get(parsed.channel)
        if (ticketId && !Number.isNaN(memberId)) {
          this.handleIncomingTyping(ticketId, memberId, isTyping)
        }
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

  private parsePresenceMember(item: any): PresenceMember | null {
    if (!item) return null
    const memberId = Number(item.member_id ?? item.user_id)
    if (Number.isNaN(memberId)) return null
    const name = item.name ?? item.user_info?.name ?? `Member ${memberId}`
    return { member_id: memberId, name }
  }

  private extractPresenceMembersFromPayload(data: any): PresenceMember[] {
    const result: PresenceMember[] = []
    if (data?.presence?.hash) {
      for (const [idStr, info] of Object.entries(data.presence.hash)) {
        const m = this.parsePresenceMember({ ...(info as object), user_id: idStr })
        if (m) result.push(m)
      }
    } else if (Array.isArray(data?.presence?.ids)) {
      for (const id of data.presence.ids) {
        const m = this.parsePresenceMember({ user_id: id })
        if (m) result.push(m)
      }
    }
    return result
  }

  private dispatchPresenceSubscriptionSucceeded(channel: string, data: any): void {
    const members = this.extractPresenceMembersFromPayload(data)
    if (channel === this.currentOrgPresenceChannel) {
      this.currentOrgPresenceMembers.clear()
      for (const m of members) {
        this.currentOrgPresenceMembers.set(m.member_id, m)
      }
      this.dispatchOrgPresence()
    } else if (this.channelToTicketId.has(channel)) {
      const ticketId = this.channelToTicketId.get(channel)!
      let membersMap = this.currentTicketViewersMembers.get(ticketId)
      if (!membersMap) {
        membersMap = new Map()
        this.currentTicketViewersMembers.set(ticketId, membersMap)
      }
      membersMap.clear()
      for (const m of members) {
        membersMap.set(m.member_id, m)
      }
      this.dispatchTicketViewers(ticketId)
    }
  }

  private dispatchPresenceMemberAdded(channel: string, data: any): void {
    if (channel === this.currentOrgPresenceChannel) {
      const m = this.parsePresenceMember(data?.user_info ?? data)
      if (m) {
        this.currentOrgPresenceMembers.set(m.member_id, m)
        this.dispatchOrgPresence()
      }
    } else if (this.channelToTicketId.has(channel)) {
      const ticketId = this.channelToTicketId.get(channel)!
      let membersMap = this.currentTicketViewersMembers.get(ticketId)
      if (!membersMap) {
        membersMap = new Map()
        this.currentTicketViewersMembers.set(ticketId, membersMap)
      }
      const m = this.parsePresenceMember(data?.user_info ?? data)
      if (m) {
        membersMap.set(m.member_id, m)
        this.dispatchTicketViewers(ticketId)
      }
    }
  }

  private dispatchPresenceMemberRemoved(channel: string, data: any): void {
    const id = Number(data?.user_id ?? data?.member_id)
    if (Number.isNaN(id)) return
    if (channel === this.currentOrgPresenceChannel) {
      if (this.currentOrgPresenceMembers.has(id)) {
        this.currentOrgPresenceMembers.delete(id)
        this.dispatchOrgPresence()
      }
    } else if (this.channelToTicketId.has(channel)) {
      const ticketId = this.channelToTicketId.get(channel)!
      const membersMap = this.currentTicketViewersMembers.get(ticketId)
      if (membersMap && membersMap.has(id)) {
        membersMap.delete(id)
        this.dispatchTicketViewers(ticketId)
      }
      const typingMap = this.currentTicketTypingMembers.get(ticketId)
      if (typingMap && typingMap.has(id)) {
        clearTimeout(typingMap.get(id)!.timer)
        typingMap.delete(id)
        this.dispatchTicketTyping(ticketId)
      }
    }
  }

  private dispatchOrgPresence(): void {
    const list = Array.from(this.currentOrgPresenceMembers.values())
    for (const listener of this.orgPresenceListeners) {
      listener(list)
    }
  }

  private dispatchTicketViewers(ticketId: string): void {
    const membersMap = this.currentTicketViewersMembers.get(ticketId)
    const list = membersMap ? Array.from(membersMap.values()) : []
    const listeners = this.ticketViewersListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(list)
      }
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

    // Check if channel matches any customer ticket channel
    for (const [ticketId, info] of this.currentCustomerTicketChannels.entries()) {
      if (info.channelName === channel) {
        const listeners = this.customerTicketSignalListeners.get(ticketId)
        if (listeners) {
          for (const listener of listeners) {
            listener(payload)
          }
        }
      }
    }
  }

  private dispatchUnavailable(channel: string): void {
    const ticketId = this.channelToTicketId.get(channel)
    if (ticketId) {
      this.notifyCustomerUnavailable(ticketId, 'unavailable')
    }
  }

  private dispatchNotificationSignal(channel: string, payload: InboxSignalPayload): void {
    if (channel === this.currentNotificationChannel) {
      for (const listener of this.notificationSignalListeners) {
        listener(payload)
      }
    }
  }

  private async authorizeChannel(channelName: string): Promise<{ auth: string; channel_data?: string } | null> {
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
      if (!data.auth) return null
      return {
        auth: data.auth,
        channel_data: data.channel_data,
      }
    } catch {
      return null
    }
  }

  private async subscribeChannel(channelName: string): Promise<void> {
    if (!this.socketId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const authData = await this.authorizeChannel(channelName)
    if (!authData) {
      if (
        channelName === this.currentOrgPresenceChannel ||
        (channelName.startsWith('presence-organization.') && channelName.includes('.members.'))
      ) {
        this.currentOrgPresenceMembers.clear()
        this.dispatchOrgPresence()
      } else if (this.channelToTicketId.has(channelName)) {
        const ticketId = this.channelToTicketId.get(channelName)!
        const membersMap = this.currentTicketViewersMembers.get(ticketId)
        if (membersMap) {
          membersMap.clear()
          this.dispatchTicketViewers(ticketId)
        }
      }
      return
    }
    const data: Record<string, any> = {
      channel: channelName,
      auth: authData.auth,
    }
    if (authData.channel_data !== undefined) {
      data.channel_data = authData.channel_data
    }
    this.send({
      event: 'pusher:subscribe',
      data,
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
    if (this.orgSignalListeners.size > 0) {
      promises.push(this.discoverOrgChannel())
    }
    if (this.notificationSignalListeners.size > 0) {
      promises.push(this.discoverNotificationChannel())
    }
    if (this.orgPresenceListeners.size > 0) {
      promises.push(this.discoverOrgPresenceChannel())
    }
    for (const ticketId of this.ticketSignalListeners.keys()) {
      promises.push(this.discoverTicketChannel(ticketId))
    }
    for (const ticketId of this.ticketViewersListeners.keys()) {
      promises.push(this.discoverTicketViewingChannel(ticketId))
    }
    for (const [ticketId, info] of this.currentCustomerTicketChannels.entries()) {
      promises.push(this.discoverCustomerTicketChannel(ticketId, info.token))
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
        const oldChannel = this.currentOrgChannel
        if (oldChannel && oldChannel !== data.channel) {
          this.unsubscribeChannel(oldChannel)
        }
        this.currentOrgChannel = data.channel
        await this.subscribeChannel(data.channel)
      }
    } catch {
      // Channel discovery failure
    }
  }

  public subscribeToNotifications(
    onSignal: (signal: InboxSignalPayload) => void
  ): () => void {
    this.notificationSignalListeners.add(onSignal)

    if (!this.currentNotificationChannel) {
      this.discoverNotificationChannel()
    }

    return () => {
      this.notificationSignalListeners.delete(onSignal)
      if (this.notificationSignalListeners.size === 0 && this.currentNotificationChannel) {
        this.unsubscribeChannel(this.currentNotificationChannel)
        this.currentNotificationChannel = null
      }
    }
  }

  private async discoverNotificationChannel(): Promise<void> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const res = await fetch(`${this.apiUrl}/api/live/notification-channel`, { headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.channel) {
        const oldChannel = this.currentNotificationChannel
        if (oldChannel && oldChannel !== data.channel) {
          this.unsubscribeChannel(oldChannel)
        }
        this.currentNotificationChannel = data.channel
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

  public subscribeToCustomerTicket(
    ticketId: string,
    token: string,
    onSignal: (signal: LiveSignalPayload) => void,
    onUnavailable?: (reason?: CustomerUnavailableReason) => void
  ): () => void {
    let listeners = this.customerTicketSignalListeners.get(ticketId)
    if (!listeners) {
      listeners = new Set()
      this.customerTicketSignalListeners.set(ticketId, listeners)
    }
    listeners.add(onSignal)

    if (onUnavailable) {
      let unavailListeners = this.customerTicketUnavailableListeners.get(ticketId)
      if (!unavailListeners) {
        unavailListeners = new Set()
        this.customerTicketUnavailableListeners.set(ticketId, unavailListeners)
      }
      unavailListeners.add(onUnavailable)
    }

    this.discoverCustomerTicketChannel(ticketId, token)

    return () => {
      const currentListeners = this.customerTicketSignalListeners.get(ticketId)
      if (currentListeners) {
        currentListeners.delete(onSignal)
        if (currentListeners.size === 0) {
          this.customerTicketSignalListeners.delete(ticketId)
        }
      }
      if (onUnavailable) {
        const currentUnavail = this.customerTicketUnavailableListeners.get(ticketId)
        if (currentUnavail) {
          currentUnavail.delete(onUnavailable)
          if (currentUnavail.size === 0) {
            this.customerTicketUnavailableListeners.delete(ticketId)
          }
        }
      }
      if (
        !this.customerTicketSignalListeners.has(ticketId) &&
        !this.customerTicketUnavailableListeners.has(ticketId)
      ) {
        const info = this.currentCustomerTicketChannels.get(ticketId)
        if (info) {
          this.unsubscribeChannel(info.channelName)
          this.channelToTicketId.delete(info.channelName)
          this.currentCustomerTicketChannels.delete(ticketId)
        }
      }
    }
  }

  private handleCustomerAuthError(status: number, ticketId: string): boolean {
    if (status === 401) {
      this.notifyCustomerUnavailable(ticketId, 'expired')
      return true
    }
    if (status === 403 || status === 404) {
      this.notifyCustomerUnavailable(ticketId, 'unavailable')
      return true
    }
    return false
  }

  private async discoverCustomerTicketChannel(ticketId: string, token: string): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}/api/portal/tickets/${ticketId}/live-channel`, {
        headers: {
          Accept: 'application/json',
          'X-Customer-Token': token,
        },
      })
      if (this.handleCustomerAuthError(res.status, ticketId)) {
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data.channel) {
        const oldInfo = this.currentCustomerTicketChannels.get(ticketId)
        if (oldInfo && oldInfo.channelName !== data.channel) {
          this.unsubscribeChannel(oldInfo.channelName)
          this.channelToTicketId.delete(oldInfo.channelName)
        }
        this.currentCustomerTicketChannels.set(ticketId, { channelName: data.channel, token })
        this.channelToTicketId.set(data.channel, ticketId)
        await this.subscribeCustomerChannel(ticketId, data.channel, token)
      }
    } catch {
      // Customer ticket channel discovery failure
    }
  }

  private async subscribeCustomerChannel(
    ticketId: string,
    channelName: string,
    token: string
  ): Promise<void> {
    if (!this.socketId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const authData = await this.authorizeCustomerChannel(ticketId, channelName, token)
    if (!authData) return
    this.send({
      event: 'pusher:subscribe',
      data: {
        channel: channelName,
        auth: authData.auth,
      },
    })
  }

  private async authorizeCustomerChannel(
    ticketId: string,
    channelName: string,
    token: string
  ): Promise<{ auth: string } | null> {
    if (!this.socketId) return null
    try {
      const res = await fetch(`${this.apiUrl}/api/portal/tickets/${ticketId}/broadcasting/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Customer-Token': token,
        },
        body: JSON.stringify({
          socket_id: this.socketId,
          channel_name: channelName,
        }),
      })
      if (this.handleCustomerAuthError(res.status, ticketId)) {
        return null
      }
      if (!res.ok) return null
      const data = await res.json()
      return data.auth ? { auth: data.auth } : null
    } catch {
      return null
    }
  }

  private notifyCustomerUnavailable(ticketId: string, reason: CustomerUnavailableReason): void {
    const listeners = this.customerTicketUnavailableListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(reason)
      }
    }
  }

  private startRotationTimer(): void {
    if (this.channelRotationIntervalMs <= 0) return
    this.rotationTimer = setInterval(() => {
      this.rotateChannels()
    }, this.channelRotationIntervalMs)
  }

  public subscribeToOrganizationPresence(
    onPresenceChange: (members: readonly PresenceMember[]) => void
  ): () => void {
    this.orgPresenceListeners.add(onPresenceChange)
    onPresenceChange(Array.from(this.currentOrgPresenceMembers.values()))

    if (!this.currentOrgPresenceChannel) {
      this.discoverOrgPresenceChannel()
    }

    return () => {
      this.orgPresenceListeners.delete(onPresenceChange)
      if (this.orgPresenceListeners.size === 0 && this.currentOrgPresenceChannel) {
        this.unsubscribeChannel(this.currentOrgPresenceChannel)
        this.currentOrgPresenceChannel = null
        this.currentOrgPresenceMembers.clear()
      }
    }
  }

  private async discoverOrgPresenceChannel(): Promise<void> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const res = await fetch(`${this.apiUrl}/api/live/presence-channel`, { headers })
      if (!res.ok) {
        this.currentOrgPresenceMembers.clear()
        this.dispatchOrgPresence()
        return
      }
      const data = await res.json()
      if (data.channel) {
        const oldChannel = this.currentOrgPresenceChannel
        if (oldChannel && oldChannel !== data.channel) {
          this.unsubscribeChannel(oldChannel)
        }
        this.currentOrgPresenceChannel = data.channel
        await this.subscribeChannel(data.channel)
      }
    } catch {
      this.currentOrgPresenceMembers.clear()
      this.dispatchOrgPresence()
    }
  }

  public subscribeToTicketViewers(
    ticketId: string,
    onViewersChange: (viewers: readonly PresenceMember[]) => void
  ): () => void {
    let listeners = this.ticketViewersListeners.get(ticketId)
    if (!listeners) {
      listeners = new Set()
      this.ticketViewersListeners.set(ticketId, listeners)
    }
    listeners.add(onViewersChange)

    const membersMap = this.currentTicketViewersMembers.get(ticketId)
    onViewersChange(membersMap ? Array.from(membersMap.values()) : [])

    this.discoverTicketViewingChannel(ticketId)

    return () => {
      const currentListeners = this.ticketViewersListeners.get(ticketId)
      if (currentListeners) {
        currentListeners.delete(onViewersChange)
        if (currentListeners.size === 0) {
          this.ticketViewersListeners.delete(ticketId)
          if (!this.ticketTypingListeners.has(ticketId)) {
            const channelName = this.currentTicketViewingChannels.get(ticketId)
            if (channelName) {
              this.unsubscribeChannel(channelName)
              this.currentTicketViewingChannels.delete(ticketId)
              this.channelToTicketId.delete(channelName)
              this.currentTicketViewersMembers.delete(ticketId)
              this.clearTicketTyping(ticketId)
            }
          }
        }
      }
    }
  }

  public subscribeToTicketTyping(
    ticketId: string,
    onTypingChange: (typingMembers: readonly PresenceMember[]) => void
  ): () => void {
    let listeners = this.ticketTypingListeners.get(ticketId)
    if (!listeners) {
      listeners = new Set()
      this.ticketTypingListeners.set(ticketId, listeners)
    }
    listeners.add(onTypingChange)

    const typingMap = this.currentTicketTypingMembers.get(ticketId)
    const currentList = typingMap ? Array.from(typingMap.values()).map((e) => e.member) : []
    onTypingChange(currentList)

    this.discoverTicketViewingChannel(ticketId)

    return () => {
      const currentListeners = this.ticketTypingListeners.get(ticketId)
      if (currentListeners) {
        currentListeners.delete(onTypingChange)
        if (currentListeners.size === 0) {
          this.ticketTypingListeners.delete(ticketId)
          this.clearTicketTyping(ticketId)
          if (!this.ticketViewersListeners.has(ticketId)) {
            const channelName = this.currentTicketViewingChannels.get(ticketId)
            if (channelName) {
              this.unsubscribeChannel(channelName)
              this.currentTicketViewingChannels.delete(ticketId)
              this.channelToTicketId.delete(channelName)
              this.currentTicketViewersMembers.delete(ticketId)
            }
          }
        }
      }
    }
  }

  public sendTicketTyping(ticketId: string, isTyping: boolean): void {
    const channelName = this.currentTicketViewingChannels.get(ticketId)
    if (!channelName) return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return

    this.send({
      event: 'client-typing',
      channel: channelName,
      data: {
        typing: Boolean(isTyping),
      },
    })
  }

  private handleIncomingTyping(ticketId: string, memberId: number, isTyping: boolean): void {
    let activeMap = this.currentTicketTypingMembers.get(ticketId)
    if (!activeMap) {
      activeMap = new Map()
      this.currentTicketTypingMembers.set(ticketId, activeMap)
    }

    if (!isTyping) {
      if (activeMap.has(memberId)) {
        clearTimeout(activeMap.get(memberId)!.timer)
        activeMap.delete(memberId)
        this.dispatchTicketTyping(ticketId)
      }
      return
    }

    const existing = activeMap.get(memberId)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const member: PresenceMember =
      this.currentTicketViewersMembers.get(ticketId)?.get(memberId) ??
      this.currentOrgPresenceMembers.get(memberId) ??
      { member_id: memberId, name: `Member ${memberId}` }

    const expirySeconds = this.ticketTypingExpirySeconds.get(ticketId) ?? 5
    const timer = setTimeout(() => {
      const currentMap = this.currentTicketTypingMembers.get(ticketId)
      if (currentMap?.has(memberId)) {
        currentMap.delete(memberId)
        this.dispatchTicketTyping(ticketId)
      }
    }, expirySeconds * 1000)

    activeMap.set(memberId, { member, timer })
    this.dispatchTicketTyping(ticketId)
  }

  private dispatchTicketTyping(ticketId: string): void {
    const activeMap = this.currentTicketTypingMembers.get(ticketId)
    const list = activeMap ? Array.from(activeMap.values()).map((e) => e.member) : []
    const listeners = this.ticketTypingListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(list)
      }
    }
  }

  private clearTicketTyping(ticketId: string): void {
    const activeMap = this.currentTicketTypingMembers.get(ticketId)
    if (activeMap) {
      for (const entry of activeMap.values()) {
        clearTimeout(entry.timer)
      }
      activeMap.clear()
      this.dispatchTicketTyping(ticketId)
    }
  }

  private async discoverTicketViewingChannel(ticketId: string): Promise<void> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const res = await fetch(`${this.apiUrl}/api/tickets/${ticketId}/viewing-channel`, { headers })
      if (!res.ok) {
        this.currentTicketViewersMembers.get(ticketId)?.clear()
        this.dispatchTicketViewers(ticketId)
        this.clearTicketTyping(ticketId)
        return
      }
      const data = await res.json()
      if (typeof data.typing_expires_after_seconds === 'number') {
        this.ticketTypingExpirySeconds.set(ticketId, data.typing_expires_after_seconds)
      }
      if (data.channel) {
        const oldChannel = this.currentTicketViewingChannels.get(ticketId)
        if (oldChannel && oldChannel !== data.channel) {
          this.unsubscribeChannel(oldChannel)
          this.channelToTicketId.delete(oldChannel)
        }
        this.currentTicketViewingChannels.set(ticketId, data.channel)
        this.channelToTicketId.set(data.channel, ticketId)
        await this.subscribeChannel(data.channel)
      }
    } catch {
      this.currentTicketViewersMembers.get(ticketId)?.clear()
      this.dispatchTicketViewers(ticketId)
      this.clearTicketTyping(ticketId)
    }
  }

  public async rotateChannels(): Promise<void> {
    const promises: Promise<void>[] = []

    // Re-discover organization channel in parallel if active
    if (this.orgSignalListeners.size > 0) {
      promises.push(this.discoverOrgChannel())
    }

    // Re-discover member notification channel in parallel if active
    if (this.notificationSignalListeners.size > 0) {
      promises.push(this.discoverNotificationChannel())
    }

    // Re-discover organization presence channel in parallel if active
    if (this.orgPresenceListeners.size > 0) {
      promises.push(this.discoverOrgPresenceChannel())
    }

    // Re-discover all active ticket channels in parallel
    for (const ticketId of this.ticketSignalListeners.keys()) {
      promises.push(this.discoverTicketChannel(ticketId))
    }

    // Re-discover all active ticket viewing channels in parallel
    const viewingTicketIds = new Set([
      ...this.ticketViewersListeners.keys(),
      ...this.ticketTypingListeners.keys(),
    ])
    for (const ticketId of viewingTicketIds) {
      promises.push(this.discoverTicketViewingChannel(ticketId))
    }

    // Re-discover all active customer ticket channels in parallel
    for (const [ticketId, info] of this.currentCustomerTicketChannels.entries()) {
      promises.push(this.discoverCustomerTicketChannel(ticketId, info.token))
    }

    await Promise.all(promises)

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
    for (const ticketId of this.currentTicketTypingMembers.keys()) {
      this.clearTicketTyping(ticketId)
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
  private readonly notificationListeners = new Set<(signal: InboxSignalPayload) => void>()
  private readonly orgPresenceListeners = new Set<(members: readonly PresenceMember[]) => void>()
  private readonly ticketViewersListeners = new Map<string, Set<(viewers: readonly PresenceMember[]) => void>>()
  private readonly ticketTypingListeners = new Map<string, Set<(typingMembers: readonly PresenceMember[]) => void>>()
  private readonly customerTicketListeners = new Map<string, Set<(signal: LiveSignalPayload) => void>>()
  private readonly customerTicketUnavailableListeners = new Map<string, Set<(reason?: CustomerUnavailableReason) => void>>()
  private currentOrgPresence: readonly PresenceMember[] = []
  private currentTicketViewers = new Map<string, readonly PresenceMember[]>()
  private currentTicketTyping = new Map<string, readonly PresenceMember[]>()
  public readonly sentTypingFrames: Array<{ ticketId: string; typing: boolean }> = []

  constructor(initialStatus: LiveStatus = 'connected') {
    this.status = initialStatus
  }

  public subscribeToCustomerTicket(
    ticketId: string,
    _token: string,
    onSignal: (signal: LiveSignalPayload) => void,
    onUnavailable?: (reason?: CustomerUnavailableReason) => void
  ): () => void {
    let set = this.customerTicketListeners.get(ticketId)
    if (!set) {
      set = new Set()
      this.customerTicketListeners.set(ticketId, set)
    }
    set.add(onSignal)

    if (onUnavailable) {
      let unavailSet = this.customerTicketUnavailableListeners.get(ticketId)
      if (!unavailSet) {
        unavailSet = new Set()
        this.customerTicketUnavailableListeners.set(ticketId, unavailSet)
      }
      unavailSet.add(onUnavailable)
    }

    return () => {
      const current = this.customerTicketListeners.get(ticketId)
      if (current) {
        current.delete(onSignal)
        if (current.size === 0) {
          this.customerTicketListeners.delete(ticketId)
        }
      }
      if (onUnavailable) {
        const currentUnavail = this.customerTicketUnavailableListeners.get(ticketId)
        if (currentUnavail) {
          currentUnavail.delete(onUnavailable)
          if (currentUnavail.size === 0) {
            this.customerTicketUnavailableListeners.delete(ticketId)
          }
        }
      }
    }
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

  public subscribeToNotifications(onSignal: (signal: InboxSignalPayload) => void): () => void {
    this.notificationListeners.add(onSignal)
    return () => {
      this.notificationListeners.delete(onSignal)
    }
  }

  public subscribeToOrganizationPresence(
    onPresenceChange: (members: readonly PresenceMember[]) => void
  ): () => void {
    this.orgPresenceListeners.add(onPresenceChange)
    onPresenceChange(this.currentOrgPresence)
    return () => {
      this.orgPresenceListeners.delete(onPresenceChange)
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

  public subscribeToTicketViewers(
    ticketId: string,
    onViewersChange: (viewers: readonly PresenceMember[]) => void
  ): () => void {
    let set = this.ticketViewersListeners.get(ticketId)
    if (!set) {
      set = new Set()
      this.ticketViewersListeners.set(ticketId, set)
    }
    set.add(onViewersChange)
    onViewersChange(this.currentTicketViewers.get(ticketId) ?? [])
    return () => {
      const current = this.ticketViewersListeners.get(ticketId)
      if (current) {
        current.delete(onViewersChange)
        if (current.size === 0) {
          this.ticketViewersListeners.delete(ticketId)
        }
      }
    }
  }

  public subscribeToTicketTyping(
    ticketId: string,
    onTypingChange: (typingMembers: readonly PresenceMember[]) => void
  ): () => void {
    let set = this.ticketTypingListeners.get(ticketId)
    if (!set) {
      set = new Set()
      this.ticketTypingListeners.set(ticketId, set)
    }
    set.add(onTypingChange)
    onTypingChange(this.currentTicketTyping.get(ticketId) ?? [])
    return () => {
      const current = this.ticketTypingListeners.get(ticketId)
      if (current) {
        current.delete(onTypingChange)
        if (current.size === 0) {
          this.ticketTypingListeners.delete(ticketId)
        }
      }
    }
  }

  public emitTicketTyping(ticketId: string, typingMembers: readonly PresenceMember[]): void {
    this.currentTicketTyping.set(ticketId, typingMembers)
    const listeners = this.ticketTypingListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(typingMembers)
      }
    }
  }

  public sendTicketTyping(ticketId: string, isTyping: boolean): void {
    this.sentTypingFrames.push({ ticketId, typing: isTyping })
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
    // Deliver to customer ticket listeners if subscribed
    const customerListeners = this.customerTicketListeners.get(signal.ticket_id)
    if (customerListeners) {
      for (const listener of customerListeners) {
        listener(signal)
      }
    }
  }

  public emitTicketUnavailable(
    ticketId: string,
    reason: CustomerUnavailableReason = 'unavailable'
  ): void {
    const listeners = this.customerTicketUnavailableListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(reason)
      }
    }
  }

  public emitInboxSignal(signal: InboxSignalPayload): void {
    for (const listener of this.notificationListeners) {
      listener(signal)
    }
  }

  public emitOrganizationPresence(members: readonly PresenceMember[]): void {
    this.currentOrgPresence = members
    for (const listener of this.orgPresenceListeners) {
      listener(members)
    }
  }

  public emitTicketViewers(ticketId: string, viewers: readonly PresenceMember[]): void {
    this.currentTicketViewers.set(ticketId, viewers)
    const listeners = this.ticketViewersListeners.get(ticketId)
    if (listeners) {
      for (const listener of listeners) {
        listener(viewers)
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
