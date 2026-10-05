import React from 'react'
import { Lock, PlusCircle, History } from 'lucide-react'
import { Button } from '../ui/Button'

export interface PortalTicketClosedBannerProps {
  readonly ticketNumber?: number
  readonly onNewInquiry?: () => void
  readonly onFindTickets?: () => void
  readonly className?: string
}

/**
 * PortalTicketClosedBanner: Explicit variant rendered in place of the composer
 * when a ticket is closed, informing customers that thread replies are rejected.
 */
export const PortalTicketClosedBanner: React.FC<PortalTicketClosedBannerProps> = ({
  ticketNumber,
  onNewInquiry,
  onFindTickets,
  className = '',
}) => {
  return (
    <div
      data-testid="portal-ticket-closed-banner"
      className={`rounded-xl border border-border-subtle bg-surface-subpanel/50 p-5 shadow-card ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-surface-subpanel flex items-center justify-center text-text-muted shrink-0 border border-border-subtle">
            <Lock className="w-4 h-4 text-text-muted" />
          </div>
          <div>
            <h4 className="text-body-default font-semibold text-text-primary">
              This ticket is closed
            </h4>
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
              Ticket {ticketNumber ? `#${ticketNumber}` : ''} has been resolved and closed. Further replies to this thread are locked out.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onNewInquiry && (
            <Button
              type="button"
              variant="primary"
              size="compact"
              data-testid="portal-closed-new-ticket-btn"
              onClick={onNewInquiry}
              leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
            >
              Submit New Inquiry
            </Button>
          )}

          {onFindTickets && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              data-testid="portal-closed-find-tickets-btn"
              onClick={onFindTickets}
              leftIcon={<History className="w-3.5 h-3.5" />}
            >
              View All Tickets
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

PortalTicketClosedBanner.displayName = 'PortalTicketClosedBanner'
