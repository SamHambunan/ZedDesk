import React from 'react'
import { Plus } from 'lucide-react'

export interface CreateTeamModalProps {
  readonly newTeamName: string
  readonly newTeamDescription: string
  readonly isCreating?: boolean
  readonly createError?: string | null
  readonly createSuccess?: string | null
  readonly onNameChange: (v: string) => void
  readonly onDescChange: (v: string) => void
  readonly onSubmit: (e: React.FormEvent) => void
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  newTeamName,
  newTeamDescription,
  isCreating = false,
  createError,
  createSuccess,
  onNameChange,
  onDescChange,
  onSubmit,
}) => {
  return (
    <div className="bg-surface-panel border border-border-subtle rounded-xl shadow-keylight p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-headline-sm font-headline-sm text-text-primary">Create New Team</h3>
        <p className="text-body-compact font-body-compact text-text-secondary mt-0.5">
          Define a functional support team and assign routing scope.
        </p>
      </div>

      {createSuccess && (
        <div
          data-testid="team-create-success"
          className="px-4 py-3 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded text-sentiment-positive text-body-compact font-body-compact"
        >
          {createSuccess}
        </div>
      )}

      {createError && (
        <div
          data-testid="team-create-error"
          className="px-4 py-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-sentiment-negative text-body-compact font-body-compact"
        >
          {createError}
        </div>
      )}

      <form data-testid="create-team-form" onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
            <label
              htmlFor="create-team-name"
              className="text-label-regular font-label-regular text-text-secondary"
            >
              Team Name
            </label>
            <input
              id="create-team-name"
              data-testid="team-name-input"
              type="text"
              required
              placeholder="e.g. Tier 1 Support"
              value={newTeamName}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-9 px-3 text-body-default font-body-default bg-surface-subpanel border border-border-prominent rounded text-text-primary placeholder:text-text-muted focus:border-accent-glow/60 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-[2] min-w-[18rem]">
            <label
              htmlFor="create-team-desc"
              className="text-label-regular font-label-regular text-text-secondary"
            >
              Description
            </label>
            <input
              id="create-team-desc"
              data-testid="team-description-input"
              type="text"
              placeholder="Team responsibilities or routing scope"
              value={newTeamDescription}
              onChange={(e) => onDescChange(e.target.value)}
              className="h-9 px-3 text-body-default font-body-default bg-surface-subpanel border border-border-prominent rounded text-text-primary placeholder:text-text-muted focus:border-accent-glow/60 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            data-testid="team-create-submit"
            disabled={isCreating}
            className="h-9 px-5 text-label-regular font-label-regular bg-primary-container hover:bg-primary-dark text-white rounded shadow-keylight-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateTeamModal
