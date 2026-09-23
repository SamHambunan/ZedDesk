import React, { useState } from 'react'
import { CustomerPortalLayout } from './CustomerPortalLayout'
import { CustomerIntakeForm } from './CustomerIntakeForm'
import { CustomerTicketConfirmation } from './CustomerTicketConfirmation'
import { FindMyTicketsModal } from './FindMyTicketsModal'
import { useSubmitTicketMutation } from '../../hooks/useCustomerPortal'
import type { CreateTicketPayload } from '../../hooks/useCustomerPortal'

export interface CustomerPortalViewProps {
  readonly apiUrl: string
  readonly subdomain?: string | null
  readonly pathname?: string
  readonly organizationName?: string | null
  readonly isLoading?: boolean
}

export interface TicketSuccessState {
  ticketNumber: number
  subject: string
  token: string
  accessUrl?: string
  customerEmail?: string
}

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({
  apiUrl,
  subdomain,
  pathname,
  organizationName,
  isLoading = false,
}) => {
  const [successData, setSuccessData] = useState<TicketSuccessState | null>(null)
  const [historyModalOverride, setHistoryModalOverride] = useState<boolean | null>(null)

  const isHistoryModalOpen =
    historyModalOverride ??
    (pathname === '/portal/history' ||
      (typeof window !== 'undefined' && window.location.pathname === '/portal/history'))

  const submitTicketMutation = useSubmitTicketMutation(apiUrl)

  const handleSubmit = async (payload: CreateTicketPayload) => {
    try {
      const data = await submitTicketMutation.mutateAsync(payload)
      setSuccessData({
        ticketNumber: data.ticket.ticket_number,
        subject: data.ticket.subject,
        token: data.token,
        accessUrl: data.access_url,
        customerEmail: data.customer?.email || payload.email,
      })
    } catch {
      // Error handled by mutation.error
    }
  }

  const handleReset = () => {
    setSuccessData(null)
    submitTicketMutation.reset()
  }

  const handleCloseHistoryModal = () => {
    setHistoryModalOverride(false)
    if (typeof window !== 'undefined' && window.location.pathname === '/portal/history') {
      window.history.replaceState({}, '', '/portal')
    }
  }

  return (
    <CustomerPortalLayout
      subdomain={subdomain}
      organizationName={organizationName}
      onOpenHistory={() => setHistoryModalOverride(true)}
    >
      {successData ? (
        <CustomerTicketConfirmation
          ticketNumber={successData.ticketNumber}
          subject={successData.subject}
          token={successData.token}
          accessUrl={successData.accessUrl}
          customerEmail={successData.customerEmail}
          onReset={handleReset}
        />
      ) : (
        <CustomerIntakeForm
          onSubmit={handleSubmit}
          isSubmitting={submitTicketMutation.isPending}
          isLoading={isLoading}
          error={submitTicketMutation.error ? submitTicketMutation.error.message : null}
        />
      )}

      <FindMyTicketsModal
        isOpen={isHistoryModalOpen}
        onClose={handleCloseHistoryModal}
        apiUrl={apiUrl}
      />
    </CustomerPortalLayout>
  )
}
