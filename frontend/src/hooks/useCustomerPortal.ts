import { useMutation } from '@tanstack/react-query'

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
