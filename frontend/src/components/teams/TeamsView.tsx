import React, { useState, useContext, useMemo } from 'react'
import { Plus, Users2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import apiClient from '../../lib/api-client'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Team, OrganizationMember } from './types'
import { TeamsTabularLedger } from './TeamsTabularLedger'
import { TeamInspectorModal } from './TeamInspectorModal'
import { CreateTeamModal } from './CreateTeamModal'
import { EditTeamModal } from './EditTeamModal'
import { DeleteTeamModal } from './DeleteTeamModal'

export interface TeamsViewProps {
  readonly teams: Team[]
  readonly orgMembers?: OrganizationMember[]
  readonly isAdmin?: boolean
  readonly isLoading?: boolean
  readonly error?: string | null
  readonly onCreateTeam?: (data: { name: string; description?: string }) => Promise<void> | void
  readonly isCreating?: boolean
  readonly createError?: string | null
  readonly createSuccess?: string | null
  readonly onSaveEdit?: (teamId: number, data?: { name: string; description?: string }) => Promise<void> | void
  readonly isUpdating?: boolean
  readonly updateError?: string | null
  readonly onDelete?: (teamId: number) => Promise<void> | void
  readonly onAssignMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly onRemoveMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly className?: string
  // Legacy compatibility props (safely ignored)
  readonly editingTeamId?: number | null
  readonly editTeamName?: string
  readonly editTeamDescription?: string
  readonly deletingTeamId?: number | null
  readonly selectedMemberToAdd?: Record<number, string>
  readonly addingMemberTeamId?: number | null
  readonly removingMemberKey?: string | null
  readonly teamActionError?: Record<number, string | null>
  readonly onEditNameChange?: (v: string) => void
  readonly onEditDescChange?: (v: string) => void
  readonly onStartEdit?: (team: Team) => void
  readonly onCancelEdit?: () => void
  readonly onSelectMember?: (teamId: number, value: string) => void
  readonly onAddMember?: (teamId: number, memberId?: number) => Promise<void> | void
}

export const TeamsView: React.FC<TeamsViewProps> = ({
  teams,
  orgMembers = [],
  isAdmin,
  isLoading = false,
  error,
  onCreateTeam,
  isCreating = false,
  createError: propCreateError,
  createSuccess: propCreateSuccess,
  onSaveEdit,
  isUpdating = false,
  updateError: propUpdateError,
  onDelete,
  onAssignMember,
  onRemoveMember,
  onAddMember,
  className = '',
}) => {
  const shellContext = useContext(WorkspaceShellContext)
  const queryClient = useQueryClient()

  const effectiveIsAdmin =
    isAdmin !== undefined
      ? isAdmin
      : (shellContext?.role || '').toLowerCase() === 'admin'

  // Optimistic tracking without props-to-state useEffect synchronization
  const [removedMemberKeys, setRemovedMemberKeys] = useState<Set<string>>(new Set())
  const [deletedTeamIds, setDeletedTeamIds] = useState<Set<number>>(new Set())

  const displayTeams = useMemo(() => {
    return teams
      .filter((t) => !deletedTeamIds.has(t.id))
      .map((t) => ({
        ...t,
        members: (t.members || []).filter((m) => !removedMemberKeys.has(`${t.id}-${m.id}`)),
      }))
  }, [teams, deletedTeamIds, removedMemberKeys])

  // 1. Create Team Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // 2. Team Inspector Modal State (Subledger + Autocomplete)
  const [inspectingTeam, setInspectingTeam] = useState<Team | null>(null)
  const [isAssigningMemberId, setIsAssigningMemberId] = useState<number | null>(null)
  const [isDetachingMemberId, setIsDetachingMemberId] = useState<number | null>(null)
  const [inspectorError, setInspectorError] = useState<string | null>(null)

  // 3. Edit Team Modal State (Modal-driven update)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // 4. Delete Team Modal State
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null)
  const [isDeletingTeam, setIsDeletingTeam] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Active inspecting team synced with displayTeams
  const activeInspectingTeam = useMemo(() => {
    if (!inspectingTeam) return null
    return displayTeams.find((t) => t.id === inspectingTeam.id) || inspectingTeam
  }, [inspectingTeam, displayTeams])

  // Handlers
  const handleCreateTeamSubmit = async (data: { name: string; description?: string }) => {
    setCreateError(null)
    setIsSubmittingCreate(true)

    try {
      if (onCreateTeam) {
        await onCreateTeam(data)
      } else {
        await apiClient.post('/api/teams', data)
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setIsCreateModalOpen(false)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to create team.'
      setCreateError(msg)
      throw err
    } finally {
      setIsSubmittingCreate(false)
    }
  }

  const handleEditTeamSubmit = async (teamId: number, data: { name: string; description?: string }) => {
    setEditError(null)
    setIsSubmittingEdit(true)

    try {
      if (onSaveEdit) {
        await onSaveEdit(teamId, data)
      } else {
        await apiClient.put(`/api/teams/${teamId}`, data)
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setEditingTeam(null)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to update team.'
      setEditError(msg)
      throw err
    } finally {
      setIsSubmittingEdit(false)
    }
  }

  const handleDeleteTeamConfirm = async (teamId: number) => {
    setIsDeletingTeam(true)
    setDeleteError(null)

    // Optimistically mark deleted in local derived view
    setDeletedTeamIds((prev) => new Set(prev).add(teamId))

    try {
      if (onDelete) {
        await onDelete(teamId)
      } else {
        await apiClient.delete(`/api/teams/${teamId}`)
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setDeletingTeam(null)
    } catch (err: unknown) {
      // Rollback optimistic delete
      setDeletedTeamIds((prev) => {
        const next = new Set(prev)
        next.delete(teamId)
        return next
      })
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to delete team.'
      setDeleteError(msg)
    } finally {
      setIsDeletingTeam(false)
    }
  }

  const handleAssignMemberSubmit = async (teamId: number, memberId: number) => {
    setIsAssigningMemberId(memberId)
    setInspectorError(null)

    try {
      if (onAssignMember) {
        await onAssignMember(teamId, memberId)
      } else if (onAddMember) {
        await onAddMember(teamId, memberId)
      } else {
        await apiClient.post(`/api/teams/${teamId}/members`, {
          organization_member_id: memberId,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to assign member to team.'
      setInspectorError(msg)
      throw err
    } finally {
      setIsAssigningMemberId(null)
    }
  }

  const handleDetachMemberSubmit = async (teamId: number, memberId: number) => {
    const key = `${teamId}-${memberId}`
    setIsDetachingMemberId(memberId)
    setInspectorError(null)

    // Optimistic detachment in local derived view
    setRemovedMemberKeys((prev) => new Set(prev).add(key))

    try {
      if (onRemoveMember) {
        await onRemoveMember(teamId, memberId)
      } else {
        await apiClient.delete(`/api/teams/${teamId}/members/${memberId}`)
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err: unknown) {
      // Rollback optimistic removal
      setRemovedMemberKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to detach member from team.'
      setInspectorError(msg)
      throw err
    } finally {
      setIsDetachingMemberId(null)
    }
  }

  return (
    <div data-testid="teams-view" className={`flex flex-col gap-6 ${className}`}>
      {/* View Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-5 border-b border-border-subtle">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2
              data-testid="teams-view-title"
              className="text-headline-md font-headline-md text-text-primary"
            >
              Teams &amp; Routing
            </h2>
            <div
              data-testid="teams-stats"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-subpanel border border-border-subtle text-xs text-text-secondary select-none"
            >
              <Users2 className="w-3.5 h-3.5 text-accent-glow" />
              <span>Teams:</span>
              <span className="font-mono tabular-nums font-semibold text-text-primary font-['JetBrains_Mono',monospace]">
                {displayTeams.length}
              </span>
            </div>
          </div>
          <p className="text-body-default font-body-default text-text-secondary">
            Functional teams for ticket routing and agent collaboration.
          </p>
        </div>

        {/* Strict RBAC: "+ Create Team" action button completely omitted for agents */}
        {effectiveIsAdmin ? (
          <Button
            type="button"
            data-testid="create-team-btn"
            variant="amber"
            size="compact"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
            className="gap-1.5 font-semibold"
          >
            + Create Team
          </Button>
        ) : (
          <Badge variant="positive">Agent View — Read-Only</Badge>
        )}
      </div>

      {/* Strict RBAC: Create Compound Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <CreateTeamModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false)
            setCreateError(null)
          }}
          onSubmit={handleCreateTeamSubmit}
          isSubmitting={isSubmittingCreate || isCreating}
          error={createError || propCreateError}
          success={propCreateSuccess}
        />
      )}

      {/* Team Inspector Modal (Subledger of assigned members + Autocomplete search of unassigned members) */}
      <TeamInspectorModal
        isOpen={Boolean(activeInspectingTeam)}
        onClose={() => {
          setInspectingTeam(null)
          setInspectorError(null)
        }}
        team={activeInspectingTeam}
        orgMembers={orgMembers}
        isAdmin={effectiveIsAdmin}
        onDetachMember={handleDetachMemberSubmit}
        onAssignMember={handleAssignMemberSubmit}
        isDetachingId={isDetachingMemberId}
        isAssigningId={isAssigningMemberId}
        error={inspectorError}
      />

      {/* Strict RBAC: Edit Team Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <EditTeamModal
          isOpen={Boolean(editingTeam)}
          onClose={() => {
            setEditingTeam(null)
            setEditError(null)
          }}
          team={editingTeam}
          onSave={handleEditTeamSubmit}
          isSaving={isSubmittingEdit || isUpdating}
          error={editError || propUpdateError}
        />
      )}

      {/* Strict RBAC: Delete Team Compound Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <DeleteTeamModal
          isOpen={Boolean(deletingTeam)}
          onClose={() => {
            setDeletingTeam(null)
            setDeleteError(null)
          }}
          team={deletingTeam}
          onConfirm={handleDeleteTeamConfirm}
          isDeleting={isDeletingTeam}
          error={deleteError}
        />
      )}

      {/* Content Area: 40px High-Density Tabular Ledger */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-glow border-t-transparent rounded-full animate-spin" />
            <span className="text-body-default text-text-secondary">Loading teams...</span>
          </div>
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-sentiment-negative text-body-default font-body-default">
          {error}
        </div>
      ) : displayTeams.length === 0 ? (
        <div
          data-testid="no-teams-message"
          className="flex flex-col items-center justify-center py-16 text-text-muted"
        >
          <p className="text-body-default">No teams configured in this organization.</p>
        </div>
      ) : (
        <TeamsTabularLedger
          teams={displayTeams}
          orgMembers={orgMembers}
          isAdmin={effectiveIsAdmin}
          onInspectTeam={(team) => setInspectingTeam(team)}
          onEditTeam={(team) => setEditingTeam(team)}
          onDeleteTeam={(team) => setDeletingTeam(team)}
        />
      )}
    </div>
  )
}

TeamsView.displayName = 'TeamsView'
export default TeamsView
