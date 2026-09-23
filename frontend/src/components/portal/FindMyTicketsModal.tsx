import React, { useState } from 'react'
import { Mail, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useMagicLinkMutation } from '../../hooks/useCustomerPortal'

export interface FindMyTicketsModalProps {
  isOpen: boolean
  onClose: () => void
  apiUrl: string
}

export const FindMyTicketsModal: React.FC<FindMyTicketsModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
}) => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const magicLinkMutation = useMagicLinkMutation(apiUrl)

  const validateEmail = (val: string) => {
    if (!val.trim()) {
      return 'Email address is required.'
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(val.trim())) {
      return 'Please enter a valid email address.'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)

    const err = validateEmail(email)
    if (err) {
      setEmailError(err)
      return
    }

    try {
      await magicLinkMutation.mutateAsync({ email })
      setSuccess(true)
    } catch {
      // Handled via mutation.error
    }
  }

  const handleReset = () => {
    setEmail('')
    setEmailError(null)
    setSuccess(false)
    magicLinkMutation.reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-indigo-glow" />
          <span>Find My Tickets</span>
        </div>
      }
      description="Request a secure magic link sent to your email to view your full ticket history."
    >
      <div className="space-y-4">
        {magicLinkMutation.error && (
          <div
            data-testid="portal-magic-link-error"
            className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-sentiment-negative text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{magicLinkMutation.error.message}</span>
          </div>
        )}

        {success ? (
          <div data-testid="portal-magic-link-success" className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-sentiment-positive/10 border border-sentiment-positive/30 text-sentiment-positive mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-body-sm font-semibold text-text-primary">Magic link requested!</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                If an account exists for <span className="font-semibold text-text-primary">{email}</span>, we've sent a direct link with your ticket history.
              </p>
            </div>
            <button
              type="button"
              data-testid="portal-magic-link-done-btn"
              onClick={handleReset}
              className="w-full h-9 bg-surface-container-high hover:bg-surface-container-highest border border-border-prominent text-text-primary text-xs font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="portal-magic-link-email" className="block text-xs font-medium text-text-secondary mb-1">
                Your Email Address
              </label>
              <div className="relative">
                <input
                  id="portal-magic-link-email"
                  data-testid="portal-magic-link-email"
                  type="email"
                  required
                  value={email}
                  disabled={magicLinkMutation.isPending}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  placeholder="name@example.com"
                  className={`w-full h-9 px-3 bg-surface-canvas border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent-indigo-glow ${
                    emailError ? 'border-sentiment-negative' : 'border-border-subtle'
                  }`}
                />
              </div>
              {emailError && (
                <p data-testid="portal-magic-email-error" className="text-[11px] text-sentiment-negative mt-1">
                  {emailError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={magicLinkMutation.isPending}
                className="h-9 px-3 text-xs text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="portal-magic-link-submit-btn"
                disabled={magicLinkMutation.isPending}
                className="h-9 px-4 bg-primary-container hover:bg-primary-dark text-white text-xs font-medium rounded-lg shadow-keylight-primary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {magicLinkMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Link...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Magic Link</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
