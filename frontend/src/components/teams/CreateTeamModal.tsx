import React, { useState } from 'react'
import { Users2, AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export interface CreateTeamData {
  name: string
  description?: string
}

export interface CreateTeamModalProps {
  readonly isOpen?: boolean
  readonly onClose?: () => void
  readonly onSubmit?: ((data: CreateTeamData) => Promise<void> | void) | ((e: React.FormEvent) => void)
  readonly isCreating?: boolean
  readonly isSubmitting?: boolean
  readonly createError?: string | null
  readonly createSuccess?: string | null
  readonly error?: string | null
  readonly success?: string | null
  readonly className?: string
  // Legacy compatibility props for inline usage in TeamManagementView
  readonly newTeamName?: string
  readonly newTeamDescription?: string
  readonly onNameChange?: (v: string) => void
  readonly onDescChange?: (v: string) => void
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isCreating = false,
  isSubmitting = false,
  createError = null,
  createSuccess = null,
  error = null,
  success = null,
  className = '',
  newTeamName,
  newTeamDescription,
  onNameChange,
  onDescChange,
}) => {
  const isCompoundModal = isOpen !== undefined
  const submitting = isSubmitting || isCreating
  const activeError = error || createError
  const activeSuccess = success || createSuccess

  const [internalName, setInternalName] = useState('')
  const [internalDescription, setInternalDescription] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)

  const name = newTeamName !== undefined ? newTeamName : internalName
  const description = newTeamDescription !== undefined ? newTeamDescription : internalDescription

  const handleClose = () => {
    setInternalName('')
    setInternalDescription('')
    setClientError(null)
    onClose?.()
  }

  const handleNameChange = (val: string) => {
    if (onNameChange) {
      onNameChange(val)
    } else {
      setInternalName(val)
    }
    if (clientError) setClientError(null)
  }

  const handleDescChange = (val: string) => {
    if (onDescChange) {
      onDescChange(val)
    } else {
      setInternalDescription(val)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setClientError('Team name is required.')
      return
    }

    if (!onSubmit) return

    try {
      if (isCompoundModal) {
        await (onSubmit as (data: CreateTeamData) => Promise<void> | void)({
          name: trimmedName,
          description: description.trim() || undefined,
        })
        setInternalName('')
        setInternalDescription('')
      } else {
        ;(onSubmit as (e: React.FormEvent) => void)(e)
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Failed to create team.'
      setClientError(msg)
    }
  }

  const displayError = clientError || activeError

  // If used as a compound modal dialog
  if (isCompoundModal) {
    return (
      <Modal.Root
        open={isOpen}
        onClose={handleClose}
        className={`max-w-md ${className}`}
      >
        <form data-testid="create-team-form" onSubmit={handleSubmit} noValidate className="flex flex-col">
          <Modal.Header>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users2 className="w-5 h-5 text-accent-glow" />
                <Modal.Title>Create New Team</Modal.Title>
              </div>
              <Modal.Description>
                Define a functional support team and assign routing scope.
              </Modal.Description>
            </div>
            <Modal.CloseButton />
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-4">
            {displayError && (
              <div
                data-testid="team-create-error"
                className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
            )}

            {activeSuccess && (
              <div
                data-testid="team-create-success"
                className="p-3 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded text-xs text-sentiment-positive flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{activeSuccess}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="create-team-name"
                className="text-label-regular font-label-regular text-text-secondary text-xs"
              >
                Team Name
              </label>
              <Input
                id="create-team-name"
                data-testid="team-name-input"
                type="text"
                required
                placeholder="e.g. Tier 1 Support"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="create-team-desc"
                className="text-label-regular font-label-regular text-text-secondary text-xs"
              >
                Description
              </label>
              <Input
                id="create-team-desc"
                data-testid="team-description-input"
                type="text"
                placeholder="Team responsibilities or routing scope"
                value={description}
                onChange={(e) => handleDescChange(e.target.value)}
              />
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="amber"
              size="compact"
              data-testid="team-create-submit"
              isLoading={submitting}
              leftIcon={!submitting ? <Plus className="w-3.5 h-3.5" /> : undefined}
              className="gap-1.5 font-semibold"
            >
              {submitting ? 'Creating...' : 'Create Team'}
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Root>
    )
  }

  // Legacy inline form card
  return (
    <div className={`bg-surface-panel border border-border-subtle rounded-xl shadow-keylight p-5 flex flex-col gap-4 ${className}`}>
      <div>
        <h3 className="text-headline-sm font-headline-sm text-text-primary">Create New Team</h3>
        <p className="text-body-compact font-body-compact text-text-secondary mt-0.5">
          Define a functional support team and assign routing scope.
        </p>
      </div>

      {activeSuccess && (
        <div
          data-testid="team-create-success"
          className="px-4 py-3 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded text-sentiment-positive text-body-compact font-body-compact"
        >
          {activeSuccess}
        </div>
      )}

      {displayError && (
        <div
          data-testid="team-create-error"
          className="px-4 py-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-sentiment-negative text-body-compact font-body-compact"
        >
          {displayError}
        </div>
      )}

      <form data-testid="create-team-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
            <label
              htmlFor="create-team-name"
              className="text-label-regular font-label-regular text-text-secondary text-xs"
            >
              Team Name
            </label>
            <Input
              id="create-team-name"
              data-testid="team-name-input"
              type="text"
              required
              placeholder="e.g. Tier 1 Support"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-[2] min-w-[18rem]">
            <label
              htmlFor="create-team-desc"
              className="text-label-regular font-label-regular text-text-secondary text-xs"
            >
              Description
            </label>
            <Input
              id="create-team-desc"
              data-testid="team-description-input"
              type="text"
              placeholder="Team responsibilities or routing scope"
              value={description}
              onChange={(e) => handleDescChange(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Button
            type="submit"
            data-testid="team-create-submit"
            variant="amber"
            isLoading={submitting}
            leftIcon={!submitting ? <Plus className="w-4 h-4" /> : undefined}
            className="gap-2 font-semibold"
          >
            {submitting ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
      </form>
    </div>
  )
}

CreateTeamModal.displayName = 'CreateTeamModal'
export default CreateTeamModal
