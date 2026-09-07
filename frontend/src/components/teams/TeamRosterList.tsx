import React from 'react'
import type { TeamMember } from './types'

export interface TeamRosterListProps {
  readonly teamId: number
  readonly members: TeamMember[]
  readonly isAdmin?: boolean
  readonly removingMemberKey?: string | null
  readonly onRemoveMember?: (teamId: number, memberId: number) => void
}

export const TeamRosterList: React.FC<TeamRosterListProps> = ({
  teamId,
  members,
  isAdmin = false,
  removingMemberKey,
  onRemoveMember,
}) => {
  if (!members || members.length === 0) {
    return (
      <span
        data-testid={`team-no-members-${teamId}`}
        className="text-text-muted text-body-compact font-body-compact italic"
      >
        No members assigned
      </span>
    )
  }

  return (
    <div
      data-testid={`team-members-list-${teamId}`}
      className="flex flex-col gap-1"
    >
      {members.map((member) => {
        const key = `${teamId}-${member.id}`
        const isRemoving = removingMemberKey === key

        return (
          <div
            key={member.id}
            data-testid={`team-member-${teamId}-${member.id}`}
            className="flex items-center justify-between h-10 px-3 bg-surface-subpanel border border-border-subtle rounded hover:border-border-prominent transition-colors shadow-keylight"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-body-default font-body-default text-text-primary font-medium truncate">
                {member.user?.name || `Member #${member.id}`}
              </span>
              <span className="text-body-compact font-body-compact text-text-secondary truncate">
                ({member.user?.email || 'N/A'})
              </span>
              <span
                className={`text-label-caps font-label-caps uppercase px-2 py-0.5 rounded-full text-[10px] shrink-0 ${
                  member.role === 'admin'
                    ? 'bg-accent-glow/20 text-accent-glow border border-accent-glow/30'
                    : 'bg-sentiment-positive/15 text-sentiment-positive border border-sentiment-positive/30'
                }`}
              >
                {member.role}
              </span>
            </div>
            {isAdmin && (
              <button
                type="button"
                data-testid={`remove-member-btn-${teamId}-${member.id}`}
                onClick={() => onRemoveMember?.(teamId, member.id)}
                disabled={isRemoving}
                className="ml-3 px-2 py-1 text-[11px] font-semibold bg-sentiment-negative/10 text-sentiment-negative border border-sentiment-negative/30 rounded hover:bg-sentiment-negative/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isRemoving ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TeamRosterList
