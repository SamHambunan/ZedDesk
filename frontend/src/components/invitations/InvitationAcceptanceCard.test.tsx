import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InvitationAcceptanceCard } from './InvitationAcceptanceCard'
import type { PublicInvitationData } from './types'

describe('InvitationAcceptanceCard Component', () => {
  const mockInvitationAgent: PublicInvitationData = {
    token: 'valid-agent-token',
    email: 'newagent@acme.corp',
    organization_name: 'Acme Corporation',
    organization_slug: 'acme',
    role: 'agent',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockInvitationAdmin: PublicInvitationData = {
    token: 'valid-admin-token',
    email: 'admin@acme.corp',
    organization_name: 'Stark Industries',
    organization_slug: 'stark',
    role: 'admin',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }

  it('renders organization name, initials avatar, role pill, and locked email', () => {
    render(<InvitationAcceptanceCard invitation={mockInvitationAgent} />)

    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Corporation')
    expect(screen.getByText('AC')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-role')).toHaveTextContent('agent')
    expect(screen.getByTestId('invitation-email')).toHaveTextContent('newagent@acme.corp')
  })

  it('styles admin role pill with violet accent', () => {
    render(<InvitationAcceptanceCard invitation={mockInvitationAdmin} />)

    const rolePill = screen.getByTestId('invitation-role')
    expect(rolePill).toHaveTextContent('admin')
    expect(rolePill).toHaveClass('text-purple-300')
  })

  it('renders register form by default and toggles to login form', () => {
    render(<InvitationAcceptanceCard invitation={mockInvitationAgent} />)

    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-login-form')).not.toBeInTheDocument()

    // Toggle to login form
    fireEvent.click(screen.getByTestId('toggle-existing-user'))
    expect(screen.getByTestId('invitation-login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-register-form')).not.toBeInTheDocument()

    // Toggle back to register form
    fireEvent.click(screen.getByTestId('toggle-register'))
    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
  })

  it('renders authenticated user view when currentUser is provided', () => {
    const handleAcceptLoggedIn = vi.fn()
    const handleLogout = vi.fn()

    render(
      <InvitationAcceptanceCard
        invitation={mockInvitationAgent}
        currentUser={{ id: 5, name: 'Existing User', email: 'existing@acme.corp' }}
        onAcceptLoggedIn={handleAcceptLoggedIn}
        onLogout={handleLogout}
      />
    )

    expect(screen.queryByTestId('invitation-register-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('invitation-login-form')).not.toBeInTheDocument()
    expect(screen.getByText(/logged in as/i)).toBeInTheDocument()
    expect(screen.getByText('Existing User')).toBeInTheDocument()

    // One-click accept
    const acceptBtn = screen.getByTestId('accept-logged-in-btn')
    fireEvent.click(acceptBtn)
    expect(handleAcceptLoggedIn).toHaveBeenCalledTimes(1)

    // Switch user / logout
    const logoutBtn = screen.getByTestId('invitation-logout-btn')
    fireEvent.click(logoutBtn)
    expect(handleLogout).toHaveBeenCalledTimes(1)
  })

  it('renders success state with workspace launch button', () => {
    const handleGoToWorkspace = vi.fn()

    render(
      <InvitationAcceptanceCard
        invitation={mockInvitationAgent}
        acceptSuccess={{
          slug: 'acme',
          role: 'agent',
          organizationName: 'Acme Corporation',
        }}
        onGoToWorkspace={handleGoToWorkspace}
      />
    )

    expect(screen.getByTestId('invitation-accepted-success')).toBeInTheDocument()
    expect(
      screen.getByText(/you are now an organization member of acme corporation/i)
    ).toBeInTheDocument()

    const launchBtn = screen.getByTestId('go-to-workspace-btn')
    fireEvent.click(launchBtn)
    expect(handleGoToWorkspace).toHaveBeenCalledWith('acme')
  })
})
