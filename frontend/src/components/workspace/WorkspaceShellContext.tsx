import React, { createContext, useContext } from 'react'
import { QueryClientContext, QueryClientProvider } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import type { WorkspaceOrganization } from './WorkspaceHeader'

export function SafeQueryProvider({ children }: { children: React.ReactNode }) {
  const client = useContext(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

export type RoleType = 'admin' | 'agent' | string

export interface WorkspaceShellUser {
  readonly id?: number
  readonly name: string
  readonly email: string
  readonly avatarUrl?: string
}

export interface WorkspaceShellContextValue {
  readonly organization: {
    readonly id?: number
    readonly name: string
    readonly slug: string
  }
  readonly user: WorkspaceShellUser | null
  readonly role: RoleType | null
  readonly subdomain: string
  readonly token: string | null
  readonly isSidebarCollapsed: boolean
  readonly toggleSidebar: () => void
  readonly setSidebarCollapsed: (collapsed: boolean) => void
  readonly activeRoute: string
  readonly onNavigate?: (route: string) => void
  readonly onLogout?: () => void
  readonly onCopilotClick?: () => void
  readonly onSearch?: (query: string) => void
  readonly onInviteMemberClick?: () => void
  readonly onAuthSuccess?: (token: string, user: WorkspaceShellUser) => void
  readonly isCreateOrgModalOpen: boolean
  readonly openCreateOrgModal: () => void
  readonly closeCreateOrgModal: () => void
  readonly apiUrl?: string
  readonly organizations?: readonly WorkspaceOrganization[]
}

export const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null)

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const ctx = useContext(WorkspaceShellContext)
  if (!ctx) {
    throw new Error('useWorkspaceShell must be used within a WorkspaceShell.Provider')
  }
  return ctx
}
