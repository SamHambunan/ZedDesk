import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, History, ArrowLeft, ArrowDown } from 'lucide-react'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CustomerPortalSkeleton } from './CustomerPortalSkeleton'
import { PortalTicketActiveThread } from './PortalTicketActiveThread'
import { CustomerPortalReplyComposer } from './CustomerPortalReplyComposer'
import { PortalTicketClosedBanner } from './PortalTicketClosedBanner'
import {
  getCustomerToken,
  setCustomerToken,
  stripTokenFromUrl,
  useCustomerTicketQuery,
  useCustomerReplyMutation,
} from '../../hooks/useCustomerPortal'
import {
  createLiveClient,
  type ILiveClient,
  type LiveSignalPayload,
  type CustomerUnavailableReason,
} from '../../lib/live-client'
import type { PortalTicketStatus, PortalTicketDetailResponse, PortalReplyResponse } from './types'

export interface CustomerPortalTicketDetailProps {
  readonly apiUrl: string
  readonly ticketUuid: string
  readonly initialToken?: string | null
  readonly onOpenHistory: () => void
  readonly onNewInquiry?: () => void
  readonly className?: string
  readonly ref?: React.Ref<HTMLDivElement>
  readonly liveClient?: ILiveClient
}

function getBadgeVariant(status: PortalTicketStatus): BadgeVariant {
  switch (status) {
    case 'open':
      return 'warning'
    case 'resolved':
      return 'positive'
    case 'pending':
      return 'neutral'
    case 'closed':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function isExpiredError(message: string): boolean {
  const msg = message.toLowerCase()
  return msg.includes('expired') || msg.includes('401')
}

function isUnavailableError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    msg.includes('forbidden') ||
    msg.includes('403') ||
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('permission') ||
    msg.includes('unavailable')
  )
}

export const CustomerPortalTicketDetail: React.FC<CustomerPortalTicketDetailProps> = ({
  apiUrl,
  ticketUuid,
  initialToken,
  onOpenHistory,
  onNewInquiry,
  className = '',
  ref,
  liveClient: propLiveClient,
}) => {
  const queryClient = useQueryClient()

  // 1. Pure initial token resolution
  const [token] = useState<string | null>(() => {
    if (initialToken) {
      return initialToken
    }

    if (typeof window !== 'undefined') {
      const urlToken = new URLSearchParams(window.location.search).get('token')
      if (urlToken) {
        return urlToken
      }
    }

    return getCustomerToken(ticketUuid)
  })

  // Synchronize token into sessionStorage and strip from address bar
  useEffect(() => {
    if (token) {
      setCustomerToken(token, ticketUuid)
    }
    stripTokenFromUrl()
  }, [token, ticketUuid])

  // 2. Query ticket data with X-Customer-Token header
  const { data, isLoading, error, refetch } = useCustomerTicketQuery(apiUrl, ticketUuid, token)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [accessState, setAccessState] = useState<'normal' | 'expired' | 'unavailable'>('normal')
  const [hasNewReply, setHasNewReply] = useState(false)

  const isNearBottomRef = useRef(true)
  const messagesCountRef = useRef(0)
  const threadBottomRef = useRef<HTMLDivElement>(null)

  const ticket = accessState === 'normal' ? data?.ticket : undefined
  const customer = accessState === 'normal' ? data?.customer : undefined
  const messages = accessState === 'normal' ? data?.messages || [] : []

  // Sync initial message count on first load without a redundant effect
  if (messagesCountRef.current === 0 && messages.length > 0) {
    messagesCountRef.current = messages.length
  }

  // Passive scroll listener for reading position tracking
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      const windowHeight = window.innerHeight || document.documentElement.clientHeight || 0
      const docHeight = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0
      )
      const isAtBottom = docHeight <= windowHeight + 80 || windowHeight + scrollY >= docHeight - 80
      isNearBottomRef.current = isAtBottom
      if (isAtBottom) {
        setHasNewReply(false)
      }
    }

    // Run once on mount to establish reading position accurately
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Shared refetch processor for signals and reconnects
  const handleRefetchResult = useCallback(
    (res: any) => {
      if (res.isError) {
        const errMsg = res.error?.message || ''
        if (isExpiredError(errMsg)) {
          setAccessState('expired')
          queryClient.removeQueries({ queryKey: ['portal-ticket', ticketUuid] })
        } else if (isUnavailableError(errMsg)) {
          setAccessState('unavailable')
          queryClient.removeQueries({ queryKey: ['portal-ticket', ticketUuid] })
        }
      } else if (res.data) {
        const newMessages = res.data.messages || []
        if (newMessages.length > messagesCountRef.current) {
          if (!isNearBottomRef.current) {
            setHasNewReply(true)
          }
        }
        messagesCountRef.current = newMessages.length
      }
    },
    [queryClient, ticketUuid]
  )

  // Subscribe to authorized customer ticket channel (lifecycle managed in effect)
  useEffect(() => {
    if (!ticketUuid || !token) return

    const client = propLiveClient ?? createLiveClient({ apiUrl })

    const handleSignal = (signal: LiveSignalPayload) => {
      if (signal.ticket_id !== ticketUuid) return
      refetch().then(handleRefetchResult)
    }

    const handleUnavailable = (reason?: CustomerUnavailableReason) => {
      queryClient.removeQueries({ queryKey: ['portal-ticket', ticketUuid] })
      if (reason === 'expired') {
        setAccessState('expired')
      } else {
        setAccessState('unavailable')
      }
    }

    const unsubscribeTicket = client.subscribeToCustomerTicket
      ? client.subscribeToCustomerTicket(
          ticketUuid,
          token,
          handleSignal,
          handleUnavailable
        )
      : () => {}

    const unsubscribeReconnect = client.onReconnect(() => {
      refetch().then(handleRefetchResult)
    })

    return () => {
      unsubscribeTicket()
      unsubscribeReconnect()
      if (!propLiveClient) {
        client.disconnect()
      }
    }
  }, [propLiveClient, apiUrl, ticketUuid, token, refetch, queryClient, handleRefetchResult])

  // 3. Reply mutation
  const replyMutation = useCustomerReplyMutation(apiUrl, ticketUuid, token)

  const handleReply = async (payload: { body: string; files?: readonly File[] }) => {
    setReplyError(null)
    try {
      const result = (await replyMutation.mutateAsync({
        body: payload.body,
        files: payload.files,
      })) as PortalReplyResponse

      if (result) {
        // Optimistically update TanStack query cache without cascading effects
        queryClient.setQueryData(
          ['portal-ticket', ticketUuid, token],
          (old: PortalTicketDetailResponse | undefined) => {
            if (!old) return old
            const newStatus = result.ticket?.status || 'open'
            const newReply = result.reply
            return {
              ...old,
              ticket: {
                ...old.ticket,
                status: newStatus,
              },
              messages: newReply ? [...old.messages, newReply] : old.messages,
            }
          }
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit reply.'
      setReplyError(message)
      throw err
    }
  }

  const handleJumpToLatest = () => {
    setHasNewReply(false)
    if (typeof threadBottomRef.current?.scrollIntoView === 'function') {
      threadBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    } else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
    }
  }

  // Deletion or denied access state
  if (accessState === 'unavailable' || (!ticket && error && isUnavailableError(error.message))) {
    return (
      <div
        data-testid="portal-ticket-unavailable"
        className="py-12 px-4 text-center space-y-4"
      >
        <div className="w-12 h-12 rounded-full bg-surface-subpanel border border-border-subtle flex items-center justify-center mx-auto text-text-muted">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-headline-sm font-semibold text-text-primary">
          Ticket Unavailable
        </h3>
        <p className="text-body-sm text-text-secondary max-w-md mx-auto leading-relaxed">
          This ticket is unavailable or access has been denied.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {onNewInquiry ? (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={onNewInquiry}
            >
              Submit New Inquiry
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  // Expiry state offering "Request a new link"
  if (accessState === 'expired' || (!ticket && error && isExpiredError(error.message))) {
    return (
      <div
        data-testid="portal-ticket-expired"
        className="py-12 px-4 text-center space-y-4"
      >
        <div className="w-12 h-12 rounded-full bg-amber-action/10 border border-amber-action/30 flex items-center justify-center mx-auto text-amber-action">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-headline-sm font-semibold text-text-primary">
          Access Link Expired
        </h3>
        <p className="text-body-sm text-text-secondary max-w-md mx-auto leading-relaxed">
          Your signed access link has expired. Request a new link to access your ticket.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="primary"
            size="compact"
            data-testid="portal-request-link-btn"
            onClick={onOpenHistory}
            leftIcon={<History className="w-3.5 h-3.5" />}
          >
            Request a new link
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading && !ticket) {
    return <CustomerPortalSkeleton />
  }

  if (error && !ticket) {
    return (
      <div className="py-12 px-4 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-sentiment-negative/10 border border-sentiment-negative/20 flex items-center justify-center mx-auto text-sentiment-negative">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-headline-sm font-semibold text-text-primary">
          Unable to Load Ticket
        </h3>
        <p className="text-body-sm text-text-secondary max-w-md mx-auto leading-relaxed">
          {error.message || 'Access token may be invalid, expired, or missing.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
          <Button
            type="button"
            variant="primary"
            size="compact"
            onClick={onOpenHistory}
            leftIcon={<History className="w-3.5 h-3.5" />}
          >
            Find My Tickets
          </Button>
        </div>
      </div>
    )
  }

  const currentStatus = ticket?.status || 'open'
  const isClosed = currentStatus === 'closed'

  return (
    <div ref={ref} className={`space-y-6 ${className}`}>
      {/* Top Breadcrumb & Action bar */}
      {onNewInquiry ? (
        <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
          <button
            type="button"
            data-testid="portal-new-inquiry-link"
            onClick={onNewInquiry}
            className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Submit new inquiry</span>
          </button>
        </div>
      ) : null}

      {/* Ticket Header & Status */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                data-testid="portal-ticket-number"
                className="font-mono text-xs font-semibold text-text-muted"
              >
                #{ticket?.ticket_number}
              </span>
              <Badge
                data-testid="portal-ticket-status-badge"
                variant={getBadgeVariant(currentStatus)}
                dot
              >
                {currentStatus}
              </Badge>
            </div>

            <h1
              data-testid="portal-ticket-subject"
              className="text-headline-md font-headline-md text-text-primary tracking-tight mt-1.5"
            >
              {ticket?.subject}
            </h1>
          </div>
        </div>
      </header>

      {/* Reply Error Banner */}
      {replyError ? (
        <div
          data-testid="portal-reply-error"
          className="p-3.5 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl text-sentiment-negative text-xs flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{replyError}</span>
        </div>
      ) : null}

      {/* Active Public Conversation Thread (internal notes strictly omitted) */}
      <PortalTicketActiveThread
        messages={messages}
        customerName={customer?.name}
        ticketUuid={ticketUuid}
        apiUrl={apiUrl}
      />

      {/* Floating cue when reading older content and new reply arrives */}
      {hasNewReply ? (
        <div className="sticky bottom-4 z-20 flex justify-center py-2 animate-fade-in">
          <button
            type="button"
            data-testid="portal-jump-to-latest"
            onClick={handleJumpToLatest}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-action text-white text-xs font-medium shadow-modal hover:bg-amber-action/90 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-amber"
          >
            <span>New reply — jump to latest</span>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}

      <div ref={threadBottomRef} />

      {/* Lockout Banner or Reply Composer */}
      {isClosed ? (
        <PortalTicketClosedBanner
          ticketNumber={ticket?.ticket_number}
          onNewInquiry={onNewInquiry}
          onFindTickets={onOpenHistory}
        />
      ) : (
        <CustomerPortalReplyComposer
          ticketUuid={ticketUuid}
          currentStatus={currentStatus}
          onSubmitReply={handleReply}
          isSubmitting={replyMutation.isPending}
        />
      )}
    </div>
  )
}

CustomerPortalTicketDetail.displayName = 'CustomerPortalTicketDetail'
