import React, { useState, useEffect } from 'react'
import { UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export interface InviteMemberModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSubmit: (email: string, role: 'agent' | 'admin') => Promise<void> | void
  readonly existingEmails?: readonly string[]
  readonly isSubmitting?: boolean
  readonly error?: string | null
  readonly success?: string | null
  readonly className?: string
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingEmails = [],
  isSubmitting = false,
  error = null,
  success = null,
  className = '',
}) => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'agent' | 'admin'>('agent')
  const [clientError, setClientError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setEmail('')
      setRole('agent')
      setClientError(null)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) {
      setClientError('Email address is required.')
      return
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setClientError('Please enter a valid email address.')
      return
    }

    // Duplicate check against existing members and pending invites
    const normalizedExisting = existingEmails.map((e) => e.trim().toLowerCase())
    if (normalizedExisting.includes(trimmedEmail)) {
      setClientError('This email address has already been invited or is already a member.')
      return
    }

    await onSubmit(trimmedEmail, role)
  }

  const activeError = clientError || error

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-accent-glow" />
          <span>Invite Organization Member</span>
        </div>
      }
      description="Send an onboarding invitation link with role-based permissions."
      className={`max-w-md ${className}`}
    >
      <form data-testid="invite-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Error message */}
        {activeError && (
          <div
            data-testid="invite-error"
            className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded text-xs text-sentiment-negative flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{activeError}</span>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div
            data-testid="invite-success"
            className="p-3 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded text-xs text-sentiment-positive flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Email Address */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="invite-email"
            className="text-label-regular font-label-regular text-text-secondary text-xs"
          >
            Email Address
          </label>
          <Input
            id="invite-email"
            data-testid="invite-email-input"
            type="email"
            required
            autoComplete="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (clientError) setClientError(null)
            }}
          />
        </div>

        {/* Role Selection */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="invite-role"
            className="text-label-regular font-label-regular text-text-secondary text-xs"
          >
            Assigned Role
          </label>
          <select
            id="invite-role"
            data-testid="invite-role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as 'agent' | 'admin')}
            className="w-full h-9 px-3 bg-surface-panel border border-border-subtle rounded text-text-primary text-xs focus:outline-none focus:border-accent-glow cursor-pointer"
          >
            <option value="agent">Agent (Triage & support queues)</option>
            <option value="admin">Admin (Full administrative privileges)</option>
          </select>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border-subtle">
          <Button
            type="button"
            variant="ghost"
            size="compact"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="compact"
            data-testid="invite-submit-btn"
            disabled={isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Send Invitation</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

InviteMemberModal.displayName = 'InviteMemberModal'
