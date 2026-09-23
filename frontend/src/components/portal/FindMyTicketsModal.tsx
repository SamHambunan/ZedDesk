import React, { useState } from 'react'
import { Mail, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useMagicLinkMutation } from '../../hooks/useCustomerPortal'
import { validateEmail } from '../../utils/validation'

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
                If tickets are associated with <span className="font-semibold text-text-primary">{email}</span>, we've sent a direct link with your ticket history.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              data-testid="portal-magic-link-done-btn"
              onClick={handleReset}
              className="w-full"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Input
                id="portal-magic-link-email"
                data-testid="portal-magic-link-email"
                label="Your Email Address"
                type="email"
                required
                value={email}
                disabled={magicLinkMutation.isPending}
                error={emailError || undefined}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder="name@example.com"
              />
              {emailError && (
                <p data-testid="portal-magic-email-error" className="text-[11px] text-sentiment-negative mt-1">
                  {emailError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={magicLinkMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="portal-magic-link-submit-btn"
                isLoading={magicLinkMutation.isPending}
                leftIcon={<Mail className="w-3.5 h-3.5" />}
              >
                Send Magic Link
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
