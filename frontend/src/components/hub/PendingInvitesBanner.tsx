import React from 'react'
import { Mail } from 'lucide-react'
import { hubContentData } from '../../data/mockData'

export interface PendingInvitationItem {
  readonly id: number | string
  readonly organizationName: string
  readonly role?: string
  readonly token?: string
}

export interface PendingInvitesBannerProps {
  readonly invitations: readonly PendingInvitationItem[]
  readonly onAccept?: (invitation: PendingInvitationItem) => void
  readonly onDecline?: (invitation: PendingInvitationItem) => void
  readonly isAccepting?: boolean
  readonly className?: string
}

export const PendingInvitesBanner: React.FC<PendingInvitesBannerProps> = ({
  invitations,
  onAccept,
  onDecline,
  isAccepting = false,
  className = '',
}) => {
  if (!invitations || invitations.length === 0) {
    return null
  }

  const primaryInvite = invitations[0]
  const count = invitations.length

  return (
    <div
      role="region"
      aria-label="Pending Invitations"
      className={`bg-sentiment-warning/10 border border-sentiment-warning/30 rounded-lg p-4 flex items-start gap-3 shadow-sm ${className}`}
    >
      <Mail className="w-5 h-5 text-sentiment-warning mt-0.5 shrink-0" />
      <div className="flex flex-col gap-2 w-full">
        <span className="font-title-md text-title-md text-sentiment-warning drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
          {count} {hubContentData.invitations.title}
        </span>
        <span className="font-body-compact text-body-compact text-text-secondary">
          You've been invited to join "{primaryInvite.organizationName}".
        </span>
        <div className="flex gap-2 mt-1">
          {onAccept && (
            <button
              type="button"
              disabled={isAccepting}
              onClick={() => onAccept(primaryInvite)}
              className="text-xs font-semibold text-text-primary bg-sentiment-warning/20 border border-sentiment-warning/50 rounded px-2.5 py-1 hover:bg-sentiment-warning/30 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {hubContentData.invitations.accept}
            </button>
          )}
          {onDecline && (
            <button
              type="button"
              disabled={isAccepting}
              onClick={() => onDecline(primaryInvite)}
              className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {hubContentData.invitations.decline}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PendingInvitesBanner
