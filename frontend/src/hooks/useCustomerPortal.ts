import { useMutation, useQuery } from '@tanstack/react-query'

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
  return useMutation<TicketSubmissionResponse, Error, CreateTicketPayload>({
    mutationFn: async (payload) => {
      const formData = new FormData()
      formData.append('name', payload.name.trim())
      formData.append('email', payload.email.trim())
      formData.append('subject', payload.subject.trim())
      formData.append('message', payload.message.trim())
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
        },
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(extractPortalErrorMessage(data, 'Failed to submit support request.'))
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
  return useMutation({
    mutationFn: async (payload: CustomerReplyPayload) => {
      if (!ticketUuid) {
        throw new Error('Ticket identifier is required.')
      }

      const formData = new FormData()
      formData.append('message', payload.body.trim())

      if (payload.files && payload.files.length > 0) {
        payload.files.forEach((file) => {
          formData.append('attachments[]', file)
        })
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
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

      return data
    },
  })
}
