import { useEffect, useState, type ReactNode } from 'react'
import { getApiBaseUrl, getCentralHubUrl, getOrganizationUrl, getSubdomain } from './utils/url'

interface HealthStatus {
  status: string
  services: {
    database: string
    redis: string
  }
}

interface User {
  id: number
  name: string
  email: string
}

interface Organization {
  id: number
  name: string
  slug: string
  role: string
}

interface WorkspaceData {
  organization: {
    id: number
    name: string
    slug: string
  }
  user: {
    id: number
    name: string
    email: string
  }
  role: string
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

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#cbd5e1' }}>{label}:</span>
      {children}
    </div>
  )
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

export default function App({
  hostname,
  pathname,
}: {
  hostname?: string
  pathname?: string
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
  const [isExistingUserMode, setIsExistingUserMode] = useState(false)
  const [acceptName, setAcceptName] = useState('')
  const [acceptPassword, setAcceptPassword] = useState('')
  const [acceptPasswordConfirm, setAcceptPasswordConfirm] = useState('')
  const [acceptLoginEmail, setAcceptLoginEmail] = useState('')
  const [acceptLoginPassword, setAcceptLoginPassword] = useState('')

  // Workspace Shell Invitations State
  const [workspaceView, setWorkspaceView] = useState<'overview' | 'invitations' | 'teams' | 'team-management'>('overview')
  const [workspaceInvitations, setWorkspaceInvitations] = useState<InvitationItem[]>([])
  const [loadingWorkspaceInvitations, setLoadingWorkspaceInvitations] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'agent' | 'admin'>('agent')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [isSendingInvite, setIsSendingInvite] = useState(false)
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

  // System Health state (for Central Hub)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(!isWorkspace)
  const [healthError, setHealthError] = useState<string | null>(null)

  // Auth State
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('zeddesk_token'))
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('zeddesk_user')
    return saved ? JSON.parse(saved) : null
  })
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')

  // Form states
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)

  // Organizations State (for Central Hub)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loadingOrgs, setLoadingOrgs] = useState<boolean>(() => !isWorkspace && Boolean(localStorage.getItem('zeddesk_token')))
  const [selectedOrgSlug, setSelectedOrgSlug] = useState<string>('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [createOrgError, setCreateOrgError] = useState<string | null>(null)
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)

  // Workspace Shell State
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null)
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(isWorkspace && Boolean(token))
  const [workspaceError, setWorkspaceError] = useState<{ status: number; message: string } | null>(null)

  // Health check on Central Hub
  useEffect(() => {
    if (isWorkspace) return

    fetch(`${apiUrl}/api/health`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (data && data.services) {
          setHealth(data)
        } else if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        setLoadingHealth(false)
      })
      .catch((err: Error) => {
        setHealthError(err.message)
        setLoadingHealth(false)
      })
  }, [apiUrl, isWorkspace])

  // Load organizations on Central Hub
  useEffect(() => {
    if (isWorkspace || !token) return

    let cancelled = false
    fetch(`${apiUrl}/api/organizations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load organizations (${res.status})`)
        }
        const data: Organization[] = await res.json()
        if (!cancelled) {
          setOrganizations(data)
          if (data.length > 0 && !selectedOrgSlug) {
            setSelectedOrgSlug(data[0].slug)
          }
        }
      })
      .catch(() => {
        // Handled silently
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgs(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiUrl, isWorkspace, token, selectedOrgSlug])

  // Load Tenant Workspace Shell data
  useEffect(() => {
    if (!isWorkspace || !token) return

    let cancelled = false

    fetch(`${apiUrl}/api/workspace`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          if (res.status === 404) {
            setWorkspaceError({ status: 404, message: data.message || 'Organization not found.' })
          } else if (res.status === 403) {
            setWorkspaceError({ status: 403, message: data.message || 'Forbidden. You are not an Organization Member of this Organization.' })
          } else if (res.status === 401) {
            setWorkspaceError({ status: 401, message: data.message || 'Authentication required or session expired.' })
          } else {
            setWorkspaceError({ status: res.status, message: data.message || 'Error loading workspace.' })
          }
          return
        }

        setWorkspaceData(data)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setWorkspaceError({ status: 500, message: err.message || 'Network error loading workspace.' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkspace(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiUrl, isWorkspace, token])

  const persistSession = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('zeddesk_token', newToken)
    localStorage.setItem('zeddesk_user', JSON.stringify(newUser))
    if (!isWorkspace) {
      setLoadingOrgs(true)
    } else {
      setLoadingWorkspace(true)
      setWorkspaceError(null)
    }
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
          setAcceptLoginEmail(data.invitation.email)
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
    if (workspaceView !== 'invitations' || !isWorkspace || !token || workspaceData?.role !== 'admin') {
      return
    }

    let cancelled = false

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

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)
    setIsSendingInvite(true)

    try {
      const res = await fetch(`${apiUrl}/api/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setInviteError(extractErrorMessage(data, 'Failed to create invitation.'))
        return
      }

      setInviteSuccess('Invitation created successfully.')
      setInviteEmail('')
      setInviteRole('agent')
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
    } finally {
      setIsSendingInvite(false)
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
    if ((workspaceView !== 'teams' && workspaceView !== 'team-management') || !isWorkspace || !token) {
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

    if (workspaceData?.role === 'admin') {
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
    }

    return () => {
      cancelled = true
    }
  }, [workspaceView, isWorkspace, token, workspaceData?.role, apiUrl])

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

  const handleAcceptNewUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAcceptError(null)

    if (acceptPassword !== acceptPasswordConfirm) {
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
          name: acceptName,
          password: acceptPassword,
          password_confirmation: acceptPasswordConfirm,
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

  const handleAcceptExistingUser = async (e: React.FormEvent) => {
    e.preventDefault()
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
          email: acceptLoginEmail,
          password: acceptLoginPassword,
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsLoggingIn(true)

    try {
      const loginUrl = `${getApiBaseUrl(null)}/api/login`
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setLoginError(extractErrorMessage(data, 'Login failed'))
        return
      }

      persistSession(data.token, data.user)
      setLoginEmail('')
      setLoginPassword('')
    } catch {
      setLoginError('Network error connecting to API')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)

    if (regPassword !== regPasswordConfirm) {
      setRegError('Passwords do not match')
      return
    }

    setIsRegistering(true)

    try {
      const registerUrl = `${getApiBaseUrl(null)}/api/register`
      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          password_confirmation: regPasswordConfirm,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setRegError(extractErrorMessage(data, 'Registration failed'))
        return
      }

      persistSession(data.token, data.user)
      setRegName('')
      setRegEmail('')
      setRegPassword('')
      setRegPasswordConfirm('')
    } catch {
      setRegError('Network error connecting to API')
    } finally {
      setIsRegistering(false)
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
    setOrganizations([])
    setSelectedOrgSlug('')
    setWorkspaceData(null)
    setWorkspaceError(null)
    localStorage.removeItem('zeddesk_token')
    localStorage.removeItem('zeddesk_user')
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateOrgError(null)
    setIsCreatingOrg(true)

    try {
      const res = await fetch(`${apiUrl}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: orgName,
          slug: orgSlug,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setCreateOrgError(extractErrorMessage(data, 'Creation failed'))
        return
      }

      const newOrg: Organization = {
        id: data.organization.id,
        name: data.organization.name,
        slug: data.organization.slug,
        role: data.role,
      }

      setOrganizations((prev) => [...prev, newOrg])
      setSelectedOrgSlug(newOrg.slug)
      setOrgName('')
      setOrgSlug('')
    } catch {
      setCreateOrgError('Network error creating organization')
    } finally {
      setIsCreatingOrg(false)
    }
  }

  const handleNavigateOrganization = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedOrgSlug) {
      window.location.href = getOrganizationUrl(selectedOrgSlug)
    }
  }

  // --- RENDER PUBLIC INVITATION ACCEPTANCE SCREEN ---
  if (isInvitationRoute) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ZedDesk
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            Organization Invitation
          </p>
        </header>

        <main style={{ maxWidth: '32rem', width: '100%', backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
          {loadingInvitation && (
            <div data-testid="invitation-loading" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
              Loading invitation details...
            </div>
          )}

          {!loadingInvitation && invitationError && (
            <div style={{ textAlign: 'center' }}>
              <div data-testid="invitation-error" style={{ padding: '1rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                {invitationError}
              </div>
              <a
                href={getCentralHubUrl()}
                style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#334155', color: '#e2e8f0', borderRadius: '0.375rem', textDecoration: 'none', fontSize: '0.875rem' }}
              >
                Go to Central Hub
              </a>
            </div>
          )}

          {!loadingInvitation && acceptSuccess && (
            <div data-testid="invitation-accepted-success" style={{ textAlign: 'center' }}>
              <div style={{ padding: '1rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Invitation accepted successfully! You are now an Organization Member of {acceptSuccess.organizationName} with the {acceptSuccess.role} Role.
              </div>
              <a
                href={getOrganizationUrl(acceptSuccess.slug)}
                data-testid="go-to-workspace-btn"
                style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#0284c7', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}
              >
                Go to {acceptSuccess.organizationName} Workspace
              </a>
            </div>
          )}

          {!loadingInvitation && !invitationError && !acceptSuccess && publicInvitation && (
            <div data-testid="invitation-details">
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  Join <span data-testid="invitation-org-name">{publicInvitation.organization_name}</span>
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                  You have been invited to join as an{' '}
                  <strong data-testid="invitation-role" style={{ color: publicInvitation.role === 'admin' ? '#a5b4fc' : '#86efac', textTransform: 'uppercase' }}>
                    {publicInvitation.role}
                  </strong>.
                </p>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#64748b' }}>
                  Invited email: <span data-testid="invitation-email" style={{ color: '#cbd5e1' }}>{publicInvitation.email}</span>
                </div>
              </div>

              {acceptError && (
                <div data-testid="accept-error" style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.375rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                  {acceptError}
                </div>
              )}

              {/* If user is already authenticated */}
              {token && user ? (
                <div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                    Logged in as <strong>{user.name}</strong> ({user.email}).
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                    <button
                      type="button"
                      data-testid="accept-logged-in-btn"
                      onClick={handleAcceptLoggedIn}
                      disabled={isAccepting}
                      style={{ width: '100%', padding: '0.625rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: isAccepting ? 'not-allowed' : 'pointer' }}
                    >
                      {isAccepting ? 'Accepting...' : 'Accept Invitation'}
                    </button>
                    <button
                      type="button"
                      data-testid="invitation-logout-btn"
                      onClick={handleLogout}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}
                    >
                      Switch User / Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Unauthenticated: New User vs Existing User toggle */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #334155', marginBottom: '1.25rem' }}>
                    <button
                      type="button"
                      onClick={() => { setIsExistingUserMode(false); setAcceptError(null) }}
                      style={{ flex: 1, padding: '0.5rem', background: 'none', border: 'none', borderBottom: !isExistingUserMode ? '2px solid #38bdf8' : '2px solid transparent', color: !isExistingUserMode ? '#38bdf8' : '#94a3b8', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      New User (Register)
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-existing-user"
                      onClick={() => { setIsExistingUserMode(true); setAcceptError(null) }}
                      style={{ flex: 1, padding: '0.5rem', background: 'none', border: 'none', borderBottom: isExistingUserMode ? '2px solid #38bdf8' : '2px solid transparent', color: isExistingUserMode ? '#38bdf8' : '#94a3b8', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      Existing User (Sign In)
                    </button>
                  </div>

                  {!isExistingUserMode ? (
                    <form onSubmit={handleAcceptNewUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="accept-name" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Full Name
                        </label>
                        <input
                          id="accept-name"
                          data-testid="accept-name-input"
                          type="text"
                          required
                          value={acceptName}
                          onChange={(e) => setAcceptName(e.target.value)}
                          placeholder="Your Name"
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="accept-password" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Password (min 8 characters)
                        </label>
                        <input
                          id="accept-password"
                          data-testid="accept-password-input"
                          type="password"
                          required
                          value={acceptPassword}
                          onChange={(e) => setAcceptPassword(e.target.value)}
                          placeholder="••••••••"
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="accept-password-confirm" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Confirm Password
                        </label>
                        <input
                          id="accept-password-confirm"
                          data-testid="accept-password-confirm-input"
                          type="password"
                          required
                          value={acceptPasswordConfirm}
                          onChange={(e) => setAcceptPasswordConfirm(e.target.value)}
                          placeholder="••••••••"
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                        />
                      </div>

                      <button
                        type="submit"
                        data-testid="accept-new-user-btn"
                        disabled={isAccepting}
                        style={{ padding: '0.625rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: isAccepting ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
                      >
                        {isAccepting ? 'Registering & Joining...' : 'Register & Accept Invitation'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleAcceptExistingUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="accept-login-email" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Email Address
                        </label>
                        <input
                          id="accept-login-email"
                          data-testid="accept-login-email-input"
                          type="email"
                          required
                          value={acceptLoginEmail}
                          onChange={(e) => setAcceptLoginEmail(e.target.value)}
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="accept-login-password" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Password
                        </label>
                        <input
                          id="accept-login-password"
                          data-testid="accept-login-password-input"
                          type="password"
                          required
                          value={acceptLoginPassword}
                          onChange={(e) => setAcceptLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                        />
                      </div>

                      <button
                        type="submit"
                        data-testid="accept-existing-user-btn"
                        disabled={isAccepting}
                        style={{ padding: '0.625rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: isAccepting ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
                      >
                        {isAccepting ? 'Signing In & Joining...' : 'Sign In & Accept Invitation'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    )
  }

  // --- RENDER WORKSPACE SHELL (Subdomain context) ---
  if (isWorkspace) {
    const isUnauthenticated = !token || workspaceError?.status === 401

    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
        {/* Workspace Shell Top Bar */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ZedDesk
            </span>
            <span style={{ color: '#64748b', fontSize: '1.25rem' }}>/</span>
            {workspaceData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 data-testid="workspace-org-name" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  {workspaceData.organization.name}
                </h1>
                <span data-testid="workspace-slug" style={{ backgroundColor: '#334155', color: '#94a3b8', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>
                  {workspaceData.organization.slug}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '1.125rem', color: '#94a3b8' }}>
                Workspace ({subdomain})
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {workspaceData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
                <span data-testid="workspace-user-name" style={{ fontWeight: 600 }}>{workspaceData.user.name}</span>
                <span data-testid="workspace-user-email" style={{ color: '#94a3b8' }}>({workspaceData.user.email})</span>
                <span data-testid="workspace-user-role" style={{ backgroundColor: workspaceData.role === 'admin' ? '#312e81' : '#14532d', color: workspaceData.role === 'admin' ? '#a5b4fc' : '#86efac', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  {workspaceData.role}
                </span>
              </div>
            )}
            <a
              href={getCentralHubUrl()}
              data-testid="central-hub-link"
              style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}
            >
              Central Hub
            </a>
            {token && (
              <button
                type="button"
                onClick={handleLogout}
                data-testid="workspace-logout-btn"
                style={{ padding: '0.375rem 0.75rem', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Log Out
              </button>
            )}
          </div>
        </header>

        {/* Workspace Shell Body */}
        <div style={{ display: 'flex', flex: 1 }}>
          {/* Workspace Shell Sidebar / Navigation */}
          {workspaceData && (
            <aside style={{ width: '16rem', backgroundColor: '#1e293b', borderRight: '1px solid #334155', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <nav aria-label="Workspace Navigation" data-testid="workspace-nav" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                    Workspace
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <button
                      type="button"
                      data-testid="nav-tickets"
                      onClick={() => setWorkspaceView('overview')}
                      style={{ textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: workspaceView === 'overview' ? '#0284c7' : 'transparent', color: workspaceView === 'overview' ? 'white' : '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      Tickets
                    </button>
                    <button
                      type="button"
                      data-testid="nav-teams"
                      onClick={() => setWorkspaceView('teams')}
                      style={{ textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: workspaceView === 'teams' ? '#0284c7' : 'transparent', color: workspaceView === 'teams' ? 'white' : '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      Teams
                    </button>
                  </div>
                </div>

                {/* Role-Aware Administrative Sections (Rendered ONLY if role is admin) */}
                {workspaceData.role === 'admin' && (
                  <div data-testid="nav-admin-section">
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                      Administration
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <button
                        type="button"
                        data-testid="nav-org-settings"
                        style={{ textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: 'transparent', color: '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                      >
                        Organization Settings
                      </button>
                      <button
                        type="button"
                        data-testid="nav-invitations"
                        onClick={() => setWorkspaceView('invitations')}
                        style={{ textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: workspaceView === 'invitations' ? '#0284c7' : 'transparent', color: workspaceView === 'invitations' ? 'white' : '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                      >
                        Member Invitations
                      </button>
                      <button
                        type="button"
                        data-testid="nav-team-management"
                        onClick={() => setWorkspaceView('team-management')}
                        style={{ textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: workspaceView === 'team-management' ? '#0284c7' : 'transparent', color: workspaceView === 'team-management' ? 'white' : '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                      >
                        Team Management
                      </button>
                    </div>
                  </div>
                )}
              </nav>
            </aside>
          )}

          {/* Workspace Shell Main Content Area */}
          <main style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {loadingWorkspace && (
              <div data-testid="workspace-loading" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Loading workspace...
              </div>
            )}

            {!loadingWorkspace && isUnauthenticated && (
              <div style={{ maxWidth: '32rem', margin: '2rem auto', width: '100%' }}>
                <div data-testid="workspace-unauthenticated" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#f8fafc' }}>Authentication Required</h2>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    You must be logged in to access the <strong>{subdomain}</strong> workspace.
                  </p>
                  <a
                    href={getCentralHubUrl()}
                    data-testid="login-redirect-btn"
                    style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#0284c7', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    Log In at Central Hub
                  </a>
                </div>
              </div>
            )}

            {!loadingWorkspace && !isUnauthenticated && workspaceError && (
              <div style={{ maxWidth: '32rem', margin: '2rem auto', width: '100%' }}>
                {workspaceError.status === 403 && (
                  <div data-testid="workspace-403" style={{ backgroundColor: '#1e293b', border: '1px solid #7f1d1d', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.25rem', color: '#f87171', marginTop: 0 }}>Access Denied</h2>
                    <p style={{ color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                      You are not an Organization Member of this Organization.
                    </p>
                    <a
                      href={getCentralHubUrl()}
                      style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}
                    >
                      Return to Central Hub
                    </a>
                  </div>
                )}

                {workspaceError.status === 404 && (
                  <div data-testid="workspace-404" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.25rem', color: '#f87171', marginTop: 0 }}>Organization Not Found</h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                      The organization subdomain <strong>{subdomain}</strong> does not exist.
                    </p>
                    <a
                      href={getCentralHubUrl()}
                      style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}
                    >
                      Return to Central Hub
                    </a>
                  </div>
                )}
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'invitations' && (
              <div data-testid="invitations-manager" style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Organization Member Invitations
                  </h2>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                    Invite new colleagues to join {workspaceData.organization.name} as Admins or Agents.
                  </p>
                </div>

                {/* Invite Creation Form */}
                <div style={{ backgroundColor: '#0f172a', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                    Invite Organization Member
                  </h3>

                  {inviteSuccess && (
                    <div data-testid="invite-success" style={{ padding: '0.75rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                      {inviteSuccess}
                    </div>
                  )}

                  {inviteError && (
                    <div data-testid="invite-error" style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                      {inviteError}
                    </div>
                  )}

                  <form data-testid="invite-form" onSubmit={handleSendInvite} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2, minWidth: '15rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <label htmlFor="invite-email" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                        Email Address
                      </label>
                      <input
                        id="invite-email"
                        data-testid="invite-email-input"
                        type="email"
                        required
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '8rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <label htmlFor="invite-role" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                        Role
                      </label>
                      <select
                        id="invite-role"
                        data-testid="invite-role-select"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'agent' | 'admin')}
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      data-testid="invite-submit-btn"
                      disabled={isSendingInvite}
                      style={{ padding: '0.5rem 1.25rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: isSendingInvite ? 'not-allowed' : 'pointer', height: '2.5rem' }}
                    >
                      {isSendingInvite ? 'Sending...' : 'Send Invitation'}
                    </button>
                  </form>
                </div>

                {/* Pending Invitations List */}
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                    Pending Invitations ({workspaceInvitations.length})
                  </h3>

                  {loadingWorkspaceInvitations ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading invitations...</div>
                  ) : workspaceInvitations.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.875rem', fontStyle: 'italic' }}>
                      No pending invitations.
                    </div>
                  ) : (
                    <div data-testid="invitations-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {workspaceInvitations.map((inv) => (
                        <div
                          key={inv.id}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#0f172a', borderRadius: '0.5rem', border: '1px solid #334155', flexWrap: 'wrap', gap: '0.75rem' }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, color: '#f8fafc' }}>{inv.email}</span>
                              <span style={{ backgroundColor: inv.role === 'admin' ? '#312e81' : '#14532d', color: inv.role === 'admin' ? '#a5b4fc' : '#86efac', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                {inv.role}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                              Expires: {new Date(inv.expires_at).toLocaleDateString()}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Token:</span>
                              <code data-testid={`invitation-token-${inv.id}`} style={{ fontSize: '0.75rem', color: '#38bdf8', backgroundColor: '#1e293b', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>
                                {inv.token}
                              </code>
                              <button
                                type="button"
                                data-testid={`copy-invitation-link-${inv.id}`}
                                onClick={() => {
                                  const link = `${getCentralHubUrl()}/invitations/${inv.token}`
                                  navigator.clipboard?.writeText?.(link)
                                  setCopiedId(inv.id)
                                  setTimeout(() => setCopiedId(null), 2000)
                                }}
                                style={{ background: 'none', border: '1px solid #475569', color: copiedId === inv.id ? '#34d399' : '#94a3b8', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer' }}
                              >
                                {copiedId === inv.id ? 'Copied Link!' : 'Copy Link'}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`revoke-invitation-btn-${inv.id}`}
                            onClick={() => handleRevokeInvite(inv.id)}
                            disabled={revokingId === inv.id}
                            style={{ padding: '0.375rem 0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, cursor: revokingId === inv.id ? 'not-allowed' : 'pointer' }}
                          >
                            {revokingId === inv.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'teams' && (
              <div data-testid="teams-view" style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                      Teams
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                      Functional teams within {workspaceData.organization.name} for ticket routing and agent collaboration.
                    </p>
                  </div>
                  {workspaceData.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setWorkspaceView('team-management')}
                      style={{ padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Manage Teams
                    </button>
                  )}
                  {workspaceData.role === 'agent' && (
                    <span style={{ backgroundColor: '#14532d', color: '#86efac', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700 }}>
                      Agent View (Read-Only)
                    </span>
                  )}
                </div>

                {loadingTeams ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    Loading teams...
                  </div>
                ) : teamsError ? (
                  <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    {teamsError}
                  </div>
                ) : teams.length === 0 ? (
                  <div data-testid="no-teams-message" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                    <p style={{ fontSize: '1rem', margin: 0 }}>No teams configured in this organization.</p>
                  </div>
                ) : (
                  <div data-testid="teams-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        data-testid={`team-card-${team.id}`}
                        style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
                      >
                        <div>
                          <h3 data-testid={`team-name-${team.id}`} style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: '#f8fafc' }}>
                            {team.name}
                          </h3>
                          <p data-testid={`team-description-${team.id}`} style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                            {team.description || 'No description provided'}
                          </p>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                            Members ({team.members?.length || 0})
                          </div>
                          <div data-testid={`team-members-list-${team.id}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {(!team.members || team.members.length === 0) ? (
                              <span data-testid={`team-no-members-${team.id}`} style={{ color: '#64748b', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                                No members assigned
                              </span>
                            ) : (
                              team.members.map((member) => (
                                <div
                                  key={member.id}
                                  data-testid={`team-member-${team.id}-${member.id}`}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#1e293b', border: '1px solid #334155', padding: '0.35rem 0.65rem', borderRadius: '0.375rem', fontSize: '0.8125rem' }}
                                >
                                  <span style={{ fontWeight: 500, color: '#f8fafc' }}>{member.user?.name || `Member #${member.id}`}</span>
                                  <span style={{ color: '#94a3b8' }}>({member.user?.email || 'N/A'})</span>
                                  <span style={{ backgroundColor: member.role === 'admin' ? '#312e81' : '#14532d', color: member.role === 'admin' ? '#a5b4fc' : '#86efac', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    {member.role}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'team-management' && workspaceData.role !== 'admin' && (
              <div data-testid="team-management-forbidden" style={{ backgroundColor: '#1e293b', border: '1px solid #7f1d1d', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.25rem', color: '#f87171', marginTop: 0 }}>Access Denied</h3>
                <p style={{ color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  Team management is restricted to Administrators.
                </p>
                <button
                  type="button"
                  onClick={() => setWorkspaceView('teams')}
                  style={{ padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  View Teams
                </button>
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'team-management' && workspaceData.role === 'admin' && (
              <div data-testid="team-management-view" style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Team Management
                  </h2>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                    Create and manage functional teams and assign organization members.
                  </p>
                </div>

                {/* Team Creation Form */}
                <div style={{ backgroundColor: '#0f172a', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                    Create New Team
                  </h3>

                  {createTeamSuccess && (
                    <div data-testid="team-create-success" style={{ padding: '0.75rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                      {createTeamSuccess}
                    </div>
                  )}

                  {createTeamError && (
                    <div data-testid="team-create-error" style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                      {createTeamError}
                    </div>
                  )}

                  <form data-testid="create-team-form" onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '15rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="team-name" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Team Name
                        </label>
                        <input
                          id="team-name"
                          data-testid="team-name-input"
                          type="text"
                          required
                          placeholder="e.g. Tier 1 Support"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                        />
                      </div>

                      <div style={{ flex: 2, minWidth: '18rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <label htmlFor="team-desc" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                          Description
                        </label>
                        <input
                          id="team-desc"
                          data-testid="team-description-input"
                          type="text"
                          placeholder="Team responsibilities or scope"
                          value={newTeamDesc}
                          onChange={(e) => setNewTeamDesc(e.target.value)}
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                        />
                      </div>
                    </div>

                    <div>
                      <button
                        type="submit"
                        data-testid="team-create-submit"
                        disabled={isCreatingTeam}
                        style={{ padding: '0.5rem 1.25rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: isCreatingTeam ? 'not-allowed' : 'pointer' }}
                      >
                        {isCreatingTeam ? 'Creating...' : 'Create Team'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Teams List and Member Assignment */}
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                    Active Teams
                  </h3>

                  {loadingTeams ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      Loading teams...
                    </div>
                  ) : teams.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No teams created yet.</p>
                  ) : (
                    <div data-testid="manage-teams-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {teams.map((team) => (
                        <div
                          key={team.id}
                          data-testid={`team-card-${team.id}`}
                          style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
                        >
                          {/* Team Info / Edit Mode */}
                          {editingTeamId === team.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.375rem' }}>
                              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#93c5fd' }}>Edit Team</h4>
                              {updateTeamError && (
                                <div style={{ color: '#fca5a5', fontSize: '0.8125rem' }}>{updateTeamError}</div>
                              )}
                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <input
                                  type="text"
                                  data-testid={`edit-team-name-input-${team.id}`}
                                  value={editTeamName}
                                  onChange={(e) => setEditTeamName(e.target.value)}
                                  placeholder="Team Name"
                                  style={{ flex: 1, minWidth: '12rem', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '0.875rem' }}
                                />
                                <input
                                  type="text"
                                  data-testid={`edit-team-desc-input-${team.id}`}
                                  value={editTeamDesc}
                                  onChange={(e) => setEditTeamDesc(e.target.value)}
                                  placeholder="Team Description"
                                  style={{ flex: 2, minWidth: '15rem', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '0.875rem' }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  data-testid={`save-team-btn-${team.id}`}
                                  onClick={() => handleSaveEditTeam(team.id)}
                                  disabled={isUpdatingTeam}
                                  style={{ padding: '0.35rem 0.75rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8125rem', fontWeight: 600, cursor: isUpdatingTeam ? 'not-allowed' : 'pointer' }}
                                >
                                  {isUpdatingTeam ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`cancel-edit-team-btn-${team.id}`}
                                  onClick={() => setEditingTeamId(null)}
                                  style={{ padding: '0.35rem 0.75rem', backgroundColor: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '0.25rem', fontSize: '0.8125rem', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                              <div>
                                <h4 data-testid={`team-name-${team.id}`} style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: '#f8fafc' }}>
                                  {team.name}
                                </h4>
                                <p data-testid={`team-description-${team.id}`} style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                                  {team.description || 'No description provided'}
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  data-testid={`edit-team-btn-${team.id}`}
                                  onClick={() => handleStartEditTeam(team)}
                                  style={{ padding: '0.35rem 0.75rem', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  data-testid={`delete-team-btn-${team.id}`}
                                  onClick={() => handleDeleteTeam(team.id)}
                                  disabled={deletingTeamId === team.id}
                                  style={{ padding: '0.35rem 0.75rem', backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: deletingTeamId === team.id ? 'not-allowed' : 'pointer' }}
                                >
                                  {deletingTeamId === team.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Member Assignment Section */}
                          <div style={{ borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                              Assigned Members
                            </div>

                            {teamActionError[team.id] && (
                              <div data-testid={`member-action-error-${team.id}`} style={{ padding: '0.5rem', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '0.25rem', marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
                                {teamActionError[team.id]}
                              </div>
                            )}

                            {/* Members List */}
                            <div data-testid={`team-members-list-${team.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                              {(!team.members || team.members.length === 0) ? (
                                <span data-testid={`team-no-members-${team.id}`} style={{ color: '#64748b', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                                  No members assigned
                                </span>
                              ) : (
                                team.members.map((member) => (
                                  <div
                                    key={member.id}
                                    data-testid={`team-member-${team.id}-${member.id}`}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', border: '1px solid #334155', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ fontWeight: 500, color: '#f8fafc' }}>{member.user?.name || `Member #${member.id}`}</span>
                                      <span style={{ color: '#94a3b8' }}>({member.user?.email || 'N/A'})</span>
                                      <span style={{ backgroundColor: member.role === 'admin' ? '#312e81' : '#14532d', color: member.role === 'admin' ? '#a5b4fc' : '#86efac', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                        {member.role}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      data-testid={`remove-member-btn-${team.id}-${member.id}`}
                                      onClick={() => handleRemoveMemberFromTeam(team.id, member.id)}
                                      disabled={removingMemberKey === `${team.id}-${member.id}`}
                                      style={{ padding: '0.2rem 0.5rem', backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: removingMemberKey === `${team.id}-${member.id}` ? 'not-allowed' : 'pointer' }}
                                    >
                                      {removingMemberKey === `${team.id}-${member.id}` ? 'Removing...' : 'Remove'}
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Add Member Dropdown */}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <select
                                data-testid={`add-member-select-${team.id}`}
                                value={selectedMemberToAdd[team.id] || ''}
                                onChange={(e) => setSelectedMemberToAdd((prev) => ({ ...prev, [team.id]: e.target.value }))}
                                style={{ flex: 1, minWidth: '15rem', padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc', fontSize: '0.8125rem' }}
                              >
                                <option value="">{loadingMembers ? 'Loading members...' : 'Select Organization Member to add...'}</option>
                                {orgMembers
                                  .filter((m) => !team.members?.some((tm) => tm.id === m.id))
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.user?.name || `Member #${m.id}`} ({m.user?.email || 'N/A'}) - {m.role.toUpperCase()}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                data-testid={`add-member-btn-${team.id}`}
                                onClick={() => handleAddMemberToTeam(team.id)}
                                disabled={!selectedMemberToAdd[team.id] || addingMemberTeamId === team.id}
                                style={{ padding: '0.4rem 0.85rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: (!selectedMemberToAdd[team.id] || addingMemberTeamId === team.id) ? 'not-allowed' : 'pointer' }}
                              >
                                {addingMemberTeamId === team.id ? 'Adding...' : 'Add Member'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loadingWorkspace && workspaceData && workspaceView === 'overview' && (
              <div style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', border: '1px solid #334155' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
                  Welcome to {workspaceData.organization.name}
                </h2>
                <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>
                  Active tenant context established. You are currently operating with the role of{' '}
                  <strong style={{ color: workspaceData.role === 'admin' ? '#a5b4fc' : '#86efac' }}>
                    {workspaceData.role.toUpperCase()}
                  </strong>.
                </p>
                <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#0f172a', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Tenant Isolation Status:</div>
                  <div style={{ fontWeight: 600, color: '#34d399', marginTop: '0.25rem' }}>
                    Row-Level Database Scoping Active ({workspaceData.organization.slug})
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    )
  }

  // --- RENDER CENTRAL HUB (Apex domain context) ---
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ZedDesk
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginTop: '0.5rem' }}>
          Multi-tenant AI-Powered Helpdesk
        </p>
      </header>

      <div style={{ maxWidth: '40rem', width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Central Hub Main Content */}
        {!token || !user ? (
          <main style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
            <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid #334155', marginBottom: '1.5rem' }}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'login'}
                onClick={() => { setActiveTab('login'); setLoginError(null); setRegError(null) }}
                style={{ flex: 1, padding: '0.75rem', fontWeight: 600, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeTab === 'login' ? '2px solid #38bdf8' : '2px solid transparent', color: activeTab === 'login' ? '#38bdf8' : '#94a3b8', cursor: 'pointer' }}
              >
                Log In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'register'}
                onClick={() => { setActiveTab('register'); setLoginError(null); setRegError(null) }}
                style={{ flex: 1, padding: '0.75rem', fontWeight: 600, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeTab === 'register' ? '2px solid #38bdf8' : '2px solid transparent', color: activeTab === 'register' ? '#38bdf8' : '#94a3b8', cursor: 'pointer' }}
              >
                Register
              </button>
            </div>

            {activeTab === 'login' ? (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Central Hub Login</h2>
                {loginError && (
                  <div style={{ backgroundColor: '#7f1d1d', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    {loginError}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="login-email" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Email</label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="login-password" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Password</label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  style={{ marginTop: '0.5rem', padding: '0.625rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isLoggingIn ? 'Logging in...' : 'Log In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>User Registration</h2>
                {regError && (
                  <div style={{ backgroundColor: '#7f1d1d', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    {regError}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="reg-name" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Name</label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="reg-email" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Email</label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="reg-password" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Password</label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="reg-password-confirm" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Confirm Password</label>
                  <input
                    id="reg-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={regPasswordConfirm}
                    onChange={(e) => setRegPasswordConfirm(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRegistering}
                  style={{ marginTop: '0.5rem', padding: '0.625rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isRegistering ? 'Registering...' : 'Register'}
                </button>
              </form>
            )}
          </main>
        ) : (
          <main style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '1rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Logged in as <strong style={{ color: '#f8fafc' }}>{user.name}</strong> ({user.email})</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                style={{ padding: '0.375rem 0.75rem', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Log Out
              </button>
            </div>

            {/* Organization Selection Form */}
            {organizations.length > 0 && (
              <form onSubmit={handleNavigateOrganization} style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '0.5rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Select Organization</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <label htmlFor="org-select" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Organization:</label>
                  <select
                    id="org-select"
                    value={selectedOrgSlug}
                    onChange={(e) => setSelectedOrgSlug(e.target.value)}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc', fontSize: '0.875rem' }}
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.slug}>
                        {org.name} ({org.slug}) - {org.role.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    style={{ padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
                  >
                    Navigate to Subdomain
                  </button>
                </div>
              </form>
            )}

            {/* Organizations List / Overview */}
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Your Organizations
              </h2>
              {loadingOrgs ? (
                <p style={{ color: '#94a3b8' }}>Loading organizations...</p>
              ) : organizations.length === 0 ? (
                <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  No Organization Memberships found. Create one below to get started.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {organizations.map((org) => (
                    <div
                      key={org.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#0f172a', borderRadius: '0.5rem', border: '1px solid #334155' }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{org.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{getOrganizationUrl(org.slug).replace(/^https?:\/\//, '')}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ backgroundColor: org.role === 'admin' ? '#312e81' : '#14532d', color: org.role === 'admin' ? '#a5b4fc' : '#86efac', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                          {org.role}
                        </span>
                        <a
                          href={getOrganizationUrl(org.slug)}
                          style={{ padding: '0.375rem 0.75rem', backgroundColor: '#0284c7', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}
                        >
                          Open Organization
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create Organization Form */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                Create Organization
              </h3>
              {createOrgError && (
                <div style={{ backgroundColor: '#7f1d1d', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {createOrgError}
                </div>
              )}
              <form onSubmit={handleCreateOrganization} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="org-name" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Organization Name</label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    placeholder="Acme Corporation"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <label htmlFor="org-slug" style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Subdomain Slug</label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      id="org-slug"
                      type="text"
                      required
                      placeholder="acme"
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value.toLowerCase())}
                      style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.375rem 0 0 0.375rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f8fafc' }}
                    />
                    <span style={{ padding: '0.5rem 0.75rem', backgroundColor: '#334155', color: '#94a3b8', borderRadius: '0 0.375rem 0.375rem 0', border: '1px solid #475569', borderLeft: 'none', fontSize: '0.875rem' }}>
                      .{typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost'}{typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ''}
                    </span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingOrg}
                  style={{ alignSelf: 'flex-start', padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isCreatingOrg ? 'Creating...' : 'Create Organization'}
                </button>
              </form>
            </div>
          </main>
        )}

        {/* System Baseline Status */}
        <section style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem', color: '#94a3b8' }}>
            System Baseline Status
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <StatusRow label="Frontend">
              <span style={{ backgroundColor: '#064e3b', color: '#34d399', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="frontend-status">
                Operational
              </span>
            </StatusRow>

            <StatusRow label="Backend API">
              {loadingHealth ? (
                <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Checking...</span>
              ) : healthError ? (
                <span style={{ backgroundColor: '#7f1d1d', color: '#f87171', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="backend-status">
                  Unavailable ({healthError})
                </span>
              ) : (
                <span style={{ backgroundColor: health?.status === 'ok' ? '#064e3b' : '#78350f', color: health?.status === 'ok' ? '#34d399' : '#fbbf24', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="backend-status">
                  {health?.status.toUpperCase()}
                </span>
              )}
            </StatusRow>

            <StatusRow label="Database">
              <span style={{ color: health?.services.database === 'connected' ? '#34d399' : '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }} data-testid="db-status">
                {health ? health.services.database : 'Waiting for API'}
              </span>
            </StatusRow>

            <StatusRow label="Redis Cache">
              <span style={{ color: health?.services.redis === 'connected' ? '#34d399' : '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }} data-testid="redis-status">
                {health ? health.services.redis : 'Waiting for API'}
              </span>
            </StatusRow>
          </div>
        </section>
      </div>
    </div>
  )
}
