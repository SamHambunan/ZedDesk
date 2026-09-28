import React, { useState, useContext } from 'react'
import { Plus, Users2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import apiClient from '../../lib/api-client'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import type { Team, OrganizationMember } from './types'
import { TeamCard } from './TeamCard'
import { CreateTeamModal } from './CreateTeamModal'

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
  readonly onDelete?: (teamId: number) => void
  readonly onSelectMember?: (teamId: number, value: string) => void
  readonly onAddMember?: (teamId: number) => void
  readonly onRemoveMember?: (teamId: number, memberId: number) => void
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
  onRemoveMember,
  className = '',
}) => {
  const shellContext = useContext(WorkspaceShellContext)
  const queryClient = useQueryClient()

  const effectiveIsAdmin =
    isAdmin !== undefined
      ? isAdmin
      : (shellContext?.role || '').toLowerCase() === 'admin'

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateTeamSubmit = async (data: { name: string; description?: string }) => {
    setCreateError(null)
    setIsSubmitting(true)

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
      setIsSubmitting(false)
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
                {teams.length}
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

      {/* Strict RBAC: Compound Modal completely omitted from DOM for agents */}
      {effectiveIsAdmin && (
        <CreateTeamModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false)
            setCreateError(null)
          }}
          onSubmit={handleCreateTeamSubmit}
          isSubmitting={isSubmitting || isCreating}
          error={createError || propCreateError}
          success={propCreateSuccess}
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
      ) : teams.length === 0 ? (
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
          {teams.map((team) => (
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
              isUpdating={isUpdating}
              isDeletingId={deletingTeamId}
              updateError={updateError}
              selectedMemberId={selectedMemberToAdd?.[team.id]}
              onSelectMember={onSelectMember}
              onAddMember={onAddMember}
              isAddingMemberId={addingMemberTeamId}
              removingMemberKey={removingMemberKey}
              onRemoveMember={onRemoveMember}
              teamActionError={teamActionError?.[team.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TeamsView
