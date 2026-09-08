import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InvitationRegisterForm } from './InvitationRegisterForm'

describe('InvitationRegisterForm Component', () => {
  it('renders all form fields and submit button', () => {
    render(
      <InvitationRegisterForm
        onSubmit={vi.fn()}
        onToggleExistingUser={vi.fn()}
      />
    )

    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
    expect(screen.getByTestId('accept-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('accept-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('accept-password-confirm-input')).toBeInTheDocument()
    expect(screen.getByTestId('accept-new-user-btn')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-existing-user')).toBeInTheDocument()
  })

  it('validates name presence, password length, and password match', async () => {
    const handleSubmit = vi.fn()
    render(
      <InvitationRegisterForm
        onSubmit={handleSubmit}
        onToggleExistingUser={vi.fn()}
      />
    )

    const form = screen.getByTestId('invitation-register-form')
    const nameInput = screen.getByTestId('accept-name-input')
    const passwordInput = screen.getByTestId('accept-password-input')
    const confirmInput = screen.getByTestId('accept-password-confirm-input')

    // 1. Missing name
    fireEvent.submit(form)
    expect(screen.getByTestId('accept-error')).toHaveTextContent(/enter your full name/i)
    expect(handleSubmit).not.toHaveBeenCalled()

    // 2. Short password (< 8 chars)
    fireEvent.change(nameInput, { target: { value: 'Alex Rivera' } })
    fireEvent.change(passwordInput, { target: { value: 'short' } })
    fireEvent.submit(form)
    expect(screen.getByTestId('accept-error')).toHaveTextContent(/at least 8 characters/i)
    expect(handleSubmit).not.toHaveBeenCalled()

    // 3. Password mismatch
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'password456' } })
    fireEvent.submit(form)
    expect(screen.getByTestId('accept-error')).toHaveTextContent(/passwords do not match/i)
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('submits valid registration details', async () => {
    const handleSubmit = vi.fn()
    render(
      <InvitationRegisterForm
        onSubmit={handleSubmit}
        onToggleExistingUser={vi.fn()}
      />
    )

    fireEvent.change(screen.getByTestId('accept-name-input'), {
      target: { value: 'Alex Rivera' },
    })
    fireEvent.change(screen.getByTestId('accept-password-input'), {
      target: { value: 'SuperSecret123!' },
    })
    fireEvent.change(screen.getByTestId('accept-password-confirm-input'), {
      target: { value: 'SuperSecret123!' },
    })

    fireEvent.submit(screen.getByTestId('invitation-register-form'))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        'Alex Rivera',
        'SuperSecret123!',
        'SuperSecret123!'
      )
    })
  })

  it('toggles to existing user form when link is clicked', () => {
    const handleToggle = vi.fn()
    render(
      <InvitationRegisterForm
        onSubmit={vi.fn()}
        onToggleExistingUser={handleToggle}
      />
    )

    fireEvent.click(screen.getByTestId('toggle-existing-user'))
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('displays server error and handles isSubmitting state', () => {
    const { rerender } = render(
      <InvitationRegisterForm
        onSubmit={vi.fn()}
        onToggleExistingUser={vi.fn()}
        error="Registration failed: email unavailable"
      />
    )

    expect(screen.getByTestId('accept-error')).toHaveTextContent(
      'Registration failed: email unavailable'
    )

    rerender(
      <InvitationRegisterForm
        onSubmit={vi.fn()}
        onToggleExistingUser={vi.fn()}
        isSubmitting={true}
      />
    )

    const submitBtn = screen.getByTestId('accept-new-user-btn')
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveTextContent(/accepting & launching.../i)
  })
})
