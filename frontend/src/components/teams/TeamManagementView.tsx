import React from 'react'
import type { Team, OrganizationMember } from './types'
import { CreateTeamModal } from './CreateTeamModal'
import { TeamCard } from './TeamCard'

export interface TeamManagementViewProps {
  readonly teams: Team[]
  readonly orgMembers: OrganizationMember[]
  readonly isLoadingTeams?: boolean
  readonly isLoadingMembers?: boolean
  readonly createSuccess?: string | null
  readonly createError?: string | null
  readonly newTeamName: string
  readonly newTeamDescription: string
  readonly isCreating?: boolean
  readonly editingTeamId?: number | null
  readonly editTeamName?: string
  readonly editTeamDescription?: string
  readonly isUpdating?: boolean
  readonly updateError?: string | null
  readonly selectedMemberToAdd?: Record<number, string>
  readonly addingMemberTeamId?: number | null
  readonly removingMemberKey?: string | null
  readonly deletingTeamId?: number | null
  readonly teamActionError?: Record<number, string | null>
  readonly onNameChange: (v: string) => void
  readonly onDescChange: (v: string) => void
  readonly onCreateSubmit: (e: React.FormEvent) => void
  readonly onStartEdit: (team: Team) => void
  readonly onEditNameChange: (v: string) => void
  readonly onEditDescChange: (v: string) => void
  readonly onSaveEdit: (teamId: number) => void
  readonly onCancelEdit: () => void
  readonly onDelete: (teamId: number) => void
  readonly onSelectMember: (teamId: number, value: string) => void
  readonly onAddMember: (teamId: number) => void
  readonly onRemoveMember: (teamId: number, memberId: number) => void
}

export const TeamManagementView: React.FC<TeamManagementViewProps> = ({
  teams,
  orgMembers,
  isLoadingTeams = false,
  isLoadingMembers = false,
  createSuccess,
  createError,
  newTeamName,
  newTeamDescription,
  isCreating = false,
  editingTeamId,
  editTeamName = '',
  editTeamDescription = '',
  isUpdating = false,
  updateError,
  selectedMemberToAdd = {},
  addingMemberTeamId,
  removingMemberKey,
  deletingTeamId,
  teamActionError = {},
  onNameChange,
  onDescChange,
  onCreateSubmit,
  onStartEdit,
  onEditNameChange,
  onEditDescChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onSelectMember,
  onAddMember,
  onRemoveMember,
}) => {
  return (
    <div data-testid="team-management-view" className="flex flex-col gap-6">
      {/* View Header */}
      <div className="pb-5 border-b border-border-subtle">
        <h2 className="text-headline-md font-headline-md text-text-primary">
          Team Management &amp; Agent Rosters
        </h2>
        <p className="text-body-default font-body-default text-text-secondary mt-1">
          Create and manage functional teams, assign agents, and configure routing scope.
        </p>
      </div>

      {/* Create Team Form */}
      <CreateTeamModal
        newTeamName={newTeamName}
        newTeamDescription={newTeamDescription}
        isCreating={isCreating}
        createError={createError}
        createSuccess={createSuccess}
        onNameChange={onNameChange}
        onDescChange={onDescChange}
        onSubmit={onCreateSubmit}
      />

      {/* Active Teams */}
      <div className="flex flex-col gap-3">
        <h3 className="text-headline-sm font-headline-sm text-text-primary">
          Active Teams
        </h3>

        {isLoadingTeams ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent-glow border-t-transparent rounded-full animate-spin" />
              <span className="text-body-default text-text-secondary">Loading teams...</span>
            </div>
          </div>
        ) : teams.length === 0 ? (
          <p className="text-text-muted text-body-default font-body-default italic">
            No teams created yet.
          </p>
        ) : (
          <div data-testid="manage-teams-list" className="flex flex-col gap-4">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isAdmin={true}
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
                updateError={editingTeamId === team.id ? updateError : null}
                orgMembers={orgMembers}
                selectedMemberId={selectedMemberToAdd[team.id] || ''}
                onSelectMember={onSelectMember}
                onAddMember={onAddMember}
                isAddingMemberId={addingMemberTeamId}
                isLoadingMembers={isLoadingMembers}
                removingMemberKey={removingMemberKey}
                onRemoveMember={onRemoveMember}
                teamActionError={teamActionError[team.id] || null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeamManagementView
