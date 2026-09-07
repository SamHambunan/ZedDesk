import { useQuery } from '@tanstack/react-query'
import { getApiBaseUrl } from '../utils/url'

export interface WorkspaceOrganization {
  readonly id: number
  readonly name: string
  readonly slug: string
}

export interface WorkspaceUser {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly avatarUrl?: string
}

export interface WorkspaceData {
  readonly organization: WorkspaceOrganization
  readonly user: WorkspaceUser
  readonly role: 'admin' | 'agent' | string
}

export interface WorkspaceError {
  readonly status: number
  readonly message: string
}

export function useWorkspace(subdomain: string | null, token: string | null) {
  const apiUrl = getApiBaseUrl(subdomain)

  return useQuery<WorkspaceData, WorkspaceError>({
    queryKey: ['workspace', subdomain, token],
    queryFn: async () => {
      if (!token) {
        const err: WorkspaceError = { status: 401, message: 'Authentication required or session expired.' }
        throw err
      }

      const res = await fetch(`${apiUrl}/api/workspace`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 404) {
          const err: WorkspaceError = { status: 404, message: data.message || 'Organization not found.' }
          throw err
        } else if (res.status === 403) {
          const err: WorkspaceError = {
            status: 403,
            message: data.message || 'Forbidden. You are not an Organization Member of this Organization.',
          }
          throw err
        } else if (res.status === 401) {
          const err: WorkspaceError = {
            status: 401,
            message: data.message || 'Authentication required or session expired.',
          }
          throw err
        } else {
          const err: WorkspaceError = {
            status: res.status,
            message: data.message || 'Error loading workspace.',
          }
          throw err
        }
      }

      return data as WorkspaceData
    },
    enabled: Boolean(subdomain && token),
    retry: false,
    staleTime: 60 * 1000,
  })
}
