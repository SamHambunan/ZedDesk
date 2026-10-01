import React from 'react'
import type { Team, OrganizationMember } from './types'
import { TeamsView } from './TeamsView'

export interface TeamManagementViewProps {
  readonly teams: Team[]
  readonly orgMembers: OrganizationMember[]
  readonly isLoadingTeams?: boolean
  readonly isLoadingMembers?: boolean
  readonly createSuccess?: string | null
  readonly createError?: string | null
  readonly newTeamName?: string
  readonly newTeamDescription?: string
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
  readonly onNameChange?: (v: string) => void
  readonly onDescChange?: (v: string) => void
  readonly onCreateSubmit?: (e: React.FormEvent) => void
  readonly onStartEdit?: (team: Team) => void
  readonly onEditNameChange?: (v: string) => void
  readonly onEditDescChange?: (v: string) => void
  readonly onSaveEdit?: (teamId: number, data?: { name: string; description?: string }) => void
  readonly onCancelEdit?: () => void
  readonly onDelete?: (teamId: number) => void
  readonly onSelectMember?: (teamId: number, value: string) => void
  readonly onAddMember?: (teamId: number, memberId?: number) => void
  readonly onRemoveMember?: (teamId: number, memberId: number) => void
  readonly onCreateTeam?: (data: { name: string; description?: string }) => Promise<void> | void
}

export const TeamManagementView: React.FC<TeamManagementViewProps> = (props) => {
  return (
    <div data-testid="team-management-view">
      <TeamsView
        teams={props.teams}
        orgMembers={props.orgMembers}
        isAdmin={true}
        isLoading={props.isLoadingTeams}
        createSuccess={props.createSuccess}
        createError={props.createError}
        onCreateTeam={props.onCreateTeam}
        onSaveEdit={props.onSaveEdit}
        onDelete={props.onDelete}
        onAssignMember={props.onAddMember ? (tId, mId) => props.onAddMember?.(tId, mId) : undefined}
        onRemoveMember={props.onRemoveMember}
      />
    </div>
  )
}

TeamManagementView.displayName = 'TeamManagementView'
export default TeamManagementView
