import React, { useState, useRef } from 'react'
import {
  Send,
  Lock,
  Paperclip,
  X,
  AlertCircle,
  FileCheck,
  CornerDownLeft,
} from 'lucide-react'
import { formatFileSize } from './constants'
import type { MessageType, TicketStatus, TicketAttachment } from './types'

export interface ComposerSubmitPayload {
  readonly messageType: MessageType
  readonly body: string
  readonly nextStatus?: TicketStatus
  readonly attachments: readonly TicketAttachment[]
}

export interface TicketComposerProps {
  readonly currentStatus: TicketStatus
  readonly onSubmit: (payload: ComposerSubmitPayload) => void
  readonly isSubmitting?: boolean
  readonly className?: string
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'text/',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
]

export const TicketComposer: React.FC<TicketComposerProps> = ({
  currentStatus,
  onSubmit,
  isSubmitting = false,
  className = '',
}) => {
  const [tab, setTab] = useState<MessageType>('public_reply')
  const [body, setBody] = useState('')
  const [nextStatus, setNextStatus] = useState<TicketStatus>(() =>
    currentStatus === 'resolved' ? 'open' : 'pending'
  )
  const [stagedFiles, setStagedFiles] = useState<TicketAttachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isInternalNote = tab === 'internal_note'

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAttachments: TicketAttachment[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`File "${file.name}" exceeds the 10MB limit.`)
        continue
      }

      const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
        file.type ? file.type.startsWith(prefix) : true
      )
      if (!isAllowed) {
        setFileError(`File type "${file.type || 'unknown'}" is not supported.`)
        continue
      }

      newAttachments.push({
        id: `staging-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
      })
    }

    setStagedFiles((prev) => [...prev, ...newAttachments])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleTriggerSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!body.trim() || isSubmitting) return

    onSubmit({
      messageType: tab,
      body: body.trim(),
      nextStatus: isInternalNote ? undefined : nextStatus,
      attachments: stagedFiles,
    })

    setBody('')
    setStagedFiles([])
    setFileError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleTriggerSubmit()
    }
  }

  return (
    <div
      data-testid="ticket-composer"
      className={`bg-[#141518] border border-[#282A33] rounded-xl shadow-card overflow-hidden transition-all ${
        isInternalNote ? 'ring-1 ring-[#F59E0B]/30' : ''
      } ${className}`}
    >
      {/* Top Segmented Tabs */}
      <div className="flex items-center justify-between border-b border-[#282A33] px-3 pt-2 bg-[#0F1012]/60">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="composer-tab-public"
            onClick={() => setTab('public_reply')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-all flex items-center gap-1.5 border-b-2 ${
              tab === 'public_reply'
                ? 'text-[#F59E0B] border-[#F59E0B] bg-[#141518]'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Public Reply</span>
          </button>

          <button
            type="button"
            data-testid="composer-tab-internal"
            onClick={() => setTab('internal_note')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-all flex items-center gap-1.5 border-b-2 ${
              tab === 'internal_note'
                ? 'text-[#F59E0B] border-[#F59E0B] bg-[#141518]'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Internal Note</span>
          </button>
        </div>

        {isInternalNote && (
          <div className="text-[11px] font-mono text-[#F59E0B] flex items-center gap-1 px-2 py-0.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/20">
            <Lock className="w-3 h-3" />
            <span>Hidden from customer</span>
          </div>
        )}
      </div>

      {/* Composer Textarea */}
      <div className="p-3">
        <textarea
          data-testid="composer-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder={
            isInternalNote
              ? 'Type an internal note visible only to organization staff members...'
              : 'Type your public reply to customer (Ctrl+Enter to send)...'
          }
          className={`w-full bg-[#121316] border rounded-lg p-3 text-body-default text-text-primary placeholder:text-text-muted focus:outline-none transition-colors resize-y min-h-[96px] ${
            isInternalNote
              ? 'border-[#F59E0B]/30 focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              : 'border-[#282A33] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
          }`}
        />

        {/* Staged Attachments Tray */}
        {stagedFiles.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {stagedFiles.map((file) => (
              <div
                key={file.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#16181D] border border-[#282A33] text-xs text-text-primary"
              >
                <FileCheck className="w-3.5 h-3.5 text-sentiment-positive" />
                <span className="font-mono text-[11px] max-w-[160px] truncate">{file.file_name}</span>
                <span className="font-mono tabular-nums text-[10px] text-text-muted">
                  ({formatFileSize(file.file_size_bytes)})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveStagedFile(file.id)}
                  className="p-0.5 hover:text-sentiment-negative text-text-muted transition-colors rounded"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* File Error Alert */}
        {fileError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-sentiment-negative bg-sentiment-negative/10 border border-sentiment-negative/30 p-2 rounded">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}
      </div>

      {/* Composer Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 bg-[#0F1012]/60 border-t border-[#282A33]">
        <div className="flex items-center gap-3">
          {/* Attachment Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="composer-file-input"
          />
          <button
            type="button"
            data-testid="composer-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 bg-[#121316] hover:bg-[#16181D] border border-[#282A33] rounded text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F59E0B]"
          >
            <Paperclip className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Attach</span>
          </button>

          {/* Next-Status Selector (Public Reply only) */}
          {!isInternalNote && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted font-mono">Next Status:</span>
              <select
                data-testid="composer-next-status"
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as TicketStatus)}
                className="h-8 px-2 bg-[#121316] border border-[#282A33] rounded text-xs font-mono text-text-primary focus:outline-none focus:border-[#F59E0B]"
              >
                <option value="pending">Pending (Awaiting Customer)</option>
                <option value="open">Open (In Progress)</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          )}
        </div>

        {/* Submit Button & Shortcut Prompt */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-secondary">Ctrl</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-secondary">Enter</kbd>
          </span>

          <button
            type="button"
            data-testid="composer-submit-btn"
            disabled={!body.trim() || isSubmitting}
            onClick={handleTriggerSubmit}
            className={`h-8 px-4 text-xs font-semibold rounded shadow-keylight transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] ${
              isInternalNote
                ? 'bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] border border-[#F59E0B]/40'
                : 'bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1012] font-semibold'
            }`}
          >
            {isInternalNote ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Save Note</span>
              </>
            ) : (
              <>
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>
                  {nextStatus === 'pending'
                    ? 'Send & Pending'
                    : nextStatus === 'resolved'
                    ? 'Send & Resolve'
                    : 'Send Reply'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
