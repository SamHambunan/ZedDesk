import React, { useState, useContext, useEffect } from 'react'
import { Plus, Users2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import apiClient from '../../lib/api-client'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Team, OrganizationMember } from './types'
import { TeamCard } from './TeamCard'
import { CreateTeamModal } from './CreateTeamModal'
import { AssignMemberModal } from './AssignMemberModal'
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
  readonly editingTeamId?: number | null
  readonly editTeamName?: string
  readonly editTeamDescription?: string
  readonly isUpdating?: boolean
  readonly updateError?: string | null
  readonly deletingTeamId?: number | null
  readonly selectedMemberToAdd?: Record<number, string>
  readonly addingMemberTeamId?: number | null
  readonly removingMemberKey?: string | null
  readonly teamActionError?: Record<number, string | null>
  readonly onEditNameChange?: (v: string) => void
  readonly onEditDescChange?: (v: string) => void
  readonly onStartEdit?: (team: Team) => void
  readonly onSaveEdit?: (teamId: number) => void
  readonly onCancelEdit?: () => void
  readonly onDelete?: (teamId: number) => Promise<void> | void
  readonly onSelectMember?: (teamId: number, value: string) => void
  readonly onAddMember?: (teamId: number) => Promise<void> | void
  readonly onAssignMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly onRemoveMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly className?: string
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
  editingTeamId,
  editTeamName,
  editTeamDescription,
  isUpdating = false,
  updateError,
  deletingTeamId,
  selectedMemberToAdd = {},
  addingMemberTeamId,
  removingMemberKey,
  teamActionError = {},
  onEditNameChange,
  onEditDescChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onSelectMember,
  onAddMember,
  onAssignMember,
  onRemoveMember,
  className = '',
}) => {
  const shellContext = useContext(WorkspaceShellContext)
  const queryClient = useQueryClient()

  const effectiveIsAdmin =
    isAdmin !== undefined
      ? isAdmin
      : (shellContext?.role || '').toLowerCase() === 'admin'

  const [displayTeams, setDisplayTeams] = useState<Team[]>(teams)
  useEffect(() => {
    setDisplayTeams(teams)
  }, [teams])

  // Create Team Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Assign Member Modal State
  const [assigningTeam, setAssigningTeam] = useState<Team | null>(null)
  const [isAssigningMember, setIsAssigningMember] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Delete Team Modal State
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null)
  const [isDeletingTeam, setIsDeletingTeam] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const handleOpenAssignModal = (team: Team) => {
    // Keep active team up-to-date from displayTeams
    const current = displayTeams.find((t) => t.id === team.id) || team
    setAssigningTeam(current)
    setAssignError(null)
  }

  const handleCloseAssignModal = () => {
    setAssigningTeam(null)
    setAssignError(null)
  }

  const handleAssignMemberSubmit = async (teamId: number, memberId: number) => {
    setIsAssigningMember(true)
    setAssignError(null)

    try {
      if (onAssignMember) {
        await onAssignMember(teamId, memberId)
      } else if (onAddMember) {
        await onAddMember(teamId)
      } else {
        await apiClient.post(`/api/teams/${teamId}/members`, {
          organization_member_id: memberId,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setAssigningTeam(null)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to assign member to team.'
      setAssignError(msg)
      throw err
    } finally {
      setIsAssigningMember(false)
    }
  }

  const handleOpenDeleteModal = (team: Team) => {
    const current = displayTeams.find((t) => t.id === team.id) || team
    setDeletingTeam(current)
    setDeleteError(null)
  }

  const handleCloseDeleteModal = () => {
    setDeletingTeam(null)
    setDeleteError(null)
  }

  const handleDeleteTeamConfirm = async (teamId: number) => {
    setIsDeletingTeam(true)
    setDeleteError(null)

    try {
      if (onDelete) {
        await onDelete(teamId)
      } else {
        await apiClient.delete(`/api/teams/${teamId}`)
      }
      setDisplayTeams((prev) => prev.filter((t) => t.id !== teamId))
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setDeletingTeam(null)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to delete team.'
      setDeleteError(msg)
      throw err
    } finally {
      setIsDeletingTeam(false)
    }
  }

  const handleRemoveMember = async (teamId: number, memberId: number) => {
    const previous = displayTeams
    // Optimistic detachment
    setDisplayTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, members: (t.members || []).filter((m) => m.id !== memberId) }
          : t
      )
    )

    try {
      if (onRemoveMember) {
        await onRemoveMember(teamId, memberId)
      } else {
        await apiClient.delete(`/api/teams/${teamId}/members/${memberId}`)
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    } catch (err) {
      setDisplayTeams(previous) // Rollback optimistic update
      throw err
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

      {/* Strict RBAC: Assign Member Compound Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <AssignMemberModal
          isOpen={Boolean(assigningTeam)}
          onClose={handleCloseAssignModal}
          team={assigningTeam}
          orgMembers={orgMembers}
          onAssignMember={handleAssignMemberSubmit}
          isSubmitting={isAssigningMember}
          error={assignError}
        />
      )}

      {/* Strict RBAC: Delete Team Compound Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <DeleteTeamModal
          isOpen={Boolean(deletingTeam)}
          onClose={handleCloseDeleteModal}
          team={deletingTeam}
          onConfirm={handleDeleteTeamConfirm}
          isDeleting={isDeletingTeam}
          error={deleteError}
        />
      )}

      {/* Content Area */}
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
        <div
          data-testid="teams-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {displayTeams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              isAdmin={effectiveIsAdmin}
              orgMembers={orgMembers}
              isEditing={editingTeamId === team.id}
              editName={editTeamName}
              editDescription={editTeamDescription}
              onEditNameChange={onEditNameChange}
              onEditDescChange={onEditDescChange}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onOpenAssignModal={effectiveIsAdmin ? handleOpenAssignModal : undefined}
              onOpenDeleteModal={effectiveIsAdmin ? handleOpenDeleteModal : undefined}
              isUpdating={isUpdating}
              isDeletingId={deletingTeamId}
              updateError={updateError}
              selectedMemberId={selectedMemberToAdd?.[team.id]}
              onSelectMember={onSelectMember}
              onAddMember={onAddMember}
              isAddingMemberId={addingMemberTeamId}
              removingMemberKey={removingMemberKey}
              onRemoveMember={handleRemoveMember}
              teamActionError={teamActionError?.[team.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TeamsView
