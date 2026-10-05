import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, History, ArrowLeft } from 'lucide-react'
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
import type { PortalTicketStatus, PortalTicketDetailResponse, PortalReplyResponse } from './types'

export interface CustomerPortalTicketDetailProps {
  readonly apiUrl: string
  readonly ticketUuid: string
  readonly initialToken?: string | null
  readonly onOpenHistory: () => void
  readonly onNewInquiry?: () => void
  readonly className?: string
  readonly ref?: React.Ref<HTMLDivElement>
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

export const CustomerPortalTicketDetail: React.FC<CustomerPortalTicketDetailProps> = ({
  apiUrl,
  ticketUuid,
  initialToken,
  onOpenHistory,
  onNewInquiry,
  className = '',
  ref,
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

  const ticket = data?.ticket
  const customer = data?.customer
  const messages = data?.messages || []

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
    }
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
      {onNewInquiry && (
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
      )}

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
      {replyError && (
        <div
          data-testid="portal-reply-error"
          className="p-3.5 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl text-sentiment-negative text-xs flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{replyError}</span>
        </div>
      )}

      {/* Active Public Conversation Thread (internal notes strictly omitted) */}
      <PortalTicketActiveThread
        messages={messages}
        customerName={customer?.name}
        ticketUuid={ticketUuid}
        apiUrl={apiUrl}
      />

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
