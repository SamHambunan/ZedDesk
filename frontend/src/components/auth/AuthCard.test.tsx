import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AuthCard } from './AuthCard'

describe('AuthCard Component', () => {
  const defaultProps = {
    activeTab: 'login' as const,
    onTabChange: vi.fn(),
    loginEmail: '',
    setLoginEmail: vi.fn(),
    loginPassword: '',
    setLoginPassword: vi.fn(),
    loginError: null,
    isLoggingIn: false,
    onLoginSubmit: vi.fn((e) => e.preventDefault()),
    regName: '',
    setRegName: vi.fn(),
    regEmail: '',
    setRegEmail: vi.fn(),
    regPassword: '',
    setRegPassword: vi.fn(),
    regPasswordConfirm: '',
    setRegPasswordConfirm: vi.fn(),
    regError: null,
    isRegistering: false,
    onRegisterSubmit: vi.fn((e) => e.preventDefault()),
  }

  it('renders sign in view with brand masthead and form controls', () => {
    render(<AuthCard {...defaultProps} />)

    expect(screen.getByText('ZedDesk')).toBeInTheDocument()
    expect(screen.getByText('Multi-tenant AI-Powered Helpdesk')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /log in/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'false')

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^log in$/i })).toBeInTheDocument()
  })

  it('calls onTabChange when tabs are clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<AuthCard {...defaultProps} onTabChange={onTabChange} />)

    await user.click(screen.getByRole('tab', { name: /register/i }))
    expect(onTabChange).toHaveBeenCalledWith('register')
  })

  it('renders registration form controls when activeTab is register', () => {
    render(<AuthCard {...defaultProps} activeTab="register" />)

    expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^register$/i })).toBeInTheDocument()
  })

  it('toggles password visibility when eye icon button is clicked', async () => {
    const user = userEvent.setup()
    render(<AuthCard {...defaultProps} loginPassword="SecretPassword123" />)

    const passwordInput = screen.getByLabelText(/^password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleButton = screen.getByLabelText(/show password/i)
    await user.click(toggleButton)

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/hide password/i)).toBeInTheDocument()
  })

  it('toggles confirm password visibility in registration form', async () => {
    const user = userEvent.setup()
    render(<AuthCard {...defaultProps} activeTab="register" regPasswordConfirm="SecretConfirm123" />)

    const confirmInput = screen.getByLabelText(/confirm password/i)
    expect(confirmInput).toHaveAttribute('type', 'password')

    const toggleButtons = screen.getAllByLabelText(/show password/i)
    // The second toggle button is for confirm password
    await user.click(toggleButtons[toggleButtons.length - 1])

    expect(confirmInput).toHaveAttribute('type', 'text')
  })

  it('displays error alerts when loginError or regError is present', () => {
    const { rerender } = render(<AuthCard {...defaultProps} loginError="Invalid credentials" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')

    rerender(<AuthCard {...defaultProps} activeTab="register" regError="Email already exists" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Email already exists')
  })

  it('triggers onLoginSubmit and onRegisterSubmit on submit button click', async () => {
    const user = userEvent.setup()
    const onLoginSubmit = vi.fn((e) => e.preventDefault())
    const { rerender } = render(
      <AuthCard
        {...defaultProps}
        loginEmail="test@example.com"
        loginPassword="password123"
        onLoginSubmit={onLoginSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(onLoginSubmit).toHaveBeenCalled()

    const onRegisterSubmit = vi.fn((e) => e.preventDefault())
    rerender(
      <AuthCard
        {...defaultProps}
        activeTab="register"
        regName="Sarah Connor"
        regEmail="sarah@example.com"
        regPassword="password123"
        regPasswordConfirm="password123"
        onRegisterSubmit={onRegisterSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: /^register$/i }))
    expect(onRegisterSubmit).toHaveBeenCalled()
  })

  it('keeps tabs and form controls reachable by keyboard', async () => {
    const user = userEvent.setup()
    render(<AuthCard {...defaultProps} />)
    await user.tab()
    expect(screen.getByRole('tab', { name: /log in/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('tab', { name: /register/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText(/^email/i)).toHaveFocus()
  })

  it('displays crimson borders and accessible inline alert text on Sign In validation failure', async () => {
    const user = userEvent.setup()
    const onLoginSubmit = vi.fn((e) => e.preventDefault())
    render(<AuthCard {...defaultProps} onLoginSubmit={onLoginSubmit} />)

    // Submit empty
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(onLoginSubmit).not.toHaveBeenCalled()

    const emailInput = screen.getByLabelText(/^email/i)
    const passwordInput = screen.getByLabelText(/^password/i)

    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Email is required.')).toBeInTheDocument()

    expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
  })

  it('displays crimson borders and accessible inline alert text on Register validation failure', async () => {
    const user = userEvent.setup()
    const onRegisterSubmit = vi.fn((e) => e.preventDefault())
    render(<AuthCard {...defaultProps} activeTab="register" onRegisterSubmit={onRegisterSubmit} />)

    // Submit empty
    await user.click(screen.getByRole('button', { name: /^register$/i }))
    expect(onRegisterSubmit).not.toHaveBeenCalled()

    expect(screen.getByText('Full name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByText('Please confirm your password.')).toBeInTheDocument()

    const nameInput = screen.getByLabelText(/name/i)
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  })
})
