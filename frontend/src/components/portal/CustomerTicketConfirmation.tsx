import React, { useState } from 'react'
import { CheckCircle2, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react'

export interface CustomerTicketConfirmationProps {
  ticketNumber: number
  subject: string
  token: string
  accessUrl?: string
  customerEmail?: string
  onReset: () => void
}

export const CustomerTicketConfirmation: React.FC<CustomerTicketConfirmationProps> = ({
  ticketNumber,
  subject,
  token,
  accessUrl,
  customerEmail,
  onReset,
}) => {
  const [copied, setCopied] = useState(false)

  // Determine the full ticket access link (either from backend access_url or built from current URL)
  const fullAccessUrl =
    accessUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/portal/tickets/${ticketNumber}?token=${encodeURIComponent(token)}`
      : `http://localhost:8000/portal/tickets/${ticketNumber}?token=${encodeURIComponent(token)}`)

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullAccessUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = fullAccessUrl
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div data-testid="portal-success-card" className="space-y-6 animate-in fade-in duration-200">
      <div
        data-testid="portal-success-message"
        className="p-4 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded-lg text-sentiment-positive text-body-sm font-medium flex items-center gap-3"
      >
        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Ticket submitted successfully!</p>
          <p className="text-xs text-sentiment-positive/80 mt-0.5">
            Your inquiry has been assigned to our queue. We'll update you via email or your direct access link.
          </p>
        </div>
      </div>

      <div className="bg-surface-subpanel border border-border-subtle rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <span className="text-xs uppercase font-semibold tracking-wider text-text-muted">Ticket Number</span>
          <span
            data-testid="portal-submitted-ticket-number"
            className="text-headline-sm font-bold text-accent-indigo-glow font-mono"
          >
            #{ticketNumber}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-text-muted">Subject:</span>
          <p data-testid="portal-confirmed-subject" className="text-body-sm font-medium text-text-primary">
            {subject}
          </p>
        </div>

        {customerEmail && (
          <div className="space-y-1">
            <span className="text-xs text-text-muted">Contact Email:</span>
            <p className="text-body-sm text-text-secondary">{customerEmail}</p>
          </div>
        )}

        <div className="pt-3 border-t border-border-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Direct Signed Access Link</span>
            <span className="text-[11px] text-text-muted">Save this link to track your ticket</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              data-testid="portal-access-link-input"
              value={fullAccessUrl}
              className="flex-1 h-9 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-xs font-mono text-text-muted truncate focus:outline-none"
            />
            <button
              type="button"
              data-testid="portal-copy-link-btn"
              onClick={handleCopyLink}
              className={`h-9 px-4 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors border ${
                copied
                  ? 'bg-sentiment-positive/10 border-sentiment-positive/40 text-sentiment-positive'
                  : 'bg-primary-container hover:bg-primary-dark text-white border-transparent shadow-keylight-primary'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2 flex flex-col gap-1">
            <span className="text-text-muted text-xs">Customer Access Token:</span>
            <code
              data-testid="portal-access-token"
              className="text-xs bg-surface-canvas p-2 rounded break-all text-accent-indigo-glow font-mono select-all"
            >
              {token}
            </code>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          data-testid="portal-submit-another"
          onClick={onReset}
          className="w-full h-10 bg-surface-subpanel hover:bg-surface-canvas border border-border-subtle text-text-primary text-label-md font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4 text-text-muted" />
          <span>Submit Another Inquiry</span>
        </button>

        <a
          href={fullAccessUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="portal-view-ticket-link"
          className="w-full h-10 bg-surface-container-high hover:bg-surface-container-highest border border-border-prominent text-text-primary text-label-md font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
        >
          <span>View Ticket Status</span>
          <ExternalLink className="w-4 h-4 text-text-muted" />
        </a>
      </div>
    </div>
  )
}
