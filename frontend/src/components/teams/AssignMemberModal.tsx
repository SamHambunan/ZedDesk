import React, { useState, useContext } from 'react'
import { UserPlus, AlertCircle, Users } from 'lucide-react'
import { QueryClientContext, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClient as defaultQueryClient } from '../../lib/query-client'
import apiClient from '../../lib/api-client'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { Team, TeamMember, OrganizationMember } from './types'

export interface AssignMemberModalProps {
  readonly isOpen?: boolean
  readonly onClose?: () => void
  readonly team?: Team | null
  readonly teamId?: number
  readonly orgMembers?: OrganizationMember[]
  readonly currentMembers?: TeamMember[]
  readonly selectedMemberId?: string
  readonly onSelectMember?: (value: string) => void
  readonly onAddMember?: (teamId: number) => void
  readonly onAssignMember?: (teamId: number, memberId: number) => Promise<void> | void
  readonly isAdding?: boolean
  readonly isSubmitting?: boolean
  readonly isLoadingMembers?: boolean
  readonly error?: string | null
  readonly className?: string
}

const AssignMemberModalInner: React.FC<AssignMemberModalProps> = ({
  isOpen,
  onClose,
  team,
  teamId: propTeamId,
  orgMembers,
  currentMembers: propCurrentMembers,
  selectedMemberId: propSelectedMemberId = '',
  onSelectMember,
  onAddMember,
  onAssignMember,
  isAdding = false,
  isSubmitting = false,
  isLoadingMembers = false,
  error = null,
  className = '',
}) => {
  const isCompoundModal = isOpen !== undefined
  const effectiveTeamId = team?.id ?? propTeamId ?? 0
  const activeMembers = team?.members ?? propCurrentMembers ?? []

  // Query eligible organization members if not passed from parent
  const { data: fetchedMembers, isLoading: isQueryLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await apiClient.get('/api/members')
      return (res.data?.members || []) as OrganizationMember[]
    },
    enabled: Boolean(isCompoundModal && isOpen && (!orgMembers || orgMembers.length === 0)),
  })

  const effectiveOrgMembers = orgMembers && orgMembers.length > 0 ? orgMembers : (fetchedMembers || [])
  const effectiveLoadingMembers = isLoadingMembers || isQueryLoading

  const eligibleMembers = effectiveOrgMembers.filter(
    (m) => !activeMembers.some((cm) => cm.id === m.id || cm.user_id === m.user_id)
  )

  const [internalSelectedId, setInternalSelectedId] = useState('')
  const [internalSubmitting, setInternalSubmitting] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)

  const selectedId = isCompoundModal ? internalSelectedId : propSelectedMemberId
  const submitting = isSubmitting || isAdding || internalSubmitting
  const displayError = internalError || error

  const handleClose = () => {
    setInternalSelectedId('')
    setInternalError(null)
    onClose?.()
  }

  const handleSelectChange = (value: string) => {
    if (isCompoundModal) {
      setInternalSelectedId(value)
      if (internalError) setInternalError(null)
    } else {
      onSelectMember?.(value)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setInternalError(null)

    if (!selectedId) {
      setInternalError('Please select a member to assign.')
      return
    }

    const memberIdNum = Number(selectedId)
    if (!memberIdNum) {
      setInternalError('Invalid member selected.')
      return
    }

    try {
      setInternalSubmitting(true)
      if (onAssignMember) {
        await onAssignMember(effectiveTeamId, memberIdNum)
      } else if (onAddMember) {
        await (onAddMember as (tId: number, mId?: number) => Promise<void> | void)(effectiveTeamId, memberIdNum)
      }
      setInternalSelectedId('')
      onClose?.()
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to assign member to team.'
      setInternalError(msg)
    } finally {
      setInternalSubmitting(false)
    }
  }

  // Compound Modal View
  if (isCompoundModal) {
    return (
      <Modal.Root open={isOpen} onClose={handleClose} className={`max-w-md ${className}`}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
          <Modal.Header>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-accent-glow" />
                <Modal.Title data-testid="assign-member-title">
                  Assign Member{team?.name ? ` to ${team.name}` : ''}
                </Modal.Title>
              </div>
              <Modal.Description>
                Select an eligible organization member to add to this team roster.
              </Modal.Description>
            </div>
            <Modal.CloseButton />
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-4">
            {displayError && (
              <div
                data-testid="assign-member-error"
                className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
            )}

            {effectiveLoadingMembers ? (
              <div className="flex items-center justify-center py-6 text-text-secondary text-xs">
                Loading eligible organization members...
              </div>
            ) : eligibleMembers.length === 0 ? (
              <div
                data-testid="no-eligible-members-message"
                className="p-4 bg-surface-panel border border-border-subtle rounded-lg text-text-muted text-xs text-center flex flex-col items-center gap-2"
              >
                <Users className="w-6 h-6 text-text-muted" />
                <p>All organization members are already assigned to this team.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`assign-member-select-${effectiveTeamId}`}
                  className="text-label-regular font-label-regular text-text-secondary text-xs"
                >
                  Organization Member
                </label>
                <select
                  id={`assign-member-select-${effectiveTeamId}`}
                  data-testid="assign-member-select"
                  value={selectedId}
                  onChange={(e) => handleSelectChange(e.target.value)}
                  className="w-full h-10 px-3 text-body-compact font-body-compact bg-surface-subpanel border border-border-prominent rounded text-text-primary focus:border-accent-glow/60 focus:outline-none transition-colors"
                >
                  <option value="">Select an organization member...</option>
                  {eligibleMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.user?.name || `Member #${m.id}`} ({m.user?.email || 'N/A'}) — {m.role.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button
              type="button"
              data-testid="cancel-assign-member-btn"
              variant="ghost"
              size="compact"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="assign-member-submit"
              variant="amber"
              size="compact"
              disabled={!selectedId || submitting || eligibleMembers.length === 0}
              isLoading={submitting}
              leftIcon={!submitting ? <UserPlus className="w-3.5 h-3.5" /> : undefined}
              className="gap-1.5 font-semibold"
            >
              {submitting ? 'Assigning...' : 'Assign Member'}
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Root>
    )
  }

  // Legacy inline form (for backward compatibility)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        data-testid={`add-member-select-${effectiveTeamId}`}
        value={selectedId}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="flex-1 min-w-[14rem] h-9 px-3 text-body-compact font-body-compact bg-surface-subpanel border border-border-prominent rounded text-text-primary focus:border-accent-glow/60 focus:outline-none transition-colors"
      >
        <option value="">
          {effectiveLoadingMembers ? 'Loading members...' : 'Select Organization Member to add...'}
        </option>
        {eligibleMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.user?.name || `Member #${m.id}`} ({m.user?.email || 'N/A'}) — {m.role.toUpperCase()}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="primary"
        size="standard"
        data-testid={`add-member-btn-${effectiveTeamId}`}
        onClick={() => onAddMember?.(effectiveTeamId)}
        disabled={!selectedId || isAdding}
        isLoading={isAdding}
        className="h-9 px-4 shrink-0 font-semibold"
      >
        {isAdding ? 'Adding...' : 'Add Member'}
      </Button>
    </div>
  )
}

export const AssignMemberModal: React.FC<AssignMemberModalProps> = (props) => {
  const existingClient = useContext(QueryClientContext)
  if (!existingClient) {
    return (
      <QueryClientProvider client={defaultQueryClient}>
        <AssignMemberModalInner {...props} />
      </QueryClientProvider>
    )
  }
  return <AssignMemberModalInner {...props} />
}

AssignMemberModal.displayName = 'AssignMemberModal'
export default AssignMemberModal
