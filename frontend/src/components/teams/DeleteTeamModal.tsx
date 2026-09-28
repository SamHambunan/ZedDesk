import React from 'react'
import { Trash2, AlertTriangle, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Team } from './types'

export interface DeleteTeamModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onConfirm: (teamId: number) => Promise<void> | void
  readonly team: Team | null
  readonly isDeleting?: boolean
  readonly error?: string | null
  readonly className?: string
}

export const DeleteTeamModal: React.FC<DeleteTeamModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  team,
  isDeleting = false,
  error = null,
  className = '',
}) => {
  if (!team) return null

  const memberCount = team.members?.length ?? 0
  const hasMembers = memberCount > 0

  const handleConfirm = async () => {
    if (hasMembers || isDeleting) return
    await onConfirm(team.id)
  }

  return (
    <Modal.Root open={isOpen} onClose={onClose} className={`max-w-md ${className}`}>
      <Modal.Header>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-sentiment-negative" />
            <Modal.Title data-testid="delete-team-title">Delete Team</Modal.Title>
          </div>
          <Modal.Description>
            Confirm permanent deletion of this support team.
          </Modal.Description>
        </div>
        <Modal.CloseButton />
      </Modal.Header>

      <Modal.Body className="flex flex-col gap-4">
        {error && (
          <div
            data-testid="delete-team-error"
            className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {hasMembers ? (
          <div
            data-testid="delete-team-members-warning"
            className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Cannot delete team with active members</span>
            </div>
            <p className="leading-relaxed">
              This team currently has <span className="font-semibold">{memberCount} active member{memberCount === 1 ? '' : 's'}</span>. Please remove or reassign all members before deleting this team.
            </p>
            <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {team.members?.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-subpanel border border-border-subtle text-[11px] text-text-secondary"
                >
                  <span className="font-medium text-text-primary">{m.user?.name || `Member #${m.id}`}</span>
                  <Badge variant={m.role === 'admin' ? 'admin' : 'agent'} className="text-[9px] px-1 py-0 uppercase">
                    {m.role}
                  </Badge>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div
            data-testid="delete-team-confirmation-text"
            className="text-body-default font-body-default text-text-secondary leading-relaxed"
          >
            This team has no assigned members. Are you sure you want to permanently delete{' '}
            <span className="font-semibold text-text-primary">&ldquo;{team.name}&rdquo;</span>? This action cannot be undone.
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          type="button"
          data-testid="cancel-delete-team-btn"
          variant="ghost"
          size="compact"
          onClick={onClose}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          data-testid="confirm-delete-team-btn"
          variant="danger"
          size="compact"
          onClick={handleConfirm}
          disabled={hasMembers || isDeleting}
          isLoading={isDeleting}
          leftIcon={!isDeleting ? <Trash2 className="w-3.5 h-3.5" /> : undefined}
          className="gap-1.5 font-semibold"
        >
          {isDeleting ? 'Deleting...' : 'Delete Team'}
        </Button>
      </Modal.Footer>
    </Modal.Root>
  )
}

DeleteTeamModal.displayName = 'DeleteTeamModal'
export default DeleteTeamModal
