import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InvitationLoginForm } from './InvitationLoginForm'

describe('InvitationLoginForm Component', () => {
  it('renders prefilled email and password input', () => {
    render(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={vi.fn()}
        onToggleRegister={vi.fn()}
      />
    )

    expect(screen.getByTestId('invitation-login-form')).toBeInTheDocument()
    expect(screen.getByTestId('accept-login-email-input')).toHaveValue('alex@acme.corp')
    expect(screen.getByTestId('accept-login-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('accept-existing-user-btn')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-register')).toBeInTheDocument()
  })

  it('validates password requirement before submission', () => {
    const handleSubmit = vi.fn()
    render(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={handleSubmit}
        onToggleRegister={vi.fn()}
      />
    )

    fireEvent.submit(screen.getByTestId('invitation-login-form'))

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('accept-error')).toHaveTextContent(/password is required/i)
  })

  it('submits credentials when valid', async () => {
    const handleSubmit = vi.fn()
    render(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={handleSubmit}
        onToggleRegister={vi.fn()}
      />
    )

    fireEvent.change(screen.getByTestId('accept-login-password-input'), {
      target: { value: 'SecretPassword123' },
    })
    fireEvent.submit(screen.getByTestId('invitation-login-form'))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('SecretPassword123', 'alex@acme.corp')
    })
  })

  it('toggles to register form when toggle link is clicked', () => {
    const handleToggle = vi.fn()
    render(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={vi.fn()}
        onToggleRegister={handleToggle}
      />
    )

    fireEvent.click(screen.getByTestId('toggle-register'))
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('displays error and handles isSubmitting state', () => {
    const { rerender } = render(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={vi.fn()}
        onToggleRegister={vi.fn()}
        error="Invalid credentials"
      />
    )

    expect(screen.getByTestId('accept-error')).toHaveTextContent('Invalid credentials')

    rerender(
      <InvitationLoginForm
        defaultEmail="alex@acme.corp"
        onSubmit={vi.fn()}
        onToggleRegister={vi.fn()}
        isSubmitting={true}
      />
    )

    const submitBtn = screen.getByTestId('accept-existing-user-btn')
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveTextContent(/signing in & joining.../i)
  })
})
