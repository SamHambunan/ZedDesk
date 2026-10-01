import React, { useState, useEffect } from 'react'
import { Pencil, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { Team } from './types'

export interface EditTeamModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly team: Team | null
  readonly onSave: (teamId: number, data: { name: string; description?: string }) => Promise<void> | void
  readonly isSaving?: boolean
  readonly error?: string | null
  readonly className?: string
}

export const EditTeamModal: React.FC<EditTeamModalProps> = ({
  isOpen,
  onClose,
  team,
  onSave,
  isSaving = false,
  error = null,
  className = '',
}) => {
  const [name, setName] = useState(team?.name || '')
  const [description, setDescription] = useState(team?.description || '')
  const [clientError, setClientError] = useState<string | null>(null)

  // Update internal state when target team changes
  useEffect(() => {
    if (team) {
      setName(team.name)
      setDescription(team.description || '')
      setClientError(null)
    }
  }, [team])

  if (!team) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setClientError('Team name is required.')
      return
    }

    try {
      await onSave(team.id, {
        name: trimmedName,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to update team.'
      setClientError(msg)
    }
  }

  const displayError = clientError || error

  return (
    <Modal.Root open={isOpen} onClose={onClose} className={`max-w-md ${className}`}>
      <form data-testid="edit-team-modal-form" onSubmit={handleSubmit} noValidate className="flex flex-col">
        <Modal.Header>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-accent-glow" />
              <Modal.Title data-testid="edit-team-modal-title">Edit Team</Modal.Title>
            </div>
            <Modal.Description>
              Update team name and routing description.
            </Modal.Description>
          </div>
          <Modal.CloseButton />
        </Modal.Header>

        <Modal.Body className="flex flex-col gap-4">
          {displayError && (
            <div
              data-testid="edit-team-modal-error"
              className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-team-name-input"
              className="text-label-regular font-label-regular text-text-secondary text-xs"
            >
              Team Name
            </label>
            <Input
              id="edit-team-name-input"
              data-testid="edit-team-name-input"
              type="text"
              required
              placeholder="e.g. Tier 1 Support"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (clientError) setClientError(null)
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-team-desc-input"
              className="text-label-regular font-label-regular text-text-secondary text-xs"
            >
              Routing Description
            </label>
            <Input
              id="edit-team-desc-input"
              data-testid="edit-team-desc-input"
              type="text"
              placeholder="Routing scope or responsibilities"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button
            type="button"
            data-testid="cancel-edit-team-btn"
            variant="ghost"
            size="compact"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="amber"
            size="compact"
            data-testid="save-team-submit-btn"
            isLoading={isSaving}
            className="font-semibold"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal.Root>
  )
}

EditTeamModal.displayName = 'EditTeamModal'
export default EditTeamModal
