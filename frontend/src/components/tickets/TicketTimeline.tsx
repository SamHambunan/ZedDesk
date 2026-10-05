import React from 'react'
import {
  Lock,
  MessageSquare,
  FileText,
  Download,
  ShieldCheck,
  User,
  Paperclip,
} from 'lucide-react'
import { formatFileSize } from './constants'
import type { TicketMessage, TicketAttachment } from './types'

export interface TicketTimelineItemProps {
  readonly message: TicketMessage
  readonly customerName?: string
  readonly className?: string
}

export interface TicketTimelineProps {
  readonly messages: readonly TicketMessage[]
  readonly customerName?: string
  readonly className?: string
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime()
    const diffMins = Math.max(1, Math.round(diffMs / (60 * 1000)))
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.round(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.round(diffHours / 24)
    return `${diffDays}d ago`
  } catch {
    return 'recently'
  }
}

/**
 * Renders an attachment chip with secure download link.
 */
function AttachmentChip({ attachment }: { readonly attachment: TicketAttachment }) {
  const downloadUrl = attachment.url || `/api/attachments/${attachment.id}/download`

  return (
    <div
      key={attachment.id}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-subpanel/80 border border-[#282A33] hover:border-[#3B3F4D] transition-colors text-xs text-text-secondary group"
    >
      <FileText className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
      <span className="font-mono text-text-primary text-[11px] max-w-[200px] truncate">
        {attachment.file_name}
      </span>
      <span className="font-mono tabular-nums text-[10px] text-text-muted">
        ({formatFileSize(attachment.file_size_bytes)})
      </span>
      <a
        href={downloadUrl}
        download={attachment.file_name}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`attachment-download-link-${attachment.id}`}
        title={`Download ${attachment.file_name}`}
        className="p-1 text-text-muted hover:text-[#F59E0B] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F59E0B] rounded"
      >
        <Download className="w-3 h-3" />
      </a>
    </div>
  )
}

/**
 * PublicReplyItem: Graphite tone message item for public conversation between customers and staff.
 * Memoized to prevent re-rendering when parent or sibling state changes.
 */
export const PublicReplyItem: React.FC<TicketTimelineItemProps> = React.memo(({
  message,
  customerName,
  className = '',
}) => {
  const isCustomer = message.author_type === 'Customer'
  const displayName = isCustomer ? (message.author_name || customerName || 'Customer') : message.author_name

  return (
    <article
      data-testid={`timeline-message-${message.id}`}
      className={`rounded-lg transition-colors p-4 bg-[#121316] border border-[#282A33] shadow-keylight ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              isCustomer
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isCustomer ? <User className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="text-body-default font-medium text-text-primary">
              {displayName}
            </span>

            <div className="flex items-center gap-1.5">
              {isCustomer ? (
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Customer
                </span>
              ) : (
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
                  {message.author_role || 'Staff'}
                </span>
              )}
            </div>
          </div>
        </div>

        <time
          dateTime={message.created_at}
          className="text-[11px] font-mono tabular-nums text-text-muted"
        >
          {formatRelativeTime(message.created_at)}
        </time>
      </div>

      {/* Body */}
      <div className="text-body-default text-text-primary/95 leading-relaxed whitespace-pre-wrap break-words">
        {message.body}
      </div>

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
            <Paperclip className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Attachments ({message.attachments.length})</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}
    </article>
  )
})
PublicReplyItem.displayName = 'PublicReplyItem'

/**
 * InternalNoteItem: Caution-amber tone message item visible strictly to organization staff.
 * Memoized to prevent re-rendering when parent or sibling state changes.
 */
export const InternalNoteItem: React.FC<TicketTimelineItemProps> = React.memo(({
  message,
  className = '',
}) => {
  return (
    <article
      data-testid={`timeline-message-${message.id}`}
      className={`rounded-lg transition-colors p-4 bg-[#F59E0B]/5 border border-[#F59E0B]/25 shadow-keylight ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30">
            <Lock className="w-3.5 h-3.5" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="text-body-default font-medium text-text-primary">
              {message.author_name}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
                {message.author_role || 'Staff'}
              </span>

              <span
                data-testid="internal-note-badge"
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 font-medium"
              >
                <Lock className="w-3 h-3" />
                <span>Staff only — hidden from customer</span>
              </span>
            </div>
          </div>
        </div>

        <time
          dateTime={message.created_at}
          className="text-[11px] font-mono tabular-nums text-text-muted"
        >
          {formatRelativeTime(message.created_at)}
        </time>
      </div>

      {/* Body */}
      <div className="text-body-default text-text-primary/95 leading-relaxed whitespace-pre-wrap break-words">
        {message.body}
      </div>

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
            <Paperclip className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Attachments ({message.attachments.length})</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}
    </article>
  )
})
InternalNoteItem.displayName = 'InternalNoteItem'

/**
 * TicketTimeline component rendering chronological messages using explicit variants.
 */
export const TicketTimelineComponent: React.FC<TicketTimelineProps> = ({
  messages,
  customerName,
  className = '',
}) => {
  if (!messages || messages.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted text-body-sm">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 text-text-muted/40" />
        <p>No messages recorded on this ticket yet.</p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="ticket-timeline">
      {messages.map((msg) => {
        if (msg.message_type === 'internal_note') {
          return (
            <InternalNoteItem
              key={msg.id}
              message={msg}
              customerName={customerName}
            />
          )
        }

        return (
          <PublicReplyItem
            key={msg.id}
            message={msg}
            customerName={customerName}
          />
        )
      })}
    </div>
  )
}

export const TicketTimeline = Object.assign(TicketTimelineComponent, {
  PublicReplyItem,
  InternalNoteItem,
})
