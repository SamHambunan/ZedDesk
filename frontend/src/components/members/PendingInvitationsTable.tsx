import React from 'react'
import { Clock, Copy, Check, Trash2 } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/Table'
import { Badge } from '../ui/Badge'
import { membersContentData } from '../../data/mockData'
import type { PendingInvitation } from './types'

export interface PendingInvitationsTableProps {
  readonly invitations: readonly PendingInvitation[]
  readonly isLoading?: boolean
  readonly revokingId?: number | null
  readonly copiedId?: number | null
  readonly onCopyLink?: (invitation: PendingInvitation) => void
  readonly onRevoke?: (invitationId: number) => void
  readonly className?: string
}

function formatExpiresIn(expiresAtIso: string): string {
  try {
    const expires = new Date(expiresAtIso).getTime()
    const now = Date.now()
    const diffMs = expires - now

    if (diffMs <= 0) return 'Expired'

    const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
    const totalMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (totalHours >= 48) {
      const days = Math.floor(totalHours / 24)
      const remainingHours = totalHours % 24
      return `${days}d ${remainingHours}h`
    }

    if (totalHours >= 1) {
      return `${totalHours}h ${totalMinutes}m`
    }

    return `${totalMinutes}m`
  } catch {
    return '7 days'
  }
}

export const PendingInvitationsTable: React.FC<PendingInvitationsTableProps> = ({
  invitations,
  isLoading = false,
  revokingId = null,
  copiedId = null,
  onCopyLink,
  onRevoke,
  className = '',
}) => {
  return (
    <section data-testid="pending-invitations-section" className={`flex flex-col gap-3 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <h2 className="font-headline-sm text-headline-sm text-text-primary font-semibold">
          {membersContentData.pendingSection.title}
        </h2>
        <Badge
          variant="warning"
          data-testid="pending-invitations-count-badge"
          className="uppercase"
        >
          {invitations.length} {membersContentData.pendingSection.badgeSuffix}
        </Badge>
      </div>

      {isLoading ? (
        <div
          data-testid="pending-invitations-loading"
          className="h-28 flex items-center justify-center bg-surface-subpanel rounded border border-border-subtle text-text-muted text-body-compact"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-sentiment-warning border-t-transparent animate-spin" />
            <span>Loading invitations...</span>
          </div>
        </div>
      ) : invitations.length === 0 ? (
        <div
          data-testid="pending-invitations-empty"
          className="h-24 flex items-center justify-center bg-surface-subpanel rounded border border-border-subtle text-text-muted text-body-compact italic"
        >
          {membersContentData.pendingSection.emptyMessage}
        </div>
      ) : (
        <div
          data-testid="invitations-list"
          className="bg-surface-subpanel rounded border border-border-subtle overflow-hidden shadow-keylight flex flex-col"
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-panel h-10 border-b border-border-subtle">
                <TableHead className="w-[24%] min-w-[180px] text-label-caps font-label-caps text-text-muted uppercase">
                  {membersContentData.pendingSection.columns.invitedEmail}
                </TableHead>
                <TableHead className="w-[12%] text-label-caps font-label-caps text-text-muted uppercase">
                  {membersContentData.pendingSection.columns.assignedRole}
                </TableHead>
                <TableHead className="w-[18%] text-label-caps font-label-caps text-text-muted uppercase">
                  {membersContentData.pendingSection.columns.invitedBy}
                </TableHead>
                <TableHead className="w-[12%] text-label-caps font-label-caps text-text-muted uppercase text-left">
                  {membersContentData.pendingSection.columns.createdDate}
                </TableHead>
                <TableHead className="w-[14%] text-label-caps font-label-caps text-text-muted uppercase text-left">
                  {membersContentData.pendingSection.columns.expiresIn}
                </TableHead>
                <TableHead className="w-[12%] text-label-caps font-label-caps text-text-muted uppercase">
                  {membersContentData.pendingSection.columns.invitationLink}
                </TableHead>
                <TableHead align="center" className="w-[8%] text-label-caps font-label-caps text-text-muted uppercase">
                  {membersContentData.pendingSection.columns.action}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => {
                const isRevoking = revokingId === inv.id
                const isCopied = copiedId === inv.id
                const roleCapitalized =
                  (inv.role || 'agent').charAt(0).toUpperCase() + (inv.role || 'agent').slice(1).toLowerCase()
                const inviterName = inv.invited_by?.name || 'System'
                const expiresFormatted = formatExpiresIn(inv.expires_at)
                const createdFormatted = inv.created_at ? inv.created_at.slice(0, 10) : 'Recent'

                return (
                  <TableRow
                    key={inv.id}
                    data-testid={`invitation-row-${inv.id}`}
                    className="h-10 border-b border-border-subtle hover:bg-surface-container-high/60 transition-colors group cursor-default"
                  >
                    {/* Invited Email & hidden token testid */}
                    <TableCell className="py-1">
                      <div className="flex items-center gap-2 overflow-hidden text-text-secondary">
                        <Clock className="w-3.5 h-3.5 text-sentiment-warning shrink-0" />
                        <span className="font-mono-data text-mono-data text-text-primary truncate">
                          {inv.email}
                        </span>
                        <code
                          data-testid={`invitation-token-${inv.id}`}
                          className="sr-only"
                        >
                          {inv.token}
                        </code>
                      </div>
                    </TableCell>

                    {/* Assigned Role */}
                    <TableCell className="py-1">
                      <span className="font-label-regular text-label-regular text-text-primary capitalize">
                        {roleCapitalized}
                      </span>
                    </TableCell>

                    {/* Invited By */}
                    <TableCell className="py-1">
                      <span className="font-label-regular text-label-regular text-text-muted truncate block">
                        {inviterName}
                      </span>
                    </TableCell>

                    {/* Created Date */}
                    <TableCell numeric className="py-1 text-left">
                      <span
                        data-testid={`invitation-created-${inv.id}`}
                        className="font-mono-data text-mono-data text-text-muted tabular-nums"
                      >
                        {createdFormatted}
                      </span>
                    </TableCell>

                    {/* Expires In */}
                    <TableCell numeric className="py-1 text-left">
                      <div className="font-mono-data text-mono-data text-text-muted tabular-nums flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-sentiment-warning shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
                        <span>{expiresFormatted}</span>
                      </div>
                    </TableCell>

                    {/* Invitation Link Action */}
                    <TableCell className="py-1">
                      <button
                        type="button"
                        data-testid={`copy-invitation-link-${inv.id}`}
                        onClick={() => onCopyLink?.(inv)}
                        className={`inline-flex items-center gap-1 text-[11px] font-label-caps font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                          isCopied
                            ? 'text-sentiment-positive'
                            : 'text-accent-glow hover:text-primary-fixed'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>{membersContentData.pendingSection.copiedLink}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{membersContentData.pendingSection.copyLink}</span>
                          </>
                        )}
                      </button>
                    </TableCell>

                    {/* Revoke Action */}
                    <TableCell align="center" className="py-1">
                      <button
                        type="button"
                        data-testid={`revoke-invitation-btn-${inv.id}`}
                        disabled={isRevoking}
                        onClick={() => onRevoke?.(inv.id)}
                        className="inline-flex items-center gap-1 text-sentiment-critical hover:text-red-400 font-label-caps text-[11px] uppercase tracking-wider transition-colors p-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 sm:hidden" />
                        <span className="hidden sm:inline">
                          {isRevoking
                            ? membersContentData.pendingSection.revoking
                            : membersContentData.pendingSection.revoke}
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

PendingInvitationsTable.displayName = 'PendingInvitationsTable'
