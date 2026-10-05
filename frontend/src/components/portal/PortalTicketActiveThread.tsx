import React, { useMemo } from 'react'
import {
  MessageSquare,
  FileText,
  Download,
  ShieldCheck,
  User,
  Paperclip,
} from 'lucide-react'
import { formatFileSize, formatRelativeTime } from '../tickets/constants'
import type { PortalMessage, PortalAttachment } from './types'

export interface PortalTicketActiveThreadProps {
  readonly messages: readonly PortalMessage[]
  readonly customerName?: string
  readonly ticketUuid?: string
  readonly apiUrl?: string
  readonly className?: string
  readonly ref?: React.Ref<HTMLDivElement>
}

/**
 * Hoisted static empty thread view (rendering-hoist-jsx)
 */
const EMPTY_THREAD_VIEW = (
  <div className="py-10 text-center text-text-muted text-body-sm bg-surface-subpanel/30 border border-border-subtle rounded-xl">
    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-text-muted/40" />
    <p>No messages recorded on this ticket yet.</p>
  </div>
)

interface AttachmentItemProps {
  readonly attachment: PortalAttachment
  readonly ticketUuid?: string
  readonly apiUrl?: string
}

function AttachmentItem({ attachment, ticketUuid, apiUrl }: AttachmentItemProps) {
  const downloadUrl =
    attachment.url ||
    (apiUrl && ticketUuid
      ? `${apiUrl}/api/portal/tickets/${ticketUuid}/attachments/${attachment.id}`
      : `/api/portal/tickets/attachments/${attachment.id}`)

  return (
    <div
      data-testid={`portal-attachment-${attachment.id}`}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-subpanel/80 border border-border-subtle hover:border-border-prominent transition-colors text-xs text-text-secondary group"
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
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

/**
 * PortalTicketActiveThread: Dedicated public thread component in Warm Alabaster styling.
 * Strictly excludes any internal notes authored by staff from the DOM.
 */
export const PortalTicketActiveThread: React.FC<PortalTicketActiveThreadProps> = ({
  messages,
  customerName,
  ticketUuid,
  apiUrl,
  className = '',
  ref,
}) => {
  // Defense-in-depth: strictly filter out staff internal notes from DOM
  const publicMessages = useMemo(() => {
    return messages.filter(
      (msg) =>
        msg.message_type === 'public_reply' ||
        (!msg.is_internal && msg.message_type !== 'internal_note')
    )
  }, [messages])

  if (publicMessages.length === 0) {
    return EMPTY_THREAD_VIEW
  }

  return (
    <div ref={ref} data-testid="portal-ticket-active-thread" className={`space-y-4 ${className}`}>
      {publicMessages.map((msg) => {
        const isCustomer =
          msg.author_type === 'Customer' ||
          msg.author_type === 'App\\Models\\Customer' ||
          (!msg.author_type && !msg.author_role)

        const displayName = isCustomer
          ? msg.author_name || customerName || 'You'
          : msg.author_name || 'Support Agent'

        return (
          <article
            key={msg.id}
            data-testid={`portal-thread-message-${msg.id}`}
            className="rounded-xl transition-colors p-4 sm:p-5 bg-surface-subpanel/50 border border-border-subtle shadow-card"
          >
            {/* Message Header */}
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

                <div className="flex items-center gap-2">
                  <span className="text-body-default font-semibold text-text-primary">
                    {displayName}
                  </span>

                  <span
                    className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                      isCustomer
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {isCustomer ? 'Customer' : 'Support Team'}
                  </span>
                </div>
              </div>

              <time
                dateTime={msg.created_at}
                className="text-[11px] font-mono tabular-nums text-text-muted"
              >
                {formatRelativeTime(msg.created_at)}
              </time>
            </div>

            {/* Message Body */}
            <div className="text-body-default text-text-primary/95 leading-relaxed whitespace-pre-wrap break-words">
              {msg.body}
            </div>

            {/* Attachments Tray */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="mt-3.5 pt-3 border-t border-white/5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
                  <Paperclip className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Attachments ({msg.attachments.length})</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att) => (
                    <AttachmentItem
                      key={att.id}
                      attachment={att}
                      ticketUuid={ticketUuid}
                      apiUrl={apiUrl}
                    />
                  ))}
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

PortalTicketActiveThread.displayName = 'PortalTicketActiveThread'
