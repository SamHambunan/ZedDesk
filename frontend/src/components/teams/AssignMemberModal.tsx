import React from 'react'
import type { TeamMember, OrganizationMember } from './types'

export interface AssignMemberModalProps {
  readonly teamId: number
  readonly orgMembers: OrganizationMember[]
  readonly currentMembers: TeamMember[]
  readonly selectedMemberId: string
  readonly onSelectMember: (value: string) => void
  readonly onAddMember: (teamId: number) => void
  readonly isAdding?: boolean
  readonly isLoadingMembers?: boolean
}

export const AssignMemberModal: React.FC<AssignMemberModalProps> = ({
  teamId,
  orgMembers,
  currentMembers,
  selectedMemberId,
  onSelectMember,
  onAddMember,
  isAdding = false,
  isLoadingMembers = false,
}) => {
  const availableMembers = orgMembers.filter(
    (m) => !currentMembers?.some((cm) => cm.id === m.id)
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        data-testid={`add-member-select-${teamId}`}
        value={selectedMemberId}
        onChange={(e) => onSelectMember(e.target.value)}
        className="flex-1 min-w-[14rem] h-9 px-3 text-body-compact font-body-compact bg-surface-subpanel border border-border-prominent rounded text-text-primary focus:border-accent-glow/60 focus:outline-none transition-colors"
      >
        <option value="">
          {isLoadingMembers ? 'Loading members...' : 'Select Organization Member to add...'}
        </option>
        {availableMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.user?.name || `Member #${m.id}`} ({m.user?.email || 'N/A'}) — {m.role.toUpperCase()}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid={`add-member-btn-${teamId}`}
        onClick={() => onAddMember(teamId)}
        disabled={!selectedMemberId || isAdding}
        className="h-9 px-4 text-label-regular font-label-regular bg-primary-container hover:bg-primary-dark text-white rounded shadow-keylight-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
      >
        {isAdding ? 'Adding...' : 'Add Member'}
      </button>
    </div>
  )
}

export default AssignMemberModal
