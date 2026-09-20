import React, { useState } from 'react'

export interface CustomerPortalViewProps {
  readonly apiUrl: string
  readonly subdomain?: string | null
}

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({ apiUrl, subdomain }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('medium')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<{
    ticketNumber: number
    token: string
    subject: string
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`${apiUrl}/api/portal/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          priority,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data?.message || (data?.errors ? Object.values(data.errors).flat().join(', ') : 'Failed to submit ticket.')
        setError(errorMsg)
        return
      }

      setSuccessData({
        ticketNumber: data.ticket.ticket_number,
        token: data.token,
        subject: data.ticket.subject,
      })

      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
      setPriority('medium')
    } catch {
      setError('Network error submitting ticket. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-xl bg-surface-panel border border-border-subtle rounded-xl p-8 shadow-card">
        <header className="mb-6 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2 text-accent-indigo-glow font-label-sm font-semibold tracking-wider uppercase mb-1">
            <span>Customer Portal</span>
            {subdomain && <span className="text-text-muted">• {subdomain}</span>}
          </div>
          <h1 className="text-headline-sm font-headline-sm text-text-primary">Submit a Support Request</h1>
          <p className="text-body-sm text-text-secondary mt-1">
            Describe your inquiry or issue below and our support agents will assist you promptly.
          </p>
        </header>

        {error && (
          <div
            data-testid="portal-error-message"
            className="mb-6 p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-sentiment-negative text-body-sm"
          >
            {error}
          </div>
        )}

        {successData ? (
          <div data-testid="portal-success-card" className="space-y-4">
            <div
              data-testid="portal-success-message"
              className="p-4 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded-lg text-sentiment-positive text-body-sm font-medium"
            >
              Ticket submitted successfully!
            </div>
            <div className="bg-surface-subpanel p-4 rounded-lg border border-border-subtle space-y-2">
              <div className="flex justify-between text-body-sm">
                <span className="text-text-muted">Ticket Number:</span>
                <span data-testid="portal-submitted-ticket-number" className="font-semibold text-text-primary">
                  #{successData.ticketNumber}
                </span>
              </div>
              <div className="flex justify-between text-body-sm">
                <span className="text-text-muted">Subject:</span>
                <span className="text-text-primary">{successData.subject}</span>
              </div>
              <div className="pt-2 border-t border-border-subtle flex flex-col gap-1">
                <span className="text-text-muted text-xs">Customer Access Token:</span>
                <code data-testid="portal-access-token" className="text-xs bg-surface-canvas p-2 rounded break-all text-accent-indigo-glow">
                  {successData.token}
                </code>
              </div>
            </div>
            <button
              type="button"
              data-testid="portal-submit-another"
              onClick={() => setSuccessData(null)}
              className="w-full h-10 bg-surface-subpanel hover:bg-surface-canvas border border-border-subtle text-text-primary text-label-md font-medium rounded-lg transition-colors"
            >
              Submit Another Inquiry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="portal-name" className="block text-label-sm font-medium text-text-secondary mb-1">
                Your Full Name
              </label>
              <input
                id="portal-name"
                data-testid="portal-customer-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alice Freeman"
                className="w-full h-10 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow"
              />
            </div>

            <div>
              <label htmlFor="portal-email" className="block text-label-sm font-medium text-text-secondary mb-1">
                Email Address
              </label>
              <input
                id="portal-email"
                data-testid="portal-customer-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. alice@example.com"
                className="w-full h-10 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="portal-subject" className="block text-label-sm font-medium text-text-secondary mb-1">
                  Subject
                </label>
                <input
                  id="portal-subject"
                  data-testid="portal-ticket-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your inquiry"
                  className="w-full h-10 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow"
                />
              </div>

              <div>
                <label htmlFor="portal-priority" className="block text-label-sm font-medium text-text-secondary mb-1">
                  Priority
                </label>
                <select
                  id="portal-priority"
                  data-testid="portal-ticket-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="portal-message" className="block text-label-sm font-medium text-text-secondary mb-1">
                Detailed Message
              </label>
              <textarea
                id="portal-message"
                data-testid="portal-ticket-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue or inquiry in detail..."
                className="w-full p-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow"
              />
            </div>

            <button
              type="submit"
              data-testid="portal-submit-btn"
              disabled={isSubmitting}
              className="w-full h-10 bg-primary-container hover:bg-primary-dark text-white font-medium text-label-md rounded-lg shadow-keylight-primary transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Support Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
