import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InviteMemberModal } from './InviteMemberModal'

describe('InviteMemberModal Component', () => {
  it('does not render dialog when isOpen is false', () => {
    render(
      <InviteMemberModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.queryByTestId('invite-form')).not.toBeInTheDocument()
  })

  it('renders accessible dialog with inputs and default role when open', () => {
    render(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Invite Organization Member')).toBeInTheDocument()
    expect(screen.getByTestId('invite-email-input')).toBeInTheDocument()
    expect(screen.getByTestId('invite-role-select')).toHaveValue('agent')
    expect(screen.getByTestId('invite-submit-btn')).toHaveTextContent(/send invitation/i)
  })

  it('prevents submission and displays error for empty or invalid email', async () => {
    const handleSubmit = vi.fn()
    render(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    )

    const form = screen.getByTestId('invite-form')
    fireEvent.submit(form)

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('invite-error')).toHaveTextContent(/email address is required/i)

    // Invalid format
    const emailInput = screen.getByTestId('invite-email-input')
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })
    fireEvent.submit(form)

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('invite-error')).toHaveTextContent(/valid email address/i)
  })

  it('validates against existing member or pending invite emails', async () => {
    const handleSubmit = vi.fn()
    render(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
        existingEmails={['alex@acme.corp', 'sarah@acme.corp']}
      />
    )

    const emailInput = screen.getByTestId('invite-email-input')
    fireEvent.change(emailInput, { target: { value: 'ALEX@ACME.CORP' } })

    const form = screen.getByTestId('invite-form')
    fireEvent.submit(form)

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('invite-error')).toHaveTextContent(/already been invited or is already a member/i)
  })

  it('submits valid email and selected role', async () => {
    const handleSubmit = vi.fn()
    render(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
        existingEmails={['alex@acme.corp']}
      />
    )

    const emailInput = screen.getByTestId('invite-email-input')
    fireEvent.change(emailInput, { target: { value: 'newperson@acme.corp' } })

    const roleSelect = screen.getByTestId('invite-role-select')
    fireEvent.change(roleSelect, { target: { value: 'admin' } })

    const form = screen.getByTestId('invite-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('newperson@acme.corp', 'admin')
    })
  })

  it('displays external error and success messages and respects isSubmitting', () => {
    const { rerender } = render(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        error="Server error occurred"
      />
    )

    expect(screen.getByTestId('invite-error')).toHaveTextContent('Server error occurred')

    rerender(
      <InviteMemberModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        success="Invitation dispatched successfully"
        isSubmitting={true}
      />
    )

    expect(screen.getByTestId('invite-success')).toHaveTextContent('Invitation dispatched successfully')
    const submitBtn = screen.getByTestId('invite-submit-btn')
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveTextContent(/sending.../i)
  })
})
