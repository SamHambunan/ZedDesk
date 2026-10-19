import React, { useState, useRef, useMemo, useEffect, use } from 'react'
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
import type { PresenceMember } from '../../lib/live-client'

export interface StagedAttachment {
  readonly id: string
  readonly file: File
  readonly file_name: string
  readonly file_size_bytes: number
  readonly mime_type: string
}

export interface ComposerSubmitPayload {
  readonly messageType: MessageType
  readonly body: string
  readonly nextStatus?: TicketStatus
  readonly attachments: readonly TicketAttachment[]
  readonly files?: readonly File[]
}

export interface ComposerState {
  readonly tab: MessageType
  readonly body: string
  readonly nextStatus: TicketStatus
  readonly stagedFiles: readonly StagedAttachment[]
  readonly fileError: string | null
  readonly isSubmitting: boolean
  readonly currentStatus: TicketStatus
  readonly typingMembers?: readonly PresenceMember[]
}

export interface ComposerActions {
  readonly setTab: (tab: MessageType) => void
  readonly setBody: (body: string) => void
  readonly setNextStatus: (status: TicketStatus) => void
  readonly addFiles: (files: FileList | readonly File[]) => void
  readonly removeFile: (id: string) => void
  readonly clearFiles: () => void
  readonly submit: (overrideType?: MessageType) => void | Promise<void>
  readonly stopTyping?: () => void
}

export interface ComposerMeta {
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>
}

export interface ComposerContextValue {
  readonly state: ComposerState
  readonly actions: ComposerActions
  readonly meta: ComposerMeta
}

export const ComposerContext = React.createContext<ComposerContextValue | null>(null)

export function useComposer(): ComposerContextValue {
  const context = use(ComposerContext)
  if (!context) {
    throw new Error('useComposer must be used within a Composer.Provider')
  }
  return context
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
])

function isAllowedMimeType(mime: string): boolean {
  if (!mime) return false
  if (ALLOWED_MIME_TYPES.has(mime)) return true
  if (mime.startsWith('image/')) return true
  if (mime.startsWith('text/')) return true
  return false
}

/**
 * Hoisted static keyboard shortcut badge (rendering-hoist-jsx)
 */
const KEYBOARD_SHORTCUT_BADGE = (
  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-secondary">Ctrl</kbd>
    <span>+</span>
    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-secondary">Enter</kbd>
  </span>
)

export interface ComposerProviderProps {
  readonly children: React.ReactNode
  readonly value?: ComposerContextValue
  readonly currentStatus?: TicketStatus
  readonly onSubmit?: (payload: ComposerSubmitPayload) => void | Promise<void>
  readonly onTypingChange?: (isTyping: boolean) => void
  readonly typingMembers?: readonly PresenceMember[]
  readonly isSubmitting?: boolean
  readonly initialTab?: MessageType
  readonly className?: string
}

export const ComposerProvider: React.FC<ComposerProviderProps> = ({
  children,
  value: controlledValue,
  currentStatus = 'open',
  onSubmit,
  onTypingChange,
  typingMembers,
  isSubmitting = false,
  initialTab = 'public_reply',
}) => {
  if (controlledValue) {
    return (
      <ComposerContext value={controlledValue}>
        {children}
      </ComposerContext>
    )
  }

  return (
    <ComposerInternalProvider
      currentStatus={currentStatus}
      onSubmit={onSubmit}
      onTypingChange={onTypingChange}
      typingMembers={typingMembers}
      isSubmitting={isSubmitting}
      initialTab={initialTab}
    >
      {children}
    </ComposerInternalProvider>
  )
}

function ComposerInternalProvider({
  children,
  currentStatus = 'open',
  onSubmit,
  onTypingChange,
  typingMembers,
  isSubmitting = false,
  initialTab = 'public_reply',
}: Omit<ComposerProviderProps, 'value'>) {
  const [tab, setTab] = useState<MessageType>(initialTab)
  const [body, setBody] = useState('')
  const [nextStatus, setNextStatus] = useState<TicketStatus>(() =>
    currentStatus === 'resolved' ? 'open' : 'pending'
  )
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlightRef = useRef(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onTypingChangeRef = useRef(onTypingChange)
  onTypingChangeRef.current = onTypingChange

  const stopTyping = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    if (isTypingRef.current) {
      isTypingRef.current = false
      onTypingChangeRef.current?.(false)
    }
  }

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      stopTyping()
    }
  }, [])

  // Cleanup typing when document is hidden
  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTyping()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Stable action callbacks with refs
  const stateRef = useRef({ tab, body, nextStatus, stagedFiles, isSubmitting: isSubmitting || submitting, onSubmit })
  stateRef.current = { tab, body, nextStatus, stagedFiles, isSubmitting: isSubmitting || submitting, onSubmit }

  const actions: ComposerActions = useMemo(() => ({
    setTab: (newTab: MessageType) => setTab(newTab),
    setBody: (newBody: string) => {
      setBody(newBody)
      if (newBody.trim().length > 0) {
        if (!isTypingRef.current) {
          isTypingRef.current = true
          onTypingChangeRef.current?.(true)
        }
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current)
        }
        typingTimerRef.current = setTimeout(() => {
          stopTyping()
        }, 2500)
      } else {
        stopTyping()
      }
    },
    stopTyping,
    setNextStatus: (status: TicketStatus) => setNextStatus(status),
    addFiles: (files: FileList | readonly File[]) => {
      setFileError(null)
      const newStaged: StagedAttachment[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setFileError(`File "${file.name}" exceeds the 10MB limit.`)
          continue
        }

        if (!isAllowedMimeType(file.type)) {
          setFileError(`File type "${file.type || 'unknown'}" is not supported.`)
          continue
        }

        newStaged.push({
          id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
        })
      }

      setStagedFiles((prev) => [...prev, ...newStaged])
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    removeFile: (id: string) => {
      setStagedFiles((prev) => prev.filter((f) => f.id !== id))
    },
    clearFiles: () => {
      setStagedFiles([])
      setFileError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    submit: async (overrideType?: MessageType) => {
      stopTyping()
      const current = stateRef.current
      if (!current.body.trim() || current.isSubmitting || submitInFlightRef.current) return

      const effectiveType = overrideType ?? current.tab
      const payload: ComposerSubmitPayload = {
        messageType: effectiveType,
        body: current.body.trim(),
        nextStatus: effectiveType === 'internal_note' ? undefined : current.nextStatus,
        attachments: current.stagedFiles.map((s) => ({
          id: s.id,
          file_name: s.file_name,
          file_size_bytes: s.file_size_bytes,
          mime_type: s.mime_type,
        })),
        files: current.stagedFiles.map((s) => s.file),
      }

      submitInFlightRef.current = true
      setSubmitting(true)
      setFileError(null)
      try {
        await current.onSubmit?.(payload)
        if (stateRef.current.body === current.body && stateRef.current.stagedFiles === current.stagedFiles) {
          setBody('')
          setStagedFiles([])
        }
      } catch {
        setFileError('Message could not be confirmed. Try again.')
      } finally {
        submitInFlightRef.current = false
        setSubmitting(false)
      }
    },
  }), [])

  const state: ComposerState = useMemo(() => ({
    tab,
    body,
    nextStatus,
    stagedFiles,
    fileError,
    isSubmitting: isSubmitting || submitting,
    currentStatus,
    typingMembers,
  }), [tab, body, nextStatus, stagedFiles, fileError, isSubmitting, submitting, currentStatus, typingMembers])

  const meta: ComposerMeta = useMemo(() => ({
    textareaRef,
    fileInputRef,
  }), [])

  const contextValue: ComposerContextValue = useMemo(() => ({
    state,
    actions,
    meta,
  }), [state, actions, meta])

  // Handle global Cmd/Ctrl+Enter submission anywhere within Provider
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      actions.submit()
    }
  }

  return (
    <ComposerContext value={contextValue}>
      <div onKeyDown={handleKeyDown} className="w-full">
        {children}
      </div>
    </ComposerContext>
  )
}

// Composer Compound Primitives

export interface ComposerFrameProps {
  readonly children: React.ReactNode
  readonly className?: string
  readonly 'data-testid'?: string
}

export const ComposerFrame: React.FC<ComposerFrameProps> = ({
  children,
  className = '',
  'data-testid': testId = 'ticket-composer',
}) => {
  const { state } = useComposer()
  const isInternalNote = state.tab === 'internal_note'

  return (
    <div
      data-testid={testId}
      className={`bg-surface-panel border border-border-subtle rounded-xl shadow-card overflow-hidden transition-all ${
        isInternalNote ? 'ring-1 ring-amber-action/30' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export interface ComposerHeaderProps {
  readonly className?: string
}

export const ComposerHeader: React.FC<ComposerHeaderProps> = ({
  className = '',
}) => {
  const { state, actions } = useComposer()
  const isInternalNote = state.tab === 'internal_note'

  return (
    <div className={`flex items-center justify-between border-b border-border-subtle px-3 pt-2 bg-surface-canvas/60 ${className}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="composer-tab-public"
          onClick={() => actions.setTab('public_reply')}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-all flex items-center gap-1.5 border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber ${
            state.tab === 'public_reply'
              ? 'text-amber-action border-amber-action bg-surface-panel'
              : 'text-text-secondary border-transparent hover:text-text-primary'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Public Reply</span>
        </button>

        <button
          type="button"
          data-testid="composer-tab-internal"
          onClick={() => actions.setTab('internal_note')}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-all flex items-center gap-1.5 border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber ${
            state.tab === 'internal_note'
              ? 'text-amber-action border-amber-action bg-surface-panel'
              : 'text-text-secondary border-transparent hover:text-text-primary'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Internal Note</span>
        </button>
      </div>

      {isInternalNote && (
        <div className="text-[11px] font-mono text-amber-action flex items-center gap-1 px-2 py-0.5 rounded bg-amber-action/10 border border-amber-action/20">
          <Lock className="w-3 h-3" />
          <span>Hidden from customer</span>
        </div>
      )}
    </div>
  )
}

export interface ComposerInputProps {
  readonly className?: string
  readonly rows?: number
  readonly placeholder?: string
}

export const ComposerInput: React.FC<ComposerInputProps> = ({
  className = '',
  rows = 4,
  placeholder,
}) => {
  const { state, actions, meta } = useComposer()
  const isInternalNote = state.tab === 'internal_note'

  const defaultPlaceholder = isInternalNote
    ? 'Type an internal note visible only to organization staff members...'
    : 'Type your public reply to customer (Ctrl+Enter to send)...'

  return (
    <div className="p-3">
      <textarea
        ref={meta.textareaRef}
        data-testid="composer-textarea"
        value={state.body}
        onChange={(e) => actions.setBody(e.target.value)}
        onBlur={() => actions.stopTyping?.()}
        rows={rows}
        placeholder={placeholder ?? defaultPlaceholder}
        className={`w-full bg-surface-container-low border rounded-lg p-3 text-body-default text-text-primary placeholder:text-text-muted focus:outline-none transition-colors resize-y min-h-[96px] ${
          isInternalNote
            ? 'border-amber-action/30 focus:border-amber-action focus:ring-1 focus:ring-focus-amber'
            : 'border-border-subtle focus:border-amber-action focus:ring-1 focus:ring-focus-amber'
        } ${className}`}
      />
      <ComposerAttachments />
    </div>
  )
}

export interface ComposerAttachmentsProps {
  readonly className?: string
}

export const ComposerAttachments: React.FC<ComposerAttachmentsProps> = ({
  className = '',
}) => {
  const { state, actions, meta } = useComposer()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      actions.addFiles(e.target.files)
    }
  }

  return (
    <div className={className}>
      <input
        ref={meta.fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        id="composer-file-input"
        data-testid="composer-hidden-file-input"
      />

      {/* Staged Attachments Tray */}
      {state.stagedFiles.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {state.stagedFiles.map((file) => (
            <div
              key={file.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container border border-border-subtle text-xs text-text-primary"
            >
              <FileCheck className="w-3.5 h-3.5 text-sentiment-positive" />
              <span className="font-mono text-[11px] max-w-[160px] truncate">{file.file_name}</span>
              <span className="font-mono tabular-nums text-[10px] text-text-muted">
                ({formatFileSize(file.file_size_bytes)})
              </span>
              <button
                type="button"
                onClick={() => actions.removeFile(file.id)}
                className="p-0.5 hover:text-sentiment-negative text-text-muted transition-colors rounded cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Error Alert */}
      {state.fileError && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-sentiment-negative bg-sentiment-negative/10 border border-sentiment-negative/30 p-2 rounded">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{state.fileError}</span>
        </div>
      )}
    </div>
  )
}

export interface ComposerFooterProps {
  readonly children?: React.ReactNode
  readonly className?: string
}

export const ComposerFooter: React.FC<ComposerFooterProps> = ({
  children,
  className = '',
}) => {
  const { meta } = useComposer()

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 bg-surface-canvas/60 border-t border-border-subtle ${className}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="composer-attach-btn"
          onClick={() => meta.fileInputRef.current?.click()}
          className="h-8 px-2.5 bg-surface-container-low hover:bg-surface-container border border-border-subtle rounded text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-amber"
        >
          <Paperclip className="w-3.5 h-3.5 text-amber-action" />
          <span>Attach</span>
        </button>

        {children}
      </div>

      <div className="flex items-center gap-3">
        {KEYBOARD_SHORTCUT_BADGE}
      </div>
    </div>
  )
}

export interface ComposerStatusSelectorProps {
  readonly className?: string
}

export const ComposerStatusSelector: React.FC<ComposerStatusSelectorProps> = ({
  className = '',
}) => {
  const { state, actions } = useComposer()

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-[11px] text-text-muted font-mono">Next Status:</span>
      <select
        data-testid="composer-next-status"
        value={state.nextStatus}
        onChange={(e) => actions.setNextStatus(e.target.value as TicketStatus)}
        className="h-8 px-2 bg-surface-container-low border border-border-subtle rounded text-xs font-mono text-text-primary focus:outline-none focus:border-amber-action focus-visible:ring-1 focus-visible:ring-focus-amber cursor-pointer"
      >
        <option value="pending">Pending (Awaiting Customer)</option>
        <option value="open">Open (In Progress)</option>
        <option value="resolved">Resolved</option>
      </select>
    </div>
  )
}

export interface ComposerSubmitProps {
  readonly className?: string
  readonly isInternalNote?: boolean
  readonly label?: string
}

export const ComposerSubmit: React.FC<ComposerSubmitProps> = ({
  className = '',
  isInternalNote: explicitInternalNote,
  label,
}) => {
  const { state, actions } = useComposer()
  const isInternal = explicitInternalNote ?? (state.tab === 'internal_note')
  const isDisabled = !state.body.trim() || state.isSubmitting

  return (
    <button
      type="button"
      data-testid="composer-submit-btn"
      disabled={isDisabled}
      onClick={() => actions.submit(isInternal ? 'internal_note' : 'public_reply')}
      className={`h-8 px-4 text-xs font-semibold rounded shadow-keylight transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber ${
        isInternal
          ? 'bg-amber-action/20 hover:bg-amber-action/30 text-amber-action border border-amber-action/40'
          : 'bg-amber-action hover:bg-amber-hover text-on-amber-action font-semibold'
      } ${className}`}
    >
      {isInternal ? (
        <>
          <Lock className="w-3.5 h-3.5" />
          <span>{label || 'Save Note'}</span>
        </>
      ) : (
        <>
          <CornerDownLeft className="w-3.5 h-3.5" />
          <span>
            {label ||
              (state.nextStatus === 'pending'
                ? 'Send & Pending'
                : state.nextStatus === 'resolved'
                ? 'Send & Resolve'
                : 'Send Reply')}
          </span>
        </>
      )}
    </button>
  )
}

// Explicit Composer Variants

/**
 * PublicReplyComposer: Composes public reply controls including next-status selector without effect cascades.
 */
export const PublicReplyComposer: React.FC<{ readonly className?: string }> = ({
  className = '',
}) => {
  return (
    <ComposerFrame className={className}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 pt-2 bg-surface-canvas/60">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <Send className="w-3.5 h-3.5 text-amber-action" />
          <span>Public Reply</span>
        </div>
      </div>
      <ComposerInput placeholder="Type your public reply to customer (Ctrl+Enter to send)..." />
      <ComposerFooter>
        <ComposerStatusSelector />
        <ComposerSubmit />
      </ComposerFooter>
    </ComposerFrame>
  )
}

/**
 * InternalNoteComposer: Composes caution-amber internal note controls strictly omitting status selector without effect cascades.
 */
export const InternalNoteComposer: React.FC<{ readonly className?: string }> = ({
  className = '',
}) => {
  return (
    <ComposerFrame className={`ring-1 ring-amber-action/30 ${className}`}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 pt-2 bg-surface-canvas/60">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-action">
          <Lock className="w-3.5 h-3.5" />
          <span>Internal Note</span>
        </div>
        <div className="text-[11px] font-mono text-amber-action flex items-center gap-1 px-2 py-0.5 rounded bg-amber-action/10 border border-amber-action/20">
          <Lock className="w-3 h-3" />
          <span>Hidden from customer</span>
        </div>
      </div>
      <ComposerInput placeholder="Type an internal note visible only to organization staff members..." />
      <ComposerFooter>
        <ComposerSubmit isInternalNote />
      </ComposerFooter>
    </ComposerFrame>
  )
}

export function formatTypingText(members: readonly PresenceMember[]): string {
  if (!members || members.length === 0) return ''
  if (members.length === 1) {
    return `${members[0].name} is typing...`
  }
  if (members.length === 2) {
    return `${members[0].name} and ${members[1].name} are typing...`
  }
  return `${members[0].name}, ${members[1].name}, and ${members.length - 2} other${members.length - 2 > 1 ? 's' : ''} are typing...`
}

export const ComposerTypingIndicator: React.FC<{
  readonly members?: readonly PresenceMember[]
  readonly className?: string
}> = ({ members: propMembers, className = '' }) => {
  const { state } = useComposer()
  const members = propMembers ?? state.typingMembers
  if (!members || members.length === 0) return null

  return (
    <div
      data-testid="ticket-typing-indicator"
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 mb-2 text-xs text-text-muted transition-opacity duration-150 ${className}`}
    >
      <span className="flex items-center gap-1 text-amber-action" aria-hidden="true">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-action animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-action animate-pulse [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-action animate-pulse [animation-delay:300ms]" />
      </span>
      <span data-testid="ticket-typing-text" className="font-mono text-[11px] text-text-secondary">
        {formatTypingText(members)}
      </span>
      {members.map((m) => (
        <span
          key={m.member_id}
          data-testid={`typing-member-${m.member_id}`}
          aria-hidden="true"
          className="sr-only"
        >
          {m.name}
        </span>
      ))}
    </div>
  )
}

export interface TicketComposerProps {
  readonly currentStatus?: TicketStatus
  readonly onSubmit?: (payload: ComposerSubmitPayload) => void | Promise<void>
  readonly onTypingChange?: (isTyping: boolean) => void
  readonly typingMembers?: readonly PresenceMember[]
  readonly isSubmitting?: boolean
  readonly className?: string
}

/**
 * TicketComposer: Tabbed composer component that preserves draft text and staged attachments
 * across tab switches using Composer.Provider lifted state.
 */
function TicketComposerView({ className = '' }: { readonly className?: string }) {
  const { state } = useComposer()

  return (
    <div className="space-y-1.5">
      {state.typingMembers && state.typingMembers.length > 0 ? (
        <ComposerTypingIndicator />
      ) : null}
      <ComposerFrame className={className}>
        <ComposerHeader />
        <ComposerInput />
        <ComposerFooter>
          {state.tab === 'public_reply' && <ComposerStatusSelector />}
          <ComposerSubmit />
        </ComposerFooter>
      </ComposerFrame>
    </div>
  )
}

export const TicketComposer: React.FC<TicketComposerProps> = ({
  currentStatus = 'open',
  onSubmit,
  onTypingChange,
  typingMembers,
  isSubmitting = false,
  className = '',
}) => {
  return (
    <ComposerProvider
      currentStatus={currentStatus}
      onSubmit={onSubmit}
      onTypingChange={onTypingChange}
      typingMembers={typingMembers}
      isSubmitting={isSubmitting}
    >
      <TicketComposerView className={className} />
    </ComposerProvider>
  )
}

export const Composer = {
  Provider: ComposerProvider,
  Frame: ComposerFrame,
  Header: ComposerHeader,
  Input: ComposerInput,
  Attachments: ComposerAttachments,
  Footer: ComposerFooter,
  StatusSelector: ComposerStatusSelector,
  Submit: ComposerSubmit,
  PublicReply: PublicReplyComposer,
  InternalNote: InternalNoteComposer,
  TypingIndicator: ComposerTypingIndicator,
}
