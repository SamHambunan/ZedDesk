import React, { useState } from 'react'
import { LogIn, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { invitationsContentData } from '../../data/mockData'

export interface InvitationLoginFormProps {
  readonly defaultEmail: string
  readonly onSubmit: (password: string, email?: string) => Promise<void> | void
  readonly onToggleRegister: () => void
  readonly isSubmitting?: boolean
  readonly error?: string | null
  readonly className?: string
}

export const InvitationLoginForm: React.FC<InvitationLoginFormProps> = ({
  defaultEmail,
  onSubmit,
  onToggleRegister,
  isSubmitting = false,
  error = null,
  className = '',
}) => {
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    if (!password) {
      setClientError('Password is required.')
      return
    }

    await onSubmit(password, email)
  }

  const activeError = clientError || error

  return (
    <form
      data-testid="invitation-login-form"
      onSubmit={handleSubmit}
      className={`space-y-4 ${className}`}
    >
      <h2 className="font-title-md text-title-md text-text-primary mb-2 font-semibold">
        {invitationsContentData.loginTitle}
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

      {/* Email Address */}
      <div className="space-y-1.5">
        <label
          htmlFor="accept-login-email"
          className="font-label-regular text-label-regular text-text-secondary block text-xs"
        >
          {invitationsContentData.emailLabel}
        </label>
        <Input
          id="accept-login-email"
          data-testid="accept-login-email-input"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 rounded-lg"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="accept-login-password"
          className="font-label-regular text-label-regular text-text-secondary block text-xs"
        >
          {invitationsContentData.passwordLabel}
        </label>
        <Input
          id="accept-login-password"
          data-testid="accept-login-password-input"
          type="password"
          required
          autoComplete="current-password"
          placeholder={invitationsContentData.passwordPlaceholder}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (clientError) setClientError(null)
          }}
          className="h-8 rounded-lg"
        />
      </div>

      {/* Primary Submit CTA */}
      <Button
        type="submit"
        variant="primary"
        size="standard"
        data-testid="accept-existing-user-btn"
        disabled={isSubmitting}
        className="w-full h-9 mt-4 rounded-lg shadow-keylight-primary gap-2 font-label-regular text-label-regular"
      >
        {isSubmitting ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span>{invitationsContentData.signingInBtn}</span>
          </>
        ) : (
          <>
            <LogIn className="w-4 h-4" />
            <span>{invitationsContentData.signInAndAcceptBtn}</span>
          </>
        )}
      </Button>

      {/* Toggle Link */}
      <div className="mt-4 text-center">
        <button
          type="button"
          data-testid="toggle-register"
          onClick={onToggleRegister}
          className="font-label-regular text-label-regular text-text-secondary hover:text-accent-glow transition-colors text-xs cursor-pointer focus:outline-none"
        >
          {invitationsContentData.needAccount}
        </button>
      </div>
    </form>
  )
}

InvitationLoginForm.displayName = 'InvitationLoginForm'
