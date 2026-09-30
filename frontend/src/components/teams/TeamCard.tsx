import React from 'react'
import { Pencil, Trash2, Users, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Team, OrganizationMember } from './types'
import { TeamRosterList } from './TeamRosterList'
import { AssignMemberModal } from './AssignMemberModal'

export interface TeamCardProps {
  readonly team: Team
  readonly isAdmin?: boolean
  readonly isEditing?: boolean
  readonly editName?: string
  readonly editDescription?: string
  readonly onEditNameChange?: (v: string) => void
  readonly onEditDescChange?: (v: string) => void
  readonly onStartEdit?: (team: Team) => void
  readonly onSaveEdit?: (teamId: number) => void
  readonly onCancelEdit?: () => void
  readonly onDelete?: (teamId: number) => void
  readonly onOpenDeleteModal?: (team: Team) => void
  readonly onOpenAssignModal?: (team: Team) => void
  readonly isUpdating?: boolean
  readonly isDeletingId?: number | null
  readonly updateError?: string | null
  readonly orgMembers?: OrganizationMember[]
  readonly selectedMemberId?: string
  readonly onSelectMember?: (teamId: number, value: string) => void
  readonly onAddMember?: (teamId: number) => void
  readonly isAddingMemberId?: number | null
  readonly isLoadingMembers?: boolean
  readonly removingMemberKey?: string | null
  readonly onRemoveMember?: (teamId: number, memberId: number) => void
  readonly teamActionError?: string | null
}

export const TeamCard: React.FC<TeamCardProps> = ({
  team,
  isAdmin = false,
  isEditing = false,
  editName = '',
  editDescription = '',
  onEditNameChange,
  onEditDescChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onOpenDeleteModal,
  onOpenAssignModal,
  isUpdating = false,
  isDeletingId,
  updateError,
  orgMembers = [],
  selectedMemberId = '',
  onSelectMember,
  onAddMember,
  isAddingMemberId,
  isLoadingMembers = false,
  removingMemberKey,
  onRemoveMember,
  teamActionError,
}) => {
  const isDeleting = isDeletingId === team.id
  const isAddingToThis = isAddingMemberId === team.id
  const memberCount = team.members?.length ?? 0

  return (
    <div
      data-testid={`team-card-${team.id}`}
      className="bg-surface-subpanel border border-border-subtle rounded-lg shadow-keylight flex flex-col gap-0 overflow-hidden hover:border-border-prominent transition-colors"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border-subtle">
        {isEditing ? (
          <div className="flex flex-col gap-2 flex-1">
            {updateError && (
              <div className="text-sentiment-negative text-body-compact font-body-compact mb-1">
                {updateError}
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                data-testid={`edit-team-name-input-${team.id}`}
                value={editName}
                onChange={(e) => onEditNameChange?.(e.target.value)}
                placeholder="Team Name"
                className="flex-1 min-w-[12rem] h-9 px-3 text-body-default font-body-default bg-surface-panel border border-border-prominent rounded text-text-primary placeholder:text-text-muted focus:border-accent-glow/60 focus:outline-none"
              />
              <input
                type="text"
                data-testid={`edit-team-desc-input-${team.id}`}
                value={editDescription}
                onChange={(e) => onEditDescChange?.(e.target.value)}
                placeholder="Team Description"
                className="flex-[2] min-w-[16rem] h-9 px-3 text-body-default font-body-default bg-surface-panel border border-border-prominent rounded text-text-primary placeholder:text-text-muted focus:border-accent-glow/60 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="compact"
                data-testid={`save-team-btn-${team.id}`}
                onClick={() => onSaveEdit?.(team.id)}
                disabled={isUpdating}
                isLoading={isUpdating}
                className="h-8 px-4 text-label-regular font-label-regular font-semibold"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                data-testid={`cancel-edit-team-btn-${team.id}`}
                onClick={onCancelEdit}
                className="h-8 px-4 text-label-regular font-label-regular"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-0.5 min-w-0">
              <h3
                data-testid={`team-name-${team.id}`}
                className="text-headline-sm font-headline-sm text-text-primary truncate"
              >
                {team.name}
              </h3>
              <p
                data-testid={`team-description-${team.id}`}
                className="text-body-default font-body-default text-text-secondary"
              >
                {team.description || 'No description provided'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div
                  data-testid={`team-agent-chip-${team.id}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-panel border border-border-subtle text-xs text-text-secondary w-fit"
                >
                  <Users className="w-3.5 h-3.5 text-accent-glow shrink-0" />
                  <span
                    data-testid={`team-agent-count-${team.id}`}
                    className="font-mono tabular-nums font-semibold text-text-primary font-['JetBrains_Mono',monospace]"
                  >
                    {memberCount}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {memberCount === 1 ? 'agent' : 'agents'}
                  </span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  data-testid={`edit-team-btn-${team.id}`}
                  onClick={() => onStartEdit?.(team)}
                  leftIcon={<Pencil className="w-3 h-3" />}
                  className="h-8 px-3 text-label-regular font-label-regular gap-1.5"
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="compact"
                  data-testid={`delete-team-btn-${team.id}`}
                  onClick={() => (onOpenDeleteModal ? onOpenDeleteModal(team) : onDelete?.(team.id))}
                  disabled={isDeleting}
                  isLoading={isDeleting}
                  leftIcon={!isDeleting ? <Trash2 className="w-3 h-3" /> : undefined}
                  className="h-8 px-3 text-label-regular font-label-regular gap-1.5"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Member Roster */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="text-label-caps font-label-caps text-text-muted uppercase tracking-wider">
          Members ({memberCount})
        </div>

        {teamActionError && (
          <div
            data-testid={`member-action-error-${team.id}`}
            className="px-3 py-2 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-sentiment-negative text-body-compact font-body-compact"
          >
            {teamActionError}
          </div>
        )}

        <TeamRosterList
          teamId={team.id}
          members={team.members || []}
          isAdmin={isAdmin}
          removingMemberKey={removingMemberKey}
          onRemoveMember={onRemoveMember}
        />

        {isAdmin && (
          <div className="pt-2 border-t border-border-subtle">
            {onOpenAssignModal ? (
              <Button
                type="button"
                data-testid={`add-member-btn-${team.id}`}
                variant="ghost"
                size="compact"
                onClick={() => onOpenAssignModal(team)}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                className="w-full justify-center gap-1.5 text-xs text-accent-glow hover:text-accent-glow/80 font-medium"
              >
                Assign Member
              </Button>
            ) : (
              <AssignMemberModal
                teamId={team.id}
                orgMembers={orgMembers}
                currentMembers={team.members || []}
                selectedMemberId={selectedMemberId}
                onSelectMember={(value) => onSelectMember?.(team.id, value)}
                onAddMember={onAddMember || (() => {})}
                isAdding={isAddingToThis}
                isLoadingMembers={isLoadingMembers}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeamCard
