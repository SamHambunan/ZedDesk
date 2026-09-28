import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CreateTeamModal } from './CreateTeamModal'

describe('CreateTeamModal Component', () => {
  it('does not render modal content when isOpen is false', () => {
    render(
      <CreateTeamModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByTestId('create-team-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders compound modal dialog with header, inputs, and actions when isOpen is true', () => {
    render(
      <CreateTeamModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('create-team-form')).toBeInTheDocument()
    expect(screen.getByText('Create New Team')).toBeInTheDocument()
    expect(screen.getByTestId('team-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('team-description-input')).toBeInTheDocument()
    expect(screen.getByTestId('team-create-submit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('validates required team name before calling onSubmit', async () => {
    const handleSubmit = vi.fn()
    render(
      <CreateTeamModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    )

    // Attempt submitting without typing a name
    fireEvent.submit(screen.getByTestId('create-team-form'))

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('team-create-error')).toHaveTextContent(/team name is required/i)
  })

  it('submits valid name and description and triggers onSubmit', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <CreateTeamModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    )

    fireEvent.change(screen.getByTestId('team-name-input'), {
      target: { value: 'Billing & Invoicing' },
    })
    fireEvent.change(screen.getByTestId('team-description-input'), {
      target: { value: 'Handles customer invoices and subscriptions' },
    })
    fireEvent.submit(screen.getByTestId('create-team-form'))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        name: 'Billing & Invoicing',
        description: 'Handles customer invoices and subscriptions',
      })
    })
  })

  it('calls onClose when cancel button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <CreateTeamModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('displays external server error when provided', () => {
    render(
      <CreateTeamModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        error="A team with this name already exists."
      />
    )

    expect(screen.getByTestId('team-create-error')).toHaveTextContent('A team with this name already exists.')
  })
})
