import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'

export type TicketPriorityType = 'low' | 'medium' | 'high' | 'urgent'

export interface CreateTicketPayload {
  name: string
  email: string
  subject: string
  message: string
  priority?: TicketPriorityType
  attachments?: File[]
}

export interface TicketSubmissionResponse {
  message: string
  token: string
  access_url?: string
  ticket: {
    id: string | number
    ticket_number: number
    subject: string
    status: string
    priority?: TicketPriorityType
    created_at?: string
  }
  customer: {
    id: string | number
    name: string
    email: string
  }
  initial_message?: {
    id: string | number
    body: string
    created_at?: string
  }
  attachments?: unknown[]
}

export interface MagicLinkPayload {
  email: string
}

export interface MagicLinkResponse {
  message: string
  token?: string
  magic_link?: string
  url?: string
}

function extractPortalErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const errorObj = data as { message?: string; errors?: Record<string, string[]> }
    if (errorObj.errors) {
      const messages = Object.values(errorObj.errors).flat()
      if (messages.length > 0) return messages.join(', ')
    }
    if (errorObj.message) return errorObj.message
  }
  return fallback
}

export function useSubmitTicketMutation(apiUrl: string) {
  const pendingIntake = useRef<{
    storageKey: string
    fingerprint: string
    key: string
  } | null>(null)

  return useMutation<TicketSubmissionResponse, Error, CreateTicketPayload>({
    mutationFn: async (payload) => {
      const name = payload.name.trim()
      const email = payload.email.trim()
      const subject = payload.subject.trim()
      const message = payload.message.trim()
      const files = payload.attachments ?? []
      const storageKey = `zeddesk_ticket_intake:${apiUrl}`
      const fingerprint = await submissionFingerprint([name, email, subject, message, payload.priority ?? null], files)
      let previous = pendingIntake.current?.storageKey === storageKey ? pendingIntake.current : null
      if (!previous && typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
          if (typeof stored?.key === 'string' && typeof stored?.fingerprint === 'string') {
            previous = { storageKey, key: stored.key, fingerprint: stored.fingerprint }
          }
        } catch {
          // The current form can still retry with its in-memory key.
        }
      }
      const key = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID()
      pendingIntake.current = { storageKey, fingerprint, key }
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }))
        } catch {
          // The in-memory key covers retries in this form.
        }
      }

      const formData = new FormData()
      formData.append('name', name)
      formData.append('email', email)
      formData.append('subject', subject)
      formData.append('message', message)
      if (payload.priority) {
        formData.append('priority', payload.priority)
      }

      if (payload.attachments && payload.attachments.length > 0) {
        payload.attachments.forEach((file) => {
          formData.append('attachments[]', file)
        })
      }

      const res = await fetch(`${apiUrl}/api/portal/tickets`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Idempotency-Key': key,
        },
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(extractPortalErrorMessage(data, 'Failed to submit support request.'))
      }

      if (pendingIntake.current?.key === key) {
        pendingIntake.current = null
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem(storageKey)
          } catch {
            // Storage failure does not change the confirmed result.
          }
        }
      }
      return data as TicketSubmissionResponse
    },
  })
}

export function useMagicLinkMutation(apiUrl: string) {
  return useMutation<MagicLinkResponse, Error, MagicLinkPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`${apiUrl}/api/portal/magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: payload.email.trim(),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(extractPortalErrorMessage(data, 'Failed to send magic link.'))
      }

      return data as MagicLinkResponse
    },
  })
}

export const CUSTOMER_TOKEN_STORAGE_KEY = 'zeddesk_customer_token'

export function getCustomerToken(ticketUuid?: string): string | null {
  if (typeof window === 'undefined') return null
  if (ticketUuid) {
    const scopedToken = sessionStorage.getItem(`portal_token_${ticketUuid}`)
    if (scopedToken) return scopedToken
  }
  return (
    sessionStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY) ||
    sessionStorage.getItem('portal_token')
  )
}

export function setCustomerToken(token: string, ticketUuid?: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(CUSTOMER_TOKEN_STORAGE_KEY, token)
  if (ticketUuid) {
    sessionStorage.setItem(`portal_token_${ticketUuid}`, token)
  }
}

export function clearCustomerToken(ticketUuid?: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(CUSTOMER_TOKEN_STORAGE_KEY)
  sessionStorage.removeItem('portal_token')
  if (ticketUuid) {
    sessionStorage.removeItem(`portal_token_${ticketUuid}`)
  }
}

export function stripTokenFromUrl(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (params.has('token')) {
    params.delete('token')
    const newSearch = params.toString() ? `?${params.toString()}` : ''
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch}${window.location.hash}`)
  }
}

export function parsePortalTicketUuidFromPath(path?: string): string | null {
  if (!path) return null
  const match = path.match(/^\/portal\/tickets\/([^/?#]+)/)
  return match ? match[1] : null
}

export interface CustomerReplyPayload {
  body: string
  files?: readonly File[]
}

async function submissionDigest(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const input = new Uint8Array(new ArrayBuffer(bytes.byteLength))
    input.set(bytes)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input.buffer)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  // Web Crypto is unavailable in some local and test environments. The backend
  // still compares the complete payload before accepting a reused key.
  let hash = 2166136261
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function submissionFingerprint(fields: readonly (string | null)[], files: readonly File[]): Promise<string> {
  const attachments = await Promise.all(files.map(async (file) => [
    file.name,
    file.type,
    file.size,
    await submissionDigest(new Uint8Array(await file.arrayBuffer())),
  ]))
  return submissionDigest(new TextEncoder().encode(JSON.stringify([...fields, attachments])))
}

export function useCustomerTicketQuery(
  apiUrl: string,
  ticketUuid: string | null,
  token: string | null
) {
  return useQuery({
    queryKey: ['portal-ticket', ticketUuid, token],
    queryFn: async () => {
      if (!ticketUuid) {
        throw new Error('Ticket identifier is required.')
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (token) {
        headers['X-Customer-Token'] = token
      }

      const res = await fetch(`${apiUrl}/api/portal/tickets/${ticketUuid}`, {
        method: 'GET',
        headers,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(extractPortalErrorMessage(data, `Failed to load ticket (${res.status}).`))
      }

      return data
    },
    enabled: Boolean(ticketUuid),
  })
}

export function useCustomerReplyMutation(
  apiUrl: string,
  ticketUuid: string | null,
  token: string | null
) {
  const pendingReply = useRef<{
    storageKey: string
    fingerprint: string
    key: string
  } | null>(null)

  return useMutation({
    mutationFn: async (payload: CustomerReplyPayload) => {
      if (!ticketUuid) {
        throw new Error('Ticket identifier is required.')
      }

      const body = payload.body.trim()
      const files = payload.files ?? []
      const storageKey = `zeddesk_customer_reply:${apiUrl}:${ticketUuid}`
      const fingerprint = await submissionFingerprint([body], files)
      let previous = pendingReply.current?.storageKey === storageKey ? pendingReply.current : null
      if (!previous && typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
          if (typeof stored?.key === 'string' && typeof stored?.fingerprint === 'string') {
            previous = { storageKey, key: stored.key, fingerprint: stored.fingerprint }
          }
        } catch {
          // The in-memory key still covers retries when session storage is unavailable.
        }
      }
      const key = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID()
      pendingReply.current = { storageKey, fingerprint, key }
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }))
        } catch {
          // The current composer can still retry with its in-memory key.
        }
      }

      const formData = new FormData()
      formData.append('message', body)

      if (payload.files && payload.files.length > 0) {
        payload.files.forEach((file) => {
          formData.append('attachments[]', file)
        })
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Idempotency-Key': key,
      }
      if (token) {
        headers['X-Customer-Token'] = token
      }

      const res = await fetch(`${apiUrl}/api/portal/tickets/${ticketUuid}/reply`, {
        method: 'POST',
        headers,
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(extractPortalErrorMessage(data, 'Failed to submit reply.'))
      }

      if (pendingReply.current?.key === key) {
        pendingReply.current = null
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem(storageKey)
          } catch {
            // Storage failure does not change the confirmed reply result.
          }
        }
      }
      return data
    },
  })
}
