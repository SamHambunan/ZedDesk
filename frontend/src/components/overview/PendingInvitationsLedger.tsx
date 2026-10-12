import React, { useState } from 'react'
import { Mail, Copy, Trash2, Plus, Clock } from 'lucide-react'
import { Button } from '../ui/Button'
import type { OverviewInvitation } from './types'

export interface PendingInvitationsLedgerProps {
  readonly invitations: readonly OverviewInvitation[]
  readonly subdomain: string
  readonly onRevokeInvitation?: (invitationId: number) => Promise<void> | void
  readonly onIssueNewInvitation?: () => void
  readonly onCopySuccess?: (message: string) => void
}

export const PendingInvitationsLedger: React.FC<PendingInvitationsLedgerProps> = ({
  invitations: initialInvitations,
  subdomain,
  onRevokeInvitation,
  onIssueNewInvitation,
  onCopySuccess,
}) => {
  const [revokedIds, setRevokedIds] = useState<number[]>([])
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const invitations = (initialInvitations || []).filter((item) => !revokedIds.includes(item.id))

  const handleCopyLink = (inv: OverviewInvitation) => {
    // Extract base domain
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173'
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    const targetHost = subdomain && !host.startsWith(`${subdomain}.`) ? `${subdomain}.${host}` : host
    const link = `${protocol}//${targetHost}/invitations/${inv.token}`

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).catch(() => {})
    }

    setCopiedId(inv.id)
    onCopySuccess?.(`Invitation link for ${inv.email} copied to clipboard`)
    setTimeout(() => {
      setCopiedId(null)
    }, 2000)
  }

  const handleRevoke = async (id: number) => {
    setRevokingId(id)
    // Optimistic removal
    setRevokedIds((prev) => [...prev, id])
    try {
      await onRevokeInvitation?.(id)
    } catch {
      // Revert if error
      setRevokedIds((prev) => prev.filter((item) => item !== id))
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div
      data-testid="pending-invitations-ledger"
      className="bg-surface-panel border border-border-subtle rounded-lg p-5 shadow-keylight space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary-container" />
          <h2 className="text-headline-sm font-semibold text-text-primary">
            Pending Invitations Ledger
          </h2>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="compact"
          data-testid="issue-new-invitation-btn"
          onClick={onIssueNewInvitation}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          className="text-primary-container hover:text-amber-hover"
        >
          + Issue New Invitation
        </Button>
      </div>

      {/* Invitations List */}
      <div className="space-y-3">
        {invitations.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-xs font-mono-data border border-dashed border-border-subtle rounded-lg">
            No pending member invitations outstanding.
          </div>
        ) : (
          invitations.map((inv) => {
            const isCopied = copiedId === inv.id
            const isRevoking = revokingId === inv.id
            const isAdmin = inv.role.toLowerCase() === 'admin'

            return (
              <div
                key={inv.id}
                data-testid={`pending-invite-${inv.id}`}
                className="bg-surface-subpanel/60 border border-border-subtle hover:border-border-prominent rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body-default font-medium text-text-primary truncate">
                      {inv.email}
                    </span>
                    <span
                      data-testid={`invitation-role-${inv.id}`}
                      className={`text-[10px] font-mono-data uppercase px-2 py-0.5 rounded border shrink-0 ${
                        isAdmin
                          ? 'bg-primary-container/20 text-primary-container border-primary-container/40'
                          : 'bg-surface-container text-text-secondary border-border-subtle'
                      }`}
                    >
                      {inv.role}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-text-muted mt-1 font-mono-data">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <span>Awaiting acceptance</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    data-testid={`copy-invite-${inv.id}`}
                    onClick={() => handleCopyLink(inv)}
                    className="h-8 px-2.5 bg-surface-container hover:bg-surface-container-high border border-border-prominent text-text-secondary hover:text-text-primary rounded text-xs font-mono-data transition-all flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber"
                  >
                    <Copy className="w-3.5 h-3.5 text-primary-container" />
                    <span>{isCopied ? 'Copied' : 'Copy Link'}</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`revoke-invite-${inv.id}`}
                    disabled={isRevoking}
                    onClick={() => handleRevoke(inv.id)}
                    title="Revoke invitation"
                    aria-label={`Revoke invitation for ${inv.email}`}
                    className="h-8 w-8 bg-surface-container hover:bg-sentiment-critical/20 border border-border-prominent hover:border-sentiment-critical/30 text-text-muted hover:text-sentiment-critical rounded transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
