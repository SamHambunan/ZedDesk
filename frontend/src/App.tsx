import { useEffect, useState, useContext, useMemo } from 'react'
import { QueryClientContext, QueryClientProvider } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from './lib/query-client'
import { CentralHubView } from './components/hub'
import { WorkspaceShell } from './components/workspace'
import { TeamsView, TeamManagementView } from './components/teams'
import { MembersView } from './components/members'
import { PublicInvitationView } from './components/invitations'
import { useWorkspace } from './hooks/useWorkspace'
import { getApiBaseUrl, getCentralHubUrl, getOrganizationUrl, getSubdomain } from './utils/url'

function SafeQueryProvider({ children }: { children: React.ReactNode }) {
  const client = useContext(QueryClientContext)
  if (client) {
    return <>{children}</>
  }
  return <QueryClientProvider client={defaultQueryClient}>{children}</QueryClientProvider>
}

interface User {
  id: number
  name: string
  email: string
}

interface InvitationItem {
  id: number
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
  invited_by?: {
    id: number
    name: string
    email: string
  } | null
}

interface PublicInvitation {
  email: string
  role: string
  organization_name: string
  organization_slug: string
  expires_at: string
}

interface OrganizationMemberItem {
  id: number
  organization_id: number
  user_id: number
  role: string
  created_at?: string
  user?: {
    id: number
    name: string
    email: string
  } | null
}

interface TeamItem {
  id: number
  organization_id: number
  name: string
  description: string | null
  created_at?: string
  updated_at?: string
  members: OrganizationMemberItem[]
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const errorObj = data as { message?: string; errors?: Record<string, string[]> }
    if (errorObj.message) return errorObj.message
    if (errorObj.errors) {
      return Object.values(errorObj.errors).flat().join(', ')
    }
  }
  return fallback
}

function AppInner({
  hostname,
  pathname,
  search,
}: {
  hostname?: string
  pathname?: string
  search?: string
} = {}) {
  const activeHost = hostname ?? (typeof window !== 'undefined' ? window.location?.hostname : '')
  const activePath = pathname ?? (typeof window !== 'undefined' ? window.location?.pathname : '/')
  const subdomain = getSubdomain(activeHost)
  const isWorkspace = Boolean(subdomain)
  const apiUrl = getApiBaseUrl(subdomain)

  // Public Invitation Screen Route Check: /invitations/:token
  const isInvitationRoute = activePath.startsWith('/invitations/')
  const invitationToken = isInvitationRoute ? activePath.replace(/^\/invitations\//, '').split('/')[0] : null

  // Public Invitation State
  const [publicInvitation, setPublicInvitation] = useState<PublicInvitation | null>(null)
  const [loadingInvitation, setLoadingInvitation] = useState<boolean>(Boolean(invitationToken))
  const [invitationError, setInvitationError] = useState<string | null>(null)
  const [acceptSuccess, setAcceptSuccess] = useState<{
    organizationName: string
    role: string
    slug: string
  } | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)

  // Workspace Shell Invitations State
  const [workspaceView, setWorkspaceView] = useState<'overview' | 'invitations' | 'members' | 'teams' | 'team-management'>('overview')
  const [workspaceInvitations, setWorkspaceInvitations] = useState<InvitationItem[]>([])
  const [loadingWorkspaceInvitations, setLoadingWorkspaceInvitations] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Workspace Shell Teams & Team Management State
  const [teams, setTeams] = useState<TeamItem[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [teamsError, setTeamsError] = useState<string | null>(null)
  const [orgMembers, setOrgMembers] = useState<OrganizationMemberItem[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Team creation form
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDesc, setNewTeamDesc] = useState('')
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [createTeamError, setCreateTeamError] = useState<string | null>(null)
  const [createTeamSuccess, setCreateTeamSuccess] = useState<string | null>(null)

  // Team editing form
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamDesc, setEditTeamDesc] = useState('')
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false)
  const [updateTeamError, setUpdateTeamError] = useState<string | null>(null)

  // Member assignment per team
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState<{ [teamId: number]: string }>({})
  const [addingMemberTeamId, setAddingMemberTeamId] = useState<number | null>(null)
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null)
  const [deletingTeamId, setDeletingTeamId] = useState<number | null>(null)
  const [teamActionError, setTeamActionError] = useState<{ [teamId: number]: string | null }>({})

  // Auth State (for Workspace Shell)
  const activeSearch = search ?? (typeof window !== 'undefined' ? window.location?.search : '')
  const [token, setToken] = useState<string | null>(() => {
    const urlToken = new URLSearchParams(activeSearch).get('token')
    if (urlToken) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('zeddesk_token', urlToken)
      }
      return urlToken
    }
    return typeof window !== 'undefined' ? localStorage.getItem('zeddesk_token') : null
  })
  const [user, setUser] = useState<User | null>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('zeddesk_user') : null
    return saved ? JSON.parse(saved) : null
  })

  // Clean up ?token= from address bar after ingestion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.has('token')) {
      params.delete('token')
      const newSearch = params.toString() ? `?${params.toString()}` : ''
      window.history.replaceState({}, '', `${window.location.pathname}${newSearch}${window.location.hash}`)
    }
  }, [])

  // Workspace Shell State via TanStack Query
  const { data: workspaceData, isLoading: loadingWorkspace } = useWorkspace(isWorkspace ? subdomain : null, token)

  const persistSession = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('zeddesk_token', newToken)
    localStorage.setItem('zeddesk_user', JSON.stringify(newUser))
  }

  // Public Invitation fetch effect
  useEffect(() => {
    if (!invitationToken) return

    let cancelled = false

    fetch(`${getApiBaseUrl(null)}/api/invitations/${invitationToken}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (cancelled) return

        if (!res.ok) {
          setInvitationError(data?.message || `Failed to load invitation (${res.status})`)
          return
        }

        if (data?.invitation) {
          setPublicInvitation(data.invitation)
        } else {
          setInvitationError('Invalid invitation data received.')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setInvitationError(err.message || 'Network error loading invitation.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingInvitation(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [invitationToken])

  // Load invitations in Workspace Shell for Admin
  useEffect(() => {
    if ((workspaceView !== 'invitations' && workspaceView !== 'members') || !isWorkspace || !token || workspaceData?.role !== 'admin') {
      return
    }

    let cancelled = false
    setLoadingWorkspaceInvitations(true)

    fetch(`${apiUrl}/api/invitations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!cancelled && res.ok) {
          const data = await res.json()
          setWorkspaceInvitations(data.invitations || [])
        }
      })
      .catch(() => {
        // Handled silently
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWorkspaceInvitations(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [workspaceView, isWorkspace, token, workspaceData?.role, apiUrl])

  const handleSendInvite = async (
    targetEmailOrEvent?: string | React.FormEvent,
    targetRole?: 'agent' | 'admin'
  ) => {
    if (targetEmailOrEvent && typeof targetEmailOrEvent !== 'string' && 'preventDefault' in targetEmailOrEvent) {
      targetEmailOrEvent.preventDefault()
    }
    const finalEmail = typeof targetEmailOrEvent === 'string' ? targetEmailOrEvent : ''
    const finalRole = targetRole || 'agent'

    setInviteError(null)
    setInviteSuccess(null)

    try {
      const res = await fetch(`${apiUrl}/api/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: finalEmail,
          role: finalRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setInviteError(extractErrorMessage(data, 'Failed to create invitation.'))
        return
      }

      setInviteSuccess('Invitation created successfully.')
      if (data.invitation) {
        setWorkspaceInvitations((prev) => {
          if (prev.some((item) => item.id === data.invitation.id)) {
            return prev
          }
          return [data.invitation, ...prev]
        })
      }
    } catch {
      setInviteError('Network error creating invitation.')
    }
  }

  const handleRevokeInvite = async (id: number) => {
    setRevokingId(id)
    try {
      const res = await fetch(`${apiUrl}/api/invitations/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        setWorkspaceInvitations((prev) => prev.filter((inv) => inv.id !== id))
      }
    } catch {
      // Ignored
    } finally {
      setRevokingId(null)
    }
  }

  const loadTeams = async () => {
    if (!token) return
    setLoadingTeams(true)
    setTeamsError(null)
    try {
      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      const data = await res.json()
      if (res.ok && data?.teams) {
        setTeams(data.teams)
      } else {
        setTeamsError(data?.message || 'Failed to load teams.')
      }
    } catch {
      setTeamsError('Network error loading teams.')
    } finally {
      setLoadingTeams(false)
    }
  }

  useEffect(() => {
    if (
      (workspaceView !== 'teams' &&
        workspaceView !== 'team-management' &&
        workspaceView !== 'members' &&
        workspaceView !== 'invitations') ||
      !isWorkspace ||
      !token
    ) {
      return
    }

    let cancelled = false
    setLoadingTeams(true)
    setTeamsError(null)

    fetch(`${apiUrl}/api/teams`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!cancelled) {
          const data = await res.json()
          if (res.ok && data?.teams) {
            setTeams(data.teams)
          } else {
            setTeamsError(data?.message || 'Failed to load teams.')
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeamsError('Network error loading teams.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTeams(false)
        }
      })

    setLoadingMembers(true)
    fetch(`${apiUrl}/api/members`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (data?.members) {
            setOrgMembers(data.members)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoadingMembers(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [workspaceView, isWorkspace, token, apiUrl])

  const rosterMembers = useMemo(() => {
    return orgMembers.map((m) => {
      const memberTeams = teams
        .filter((t) => t.members?.some((tm) => tm.user_id === m.user_id))
        .map((t) => t.name)
      return {
        id: m.id,
        organization_id: m.organization_id,
        user_id: m.user_id,
        role: m.role,
        user: m.user,
        teams: memberTeams,
        joined_date: m.created_at ? new Date(m.created_at).toISOString().split('T')[0] : '2023-01-15',
        status: (m.user_id === user?.id ? 'online' : (m.id % 2 === 0 ? 'online' : 'offline')) as 'online' | 'offline',
      }
    })
  }, [orgMembers, teams, user])

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateTeamError(null)
    setCreateTeamSuccess(null)
    setIsCreatingTeam(true)

    try {
      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: newTeamName,
          description: newTeamDesc || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCreateTeamError(extractErrorMessage(data, 'Failed to create team.'))
        return
      }

      setCreateTeamSuccess('Team created successfully.')
      setNewTeamName('')
      setNewTeamDesc('')
      if (data.team) {
        setTeams((prev) => {
          if (prev.some((t) => t.id === data.team.id)) {
            return prev.map((t) => (t.id === data.team.id ? data.team : t))
          }
          return [...prev, data.team]
        })
      } else {
        loadTeams()
      }
    } catch {
      setCreateTeamError('Network error creating team.')
    } finally {
      setIsCreatingTeam(false)
    }
  }

  const handleStartEditTeam = (team: TeamItem) => {
    setEditingTeamId(team.id)
    setEditTeamName(team.name)
    setEditTeamDesc(team.description || '')
    setUpdateTeamError(null)
  }

  const handleSaveEditTeam = async (teamId: number) => {
    setIsUpdatingTeam(true)
    setUpdateTeamError(null)

    try {
      const res = await fetch(`${apiUrl}/api/teams/${teamId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: editTeamName,
          description: editTeamDesc || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setUpdateTeamError(extractErrorMessage(data, 'Failed to update team.'))
        return
      }

      setEditingTeamId(null)
      if (data.team) {
        setTeams((prev) => prev.map((t) => (t.id === teamId ? data.team : t)))
      } else {
        loadTeams()
      }
    } catch {
      setUpdateTeamError('Network error updating team.')
    } finally {
      setIsUpdatingTeam(false)
    }
  }

  const handleDeleteTeam = async (teamId: number) => {
    setDeletingTeamId(teamId)
    try {
      const res = await fetch(`${apiUrl}/api/teams/${teamId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        setTeams((prev) => prev.filter((t) => t.id !== teamId))
      } else {
        const data = await res.json()
        setTeamActionError((prev) => ({ ...prev, [teamId]: extractErrorMessage(data, 'Failed to delete team.') }))
      }
    } catch {
      setTeamActionError((prev) => ({ ...prev, [teamId]: 'Network error deleting team.' }))
    } finally {
      setDeletingTeamId(null)
    }
  }

  const handleAddMemberToTeam = async (teamId: number) => {
    const selectedOrgMemberId = selectedMemberToAdd[teamId]
    if (!selectedOrgMemberId) return

    setAddingMemberTeamId(teamId)
    setTeamActionError((prev) => ({ ...prev, [teamId]: null }))

    try {
      const res = await fetch(`${apiUrl}/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          organization_member_id: Number(selectedOrgMemberId),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setTeamActionError((prev) => ({ ...prev, [teamId]: extractErrorMessage(data, 'Failed to add member.') }))
        return
      }

      setSelectedMemberToAdd((prev) => ({ ...prev, [teamId]: '' }))
      if (data.team) {
        setTeams((prev) => prev.map((t) => (t.id === teamId ? data.team : t)))
      } else {
        loadTeams()
      }
    } catch {
      setTeamActionError((prev) => ({ ...prev, [teamId]: 'Network error adding member.' }))
    } finally {
      setAddingMemberTeamId(null)
    }
  }

  const handleRemoveMemberFromTeam = async (teamId: number, memberId: number) => {
    const key = `${teamId}-${memberId}`
    setRemovingMemberKey(key)
    setTeamActionError((prev) => ({ ...prev, [teamId]: null }))

    try {
      const res = await fetch(`${apiUrl}/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      const data = await res.json()
      if (!res.ok) {
        setTeamActionError((prev) => ({ ...prev, [teamId]: extractErrorMessage(data, 'Failed to remove member.') }))
        return
      }

      if (data.team) {
        setTeams((prev) => prev.map((t) => (t.id === teamId ? data.team : t)))
      } else {
        loadTeams()
      }
    } catch {
      setTeamActionError((prev) => ({ ...prev, [teamId]: 'Network error removing member.' }))
    } finally {
      setRemovingMemberKey(null)
    }
  }

  const handleAcceptNewUser = async (
    eOrName?: React.FormEvent | string,
    pass?: string,
    conf?: string
  ) => {
    if (eOrName && typeof eOrName !== 'string' && 'preventDefault' in eOrName) {
      eOrName.preventDefault()
    }
    const finalName = typeof eOrName === 'string' ? eOrName : ''
    const finalPassword = pass !== undefined ? pass : ''
    const finalConfirm = conf !== undefined ? conf : ''

    setAcceptError(null)

    if (finalPassword !== finalConfirm) {
      setAcceptError('Passwords do not match.')
      return
    }

    setIsAccepting(true)

    try {
      const res = await fetch(`${getApiBaseUrl(null)}/api/invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: finalName,
          password: finalPassword,
          password_confirmation: finalConfirm,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setAcceptError(extractErrorMessage(data, 'Failed to accept invitation.'))
        return
      }

      if (data.token && data.user) {
        persistSession(data.token, data.user)
      }

      setAcceptSuccess({
        organizationName: data.organization.name,
        role: data.role,
        slug: data.organization.slug,
      })
    } catch {
      setAcceptError('Network error accepting invitation.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleAcceptExistingUser = async (
    eOrPassword?: React.FormEvent | string,
    emailOverride?: string
  ) => {
    if (eOrPassword && typeof eOrPassword !== 'string' && 'preventDefault' in eOrPassword) {
      eOrPassword.preventDefault()
    }
    const finalPassword = typeof eOrPassword === 'string' ? eOrPassword : ''
    const finalEmail = emailOverride || publicInvitation?.email || ''

    setAcceptError(null)
    setIsAccepting(true)

    try {
      const loginRes = await fetch(`${getApiBaseUrl(null)}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: finalEmail,
          password: finalPassword,
        }),
      })

      const loginData = await loginRes.json()

      if (!loginRes.ok) {
        setAcceptError(extractErrorMessage(loginData, 'Login failed.'))
        return
      }

      const authToken = loginData.token
      persistSession(authToken, loginData.user)

      const acceptRes = await fetch(`${getApiBaseUrl(null)}/api/invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      })

      const acceptData = await acceptRes.json()

      if (!acceptRes.ok) {
        setAcceptError(extractErrorMessage(acceptData, 'Failed to accept invitation.'))
        return
      }

      setAcceptSuccess({
        organizationName: acceptData.organization.name,
        role: acceptData.role,
        slug: acceptData.organization.slug,
      })
    } catch {
      setAcceptError('Network error accepting invitation.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleAcceptLoggedIn = async () => {
    setAcceptError(null)
    setIsAccepting(true)

    try {
      const acceptRes = await fetch(`${getApiBaseUrl(null)}/api/invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      const acceptData = await acceptRes.json()

      if (!acceptRes.ok) {
        setAcceptError(extractErrorMessage(acceptData, 'Failed to accept invitation.'))
        return
      }

      setAcceptSuccess({
        organizationName: acceptData.organization.name,
        role: acceptData.role,
        slug: acceptData.organization.slug,
      })
    } catch {
      setAcceptError('Network error accepting invitation.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(`${getApiBaseUrl(null)}/api/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
      } catch {
        // Local cleanup regardless
      }
    }

    setToken(null)
    setUser(null)
    localStorage.removeItem('zeddesk_token')
    localStorage.removeItem('zeddesk_user')
  }

  // --- RENDER PUBLIC INVITATION ACCEPTANCE SCREEN ---
  if (isInvitationRoute) {
    return (
      <PublicInvitationView
        invitation={publicInvitation}
        isLoading={loadingInvitation}
        error={invitationError}
        currentUser={token && user ? user : null}
        acceptSuccess={acceptSuccess}
        acceptError={acceptError}
        isAccepting={isAccepting}
        onAcceptRegister={handleAcceptNewUser}
        onAcceptLogin={handleAcceptExistingUser}
        onAcceptLoggedIn={handleAcceptLoggedIn}
        onLogout={handleLogout}
        onGoToWorkspace={(slug) => {
          window.location.href = getOrganizationUrl(slug, token)
        }}
        onGoToCentralHub={() => {
          window.location.href = getCentralHubUrl()
        }}
      />
    )
  }

  // --- RENDER WORKSPACE SHELL (Subdomain context) ---
  if (isWorkspace) {
    return (
      <WorkspaceShell
        subdomain={subdomain!}
        token={token}
        activeView={workspaceView}
        onNavigate={(view) => {
          if (
            view === 'overview' ||
            view === 'invitations' ||
            view === 'members' ||
            view === 'teams' ||
            view === 'team-management'
          ) {
            setWorkspaceView(view)
          }
        }}
        onLogout={handleLogout}
        onAuthSuccess={persistSession}
      >
        {(workspaceView === 'invitations' || workspaceView === 'members') && (
          <MembersView
            members={rosterMembers}
            pendingInvitations={workspaceInvitations}
            isAdmin={workspaceData?.role === 'admin'}
            isLoadingMembers={loadingMembers}
            isLoadingInvitations={loadingWorkspaceInvitations}
            inviteError={inviteError}
            inviteSuccess={inviteSuccess}
            onInviteSubmit={(email, role) => handleSendInvite(email, role)}
            onRevokeInvite={handleRevokeInvite}
            onCopyInviteLink={(inv) => {
              const link = `${getCentralHubUrl()}/invitations/${inv.token}`
              navigator.clipboard?.writeText?.(link)
              setCopiedId(inv.id)
              setTimeout(() => setCopiedId(null), 2000)
            }}
            revokingId={revokingId}
            copiedId={copiedId}
          />
        )}

            {!loadingWorkspace && workspaceData && workspaceView === 'teams' && (
              <TeamsView
                teams={teams}
                isLoading={loadingTeams}
                error={teamsError}
              />
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'team-management' && workspaceData.role !== 'admin' && (
              <div data-testid="team-management-forbidden" className="bg-surface-subpanel border border-sentiment-negative/30 rounded-xl p-8 text-center">
                <h3 className="text-headline-sm font-headline-sm text-sentiment-negative mb-2">Access Denied</h3>
                <p className="text-body-default text-text-secondary mb-6">
                  Team management is restricted to Administrators.
                </p>
                <button
                  type="button"
                  onClick={() => setWorkspaceView('teams')}
                  className="h-9 px-5 text-label-regular font-label-regular bg-primary-container hover:bg-primary-dark text-white rounded shadow-keylight-primary transition-colors"
                >
                  View Teams
                </button>
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'team-management' && workspaceData.role === 'admin' && (
              <TeamManagementView
                teams={teams}
                orgMembers={orgMembers}
                isLoadingTeams={loadingTeams}
                isLoadingMembers={loadingMembers}
                createSuccess={createTeamSuccess}
                createError={createTeamError}
                newTeamName={newTeamName}
                newTeamDescription={newTeamDesc}
                isCreating={isCreatingTeam}
                editingTeamId={editingTeamId}
                editTeamName={editTeamName}
                editTeamDescription={editTeamDesc}
                isUpdating={isUpdatingTeam}
                updateError={updateTeamError}
                selectedMemberToAdd={selectedMemberToAdd}
                addingMemberTeamId={addingMemberTeamId}
                removingMemberKey={removingMemberKey}
                deletingTeamId={deletingTeamId}
                teamActionError={teamActionError}
                onNameChange={setNewTeamName}
                onDescChange={setNewTeamDesc}
                onCreateSubmit={handleCreateTeam}
                onStartEdit={handleStartEditTeam}
                onEditNameChange={setEditTeamName}
                onEditDescChange={setEditTeamDesc}
                onSaveEdit={handleSaveEditTeam}
                onCancelEdit={() => setEditingTeamId(null)}
                onDelete={handleDeleteTeam}
                onSelectMember={(teamId, value) =>
                  setSelectedMemberToAdd((prev) => ({ ...prev, [teamId]: value }))
                }
                onAddMember={handleAddMemberToTeam}
                onRemoveMember={handleRemoveMemberFromTeam}
              />
            )}

      </WorkspaceShell>
    )
  }
  // --- RENDER CENTRAL HUB (Apex domain context) ---
  return <CentralHubView />
}

export default function App(props: { hostname?: string; pathname?: string; search?: string } = {}) {
  return (
    <SafeQueryProvider>
      <AppInner {...props} />
    </SafeQueryProvider>
  )
}

