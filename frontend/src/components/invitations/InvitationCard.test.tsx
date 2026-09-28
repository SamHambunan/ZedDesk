import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InvitationCard } from './InvitationCard'
import type { PublicInvitationData } from './types'

describe('InvitationCard Compound Component', () => {
  const mockInvitationAgent: PublicInvitationData = {
    token: 'agent-token-123',
    email: 'alex@acme.corp',
    organization_name: 'Acme Robotics',
    organization_slug: 'acme',
    role: 'agent',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    invited_by: {
      id: 2,
      name: 'Sarah Connor',
      email: 'sarah@acme.corp',
    },
  }

  const mockInvitationAdmin: PublicInvitationData = {
    token: 'admin-token-456',
    email: 'elena@cyberdyne.corp',
    organization_name: 'Cyberdyne Systems',
    organization_slug: 'cyberdyne',
    role: 'admin',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    inviter_name: 'Miles Dyson',
  }

  it('exposes all compound subcomponents on InvitationCard', () => {
    expect(InvitationCard.Root).toBeDefined()
    expect(InvitationCard.Header).toBeDefined()
    expect(InvitationCard.LockedEmail).toBeDefined()
    expect(InvitationCard.SegmentedToggle).toBeDefined()
    expect(InvitationCard.RegisterForm).toBeDefined()
    expect(InvitationCard.LoginForm).toBeDefined()
    expect(InvitationCard.AuthenticatedUser).toBeDefined()
    expect(InvitationCard.Success).toBeDefined()
    expect(InvitationCard.Error).toBeDefined()
    expect(InvitationCard.Loading).toBeDefined()
  })

  it('renders centered 440px card with organization summary, inviting member, and designated role badge', () => {
    render(<InvitationCard invitation={mockInvitationAgent} />)

    const card = screen.getByTestId('invitation-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('max-w-[440px]')

    // Header info
    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Robotics')
    expect(screen.getByText('AR')).toBeInTheDocument()
    expect(screen.getByTestId('inviting-member')).toHaveTextContent('Sarah Connor')

    // Role badge
    const roleBadge = screen.getByTestId('invitation-role')
    expect(roleBadge).toHaveTextContent('agent')

    // Locked email
    expect(screen.getByTestId('invitation-email')).toHaveTextContent('alex@alex@acme.corp'.replace('alex@alex@', ''))
  })

  it('styles admin role badge with violet accent and displays inviter name when inviter_name is provided', () => {
    render(<InvitationCard invitation={mockInvitationAdmin} />)

    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Cyberdyne Systems')
    expect(screen.getByTestId('inviting-member')).toHaveTextContent('Miles Dyson')

    const roleBadge = screen.getByTestId('invitation-role')
    expect(roleBadge).toHaveTextContent('admin')
    expect(roleBadge).toHaveClass('text-purple-300')
  })

  it('segmented tab toggle switches smoothly between Create Account and Sign In without reload', () => {
    render(<InvitationCard invitation={mockInvitationAgent} />)

    const registerTab = screen.getByTestId('tab-register')
    const loginTab = screen.getByTestId('tab-login')

    expect(registerTab).toHaveTextContent(/Create Account/i)
    expect(loginTab).toHaveTextContent(/Sign In with Existing Account/i)

    // Initially in register mode
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
    expect(loginTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-login-form')).not.toBeInTheDocument()

    // Switch to sign in tab
    fireEvent.click(loginTab)
    expect(loginTab).toHaveAttribute('aria-selected', 'true')
    expect(registerTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('invitation-login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-register-form')).not.toBeInTheDocument()

    // Switch back to register tab
    fireEvent.click(registerTab)
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
  })

  it('renders standalone compound pieces in custom composition', () => {
    const handleTabChange = vi.fn()
    render(
      <InvitationCard.Root className="custom-wrapper">
        <InvitationCard.Header
          organizationName="Custom Org"
          role="admin"
          inviterName="Chief Admin"
        />
        <InvitationCard.LockedEmail email="user@custom.org" />
        <div className="p-4">
          <InvitationCard.SegmentedToggle
            activeTab="login"
            onTabChange={handleTabChange}
          />
        </div>
      </InvitationCard.Root>
    )

    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Custom Org')
    expect(screen.getByTestId('inviting-member')).toHaveTextContent('Chief Admin')
    expect(screen.getByTestId('invitation-email')).toHaveTextContent('user@custom.org')

    const registerTab = screen.getByTestId('tab-register')
    fireEvent.click(registerTab)
    expect(handleTabChange).toHaveBeenCalledWith('register')
  })

  it('renders Error subcomponent with Central Hub return link', () => {
    const handleReturn = vi.fn()
    render(
      <InvitationCard.Error
        error="Token has expired."
        onGoToCentralHub={handleReturn}
      />
    )

    expect(screen.getByTestId('invitation-error-card')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-error')).toHaveTextContent('Token has expired.')

    const returnBtn = screen.getByTestId('go-to-central-hub-btn')
    fireEvent.click(returnBtn)
    expect(handleReturn).toHaveBeenCalledTimes(1)
  })

  it('renders Loading subcomponent with spinner and status message', () => {
    render(<InvitationCard.Loading message="Verifying credentials..." />)

    expect(screen.getByTestId('invitation-loading')).toBeInTheDocument()
    expect(screen.getByText('Verifying credentials...')).toBeInTheDocument()
  })
})
