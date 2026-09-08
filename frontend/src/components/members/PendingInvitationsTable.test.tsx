import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PendingInvitationsTable } from './PendingInvitationsTable'
import type { PendingInvitation } from './types'

describe('PendingInvitationsTable Component', () => {
  const mockInvitations: PendingInvitation[] = [
    {
      id: 11,
      email: 'alex@acme.corp',
      role: 'agent',
      token: 'inv-token-111',
      expires_at: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days in future
      invited_by: {
        id: 1,
        name: 'Sarah Connor',
        email: 'sarah@acme.corp',
      },
    },
    {
      id: 12,
      email: 'dev@acme.corp',
      role: 'admin',
      token: 'inv-token-222',
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour expired
      invited_by: null,
    },
  ]

  it('renders table headers and row items with badge count', () => {
    render(<PendingInvitationsTable invitations={mockInvitations} />)

    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument()
    expect(screen.getByTestId('pending-invitations-count-badge')).toHaveTextContent('2 Awaiting Acceptance')

    // First invitation row
    expect(screen.getByTestId('invitation-row-11')).toBeInTheDocument()
    expect(screen.getByText('alex@acme.corp')).toBeInTheDocument()
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-token-11')).toHaveTextContent('inv-token-111')
    expect(screen.getByTestId('invitation-created-11')).toBeInTheDocument()

    // Second invitation row with null inviter fallback
    expect(screen.getByTestId('invitation-row-12')).toBeInTheDocument()
    expect(screen.getByText('dev@acme.corp')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('calls onCopyLink when copy link button is clicked', () => {
    const handleCopy = vi.fn()
    const { rerender } = render(
      <PendingInvitationsTable
        invitations={mockInvitations}
        onCopyLink={handleCopy}
      />
    )

    const copyBtn = screen.getByTestId('copy-invitation-link-11')
    expect(copyBtn).toHaveTextContent(/copy link/i)
    fireEvent.click(copyBtn)

    expect(handleCopy).toHaveBeenCalledWith(mockInvitations[0])

    // Re-render with copiedId
    rerender(
      <PendingInvitationsTable
        invitations={mockInvitations}
        copiedId={11}
        onCopyLink={handleCopy}
      />
    )
    expect(screen.getByTestId('copy-invitation-link-11')).toHaveTextContent(/copied/i)
  })

  it('calls onRevoke when revoke button is clicked and disables button during revoking', () => {
    const handleRevoke = vi.fn()
    const { rerender } = render(
      <PendingInvitationsTable
        invitations={mockInvitations}
        onRevoke={handleRevoke}
      />
    )

    const revokeBtn = screen.getByTestId('revoke-invitation-btn-11')
    expect(revokeBtn).toHaveTextContent(/revoke/i)
    expect(revokeBtn).not.toBeDisabled()
    fireEvent.click(revokeBtn)

    expect(handleRevoke).toHaveBeenCalledWith(11)

    // Re-render with revokingId
    rerender(
      <PendingInvitationsTable
        invitations={mockInvitations}
        revokingId={11}
        onRevoke={handleRevoke}
      />
    )
    const revokingBtn = screen.getByTestId('revoke-invitation-btn-11')
    expect(revokingBtn).toHaveTextContent(/revoking/i)
    expect(revokingBtn).toBeDisabled()
  })

  it('renders loading state and empty state correctly', () => {
    const { rerender } = render(<PendingInvitationsTable invitations={[]} isLoading={true} />)
    expect(screen.getByTestId('pending-invitations-loading')).toBeInTheDocument()

    rerender(<PendingInvitationsTable invitations={[]} isLoading={false} />)
    expect(screen.getByTestId('pending-invitations-empty')).toBeInTheDocument()
    expect(screen.getByText(/no pending invitations/i)).toBeInTheDocument()
  })
})
