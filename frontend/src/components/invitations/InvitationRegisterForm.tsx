import React, { useState } from 'react'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { invitationsContentData } from '../../data/mockData'

export interface InvitationRegisterFormProps {
  readonly onSubmit: (name: string, password: string, confirmPassword: string) => Promise<void> | void
  readonly onToggleExistingUser: () => void
  readonly isSubmitting?: boolean
  readonly error?: string | null
  readonly className?: string
}

function calculatePasswordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

export const InvitationRegisterForm: React.FC<InvitationRegisterFormProps> = ({
  onSubmit,
  onToggleExistingUser,
  isSubmitting = false,
  error = null,
  className = '',
}) => {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)

  const strength = calculatePasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    if (!name.trim()) {
      setClientError('Please enter your full name.')
      return
    }

    if (password.length < 8) {
      setClientError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setClientError('Passwords do not match.')
      return
    }

    await onSubmit(name.trim(), password, confirmPassword)
  }

  const activeError = clientError || error

  return (
    <form
      data-testid="invitation-register-form"
      onSubmit={handleSubmit}
      className={`space-y-4 ${className}`}
    >
      <h2 className="font-title-md text-title-md text-text-primary mb-2 font-semibold">
        {invitationsContentData.registerTitle}
      </h2>

      {activeError && (
        <div
          data-testid="accept-error"
          className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-xs text-sentiment-negative flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{activeError}</span>
        </div>
      )}

      {/* Full Name */}
      <div className="space-y-1.5">
        <label
          htmlFor="accept-name"
          className="font-label-regular text-label-regular text-text-secondary block text-xs"
        >
          {invitationsContentData.fullNameLabel}
        </label>
        <Input
          id="accept-name"
          data-testid="accept-name-input"
          type="text"
          required
          autoComplete="name"
          placeholder={invitationsContentData.fullNamePlaceholder}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (clientError) setClientError(null)
          }}
          className="h-8 rounded-lg"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="accept-password"
          className="font-label-regular text-label-regular text-text-secondary block text-xs"
        >
          {invitationsContentData.passwordLabel}
        </label>
        <Input
          id="accept-password"
          data-testid="accept-password-input"
          type="password"
          required
          autoComplete="new-password"
          placeholder={invitationsContentData.passwordPlaceholder}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (clientError) setClientError(null)
          }}
          className="h-8 rounded-lg"
        />

        {/* Password Strength Indicator Bar */}
        <div className="flex gap-1 mt-1.5 h-1">
          <div
            className={`w-1/4 rounded-full transition-colors ${
              strength >= 1 ? 'bg-sentiment-critical' : 'bg-border-subtle'
            }`}
          />
          <div
            className={`w-1/4 rounded-full transition-colors ${
              strength >= 2 ? 'bg-sentiment-warning' : 'bg-border-subtle'
            }`}
          />
          <div
            className={`w-1/4 rounded-full transition-colors ${
              strength >= 3 ? 'bg-sentiment-positive' : 'bg-border-subtle'
            }`}
          />
          <div
            className={`w-1/4 rounded-full transition-colors ${
              strength >= 4 ? 'bg-sentiment-positive' : 'bg-border-subtle'
            }`}
          />
        </div>
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="accept-password-confirm"
          className="font-label-regular text-label-regular text-text-secondary block text-xs"
        >
          {invitationsContentData.confirmPasswordLabel}
        </label>
        <Input
          id="accept-password-confirm"
          data-testid="accept-password-confirm-input"
          type="password"
          required
          autoComplete="new-password"
          placeholder={invitationsContentData.confirmPasswordPlaceholder}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            if (clientError) setClientError(null)
          }}
          className="h-8 rounded-lg"
        />
      </div>

      {/* Primary CTA */}
      <Button
        type="submit"
        variant="primary"
        size="standard"
        data-testid="accept-new-user-btn"
        disabled={isSubmitting}
        className="w-full h-9 mt-4 rounded-lg shadow-keylight-primary gap-2 font-label-regular text-label-regular"
      >
        {isSubmitting ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span>{invitationsContentData.acceptingBtn}</span>
          </>
        ) : (
          <>
            <span>{invitationsContentData.acceptAndLaunchBtn}</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>

      {/* Toggle Link */}
      <div className="mt-4 text-center">
        <button
          type="button"
          data-testid="toggle-existing-user"
          onClick={onToggleExistingUser}
          className="font-label-regular text-label-regular text-text-secondary hover:text-accent-glow transition-colors text-xs cursor-pointer focus:outline-none"
        >
          {invitationsContentData.alreadyHaveAccount}
        </button>
      </div>
    </form>
  )
}

InvitationRegisterForm.displayName = 'InvitationRegisterForm'
