import React from 'react'
import { Send } from 'lucide-react'
import {
  Composer,
  type ComposerSubmitPayload,
} from '../tickets/TicketComposer'
import type { PortalTicketStatus } from './types'

export interface CustomerPortalReplyComposerProps {
  readonly ticketUuid: string
  readonly currentStatus?: PortalTicketStatus
  readonly onSubmitReply: (payload: { body: string; files?: readonly File[] }) => Promise<void> | void
  readonly isSubmitting?: boolean
  readonly className?: string
}

/**
 * CustomerPortalReplyComposer: Dedicated customer-facing reply composer variant.
 * Reuses compound Composer.* primitives while strictly omitting internal notes and next-status controls.
 */
export const CustomerPortalReplyComposer: React.FC<CustomerPortalReplyComposerProps> = ({
  currentStatus = 'open',
  onSubmitReply,
  isSubmitting = false,
  className = '',
}) => {
  const handleSubmit = async (payload: ComposerSubmitPayload) => {
    await onSubmitReply({
      body: payload.body,
      files: payload.files,
    })
  }

  return (
    <div data-testid="customer-portal-reply-composer" className={className}>
      <Composer.Provider
        currentStatus={currentStatus}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialTab="public_reply"
      >
        <Composer.Frame>
          {/* Customer Header */}
          <div className="flex items-center justify-between border-b border-[#282A33] px-3.5 py-2.5 bg-[#0F1012]/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <Send className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Reply to Support</span>
            </div>
          </div>

          {/* Composer Input Area */}
          <Composer.Input placeholder="Type your reply to our support team (Ctrl+Enter to send)..." />

          {/* Composer Footer (Attachments, Send Reply, strictly NO status selector) */}
          <Composer.Footer>
            <Composer.Submit label="Send Reply" />
          </Composer.Footer>
        </Composer.Frame>
      </Composer.Provider>
    </div>
  )
}

CustomerPortalReplyComposer.displayName = 'CustomerPortalReplyComposer'
