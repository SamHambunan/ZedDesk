import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PublicInvitationView } from './PublicInvitationView'
import type { PublicInvitationData } from './types'

describe('PublicInvitationView Component', () => {
  const mockInvitation: PublicInvitationData = {
    token: 'test-token',
    email: 'newperson@acme.corp',
    organization_name: 'Acme Corporation',
    organization_slug: 'acme',
    role: 'agent',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }

  it('renders branding header and security footer', () => {
    render(
      <PublicInvitationView
        invitation={mockInvitation}
      />
    )

    expect(screen.getByTestId('public-invitation-view')).toBeInTheDocument()
    expect(screen.getByText('ZedDesk')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(
      screen.getByText(/ZedDesk Secure Multi-Tenant Perimeter • Sanctum Bearer Authentication/i)
    ).toBeInTheDocument()
  })

  it('renders loading state when isLoading is true', () => {
    render(
      <PublicInvitationView
        invitation={null}
        isLoading={true}
      />
    )

    expect(screen.getByTestId('invitation-loading')).toBeInTheDocument()
    expect(screen.getByText(/validating invitation credentials.../i)).toBeInTheDocument()
  })

  it('renders error state with return button when token is invalid or expired', () => {
    const handleGoToCentralHub = vi.fn()
    render(
      <PublicInvitationView
        invitation={null}
        error="This invitation has expired or been revoked."
        onGoToCentralHub={handleGoToCentralHub}
      />
    )

    expect(screen.getByTestId('invitation-error-card')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-error')).toHaveTextContent(
      'This invitation has expired or been revoked.'
    )

    const returnBtn = screen.getByTestId('go-to-central-hub-btn')
    expect(returnBtn).toBeInTheDocument()
    fireEvent.click(returnBtn)
    expect(handleGoToCentralHub).toHaveBeenCalledTimes(1)
  })

  it('renders InvitationAcceptanceCard when invitation is valid', () => {
    render(
      <PublicInvitationView
        invitation={mockInvitation}
      />
    )

    expect(screen.getByTestId('invitation-acceptance-card')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Corporation')
  })
})
