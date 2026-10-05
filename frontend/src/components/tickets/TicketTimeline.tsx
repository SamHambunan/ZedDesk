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
import type { TicketMessage } from './types'

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

export const TicketTimeline: React.FC<TicketTimelineProps> = ({
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
        const isInternalNote = msg.message_type === 'internal_note'
        const isCustomer = msg.author_type === 'Customer'

        return (
          <article
            key={msg.id}
            data-testid={`timeline-message-${msg.id}`}
            className={`rounded-lg transition-colors p-4 ${
              isInternalNote
                ? 'bg-[#F59E0B]/5 border border-[#F59E0B]/25 shadow-keylight'
                : 'bg-[#121316] border border-[#282A33] shadow-keylight'
            }`}
          >
            {/* Message Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    isCustomer
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : isInternalNote
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {isCustomer ? <User className="w-3.5 h-3.5" /> : isInternalNote ? <Lock className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="text-body-default font-medium text-text-primary">
                    {isCustomer ? (msg.author_name || customerName || 'Customer') : msg.author_name}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isCustomer ? (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Customer
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
                        {msg.author_role || 'Staff'}
                      </span>
                    )}

                    {isInternalNote && (
                      <span
                        data-testid="internal-note-badge"
                        className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 font-medium"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Staff only — hidden from customer</span>
                      </span>
                    )}
                  </div>
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
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
                  <Paperclip className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Attachments ({msg.attachments.length})</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-subpanel/80 border border-[#282A33] hover:border-[#3B3F4D] transition-colors text-xs text-text-secondary group"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span className="font-mono text-text-primary text-[11px] max-w-[200px] truncate">
                        {att.file_name}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-text-muted">
                        ({formatFileSize(att.file_size_bytes)})
                      </span>
                      <button
                        type="button"
                        title={`Download ${att.file_name}`}
                        className="p-1 text-text-muted hover:text-[#F59E0B] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F59E0B] rounded"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
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
