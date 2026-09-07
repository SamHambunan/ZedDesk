import React, { useState } from 'react'
import { ShieldAlert, AlertTriangle, HelpCircle, ArrowLeft, KeyRound, LogIn } from 'lucide-react'
import { getCentralHubUrl, getApiBaseUrl } from '../../utils/url'

export interface PerimeterErrorCardProps {
  readonly status: 401 | 403 | 404 | number
  readonly subdomain?: string | null
  readonly message?: string
  readonly centralHubUrl?: string
  readonly returnUrl?: string
  readonly onLoginClick?: () => void
  readonly onAuthSuccess?: (token: string, user: any) => void
  readonly className?: string
}

export const PerimeterErrorCard: React.FC<PerimeterErrorCardProps> = ({
  status,
  subdomain,
  message,
  centralHubUrl = getCentralHubUrl(),
  returnUrl,
  onLoginClick,
  onAuthSuccess,
  className = '',
}) => {
  const [showDirectLogin, setShowDirectLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hubTarget = returnUrl
    ? `${centralHubUrl}?returnUrl=${encodeURIComponent(returnUrl)}`
    : centralHubUrl

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(`${getApiBaseUrl(null)}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.message || 'Invalid credentials. Please try again.')
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('zeddesk_token', data.token)
        localStorage.setItem('zeddesk_user', JSON.stringify(data.user))
      }
      if (onAuthSuccess) {
        onAuthSuccess(data.token, data.user)
      } else if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderDirectLoginForm = () => (
    <form onSubmit={handleDirectLogin} className="w-full mt-4 flex flex-col gap-3 text-left">
      {loginError && (
        <div className="p-2.5 bg-sentiment-critical/15 border border-sentiment-critical/30 rounded text-sentiment-critical text-body-compact text-center">
          {loginError}
        </div>
      )}
      <div>
        <label className="block font-label-regular text-label-regular text-text-secondary mb-1">
          Email Address
        </label>
        <input
          type="email"
          data-testid="direct-login-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="admin@acme.test"
          className="w-full h-9 px-3 bg-surface-container-high border border-border-prominent rounded text-text-primary text-body-default placeholder:text-text-muted focus:outline-none focus:border-accent-glow"
        />
      </div>
      <div>
        <label className="block font-label-regular text-label-regular text-text-secondary mb-1">
          Password
        </label>
        <input
          type="password"
          data-testid="direct-login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className="w-full h-9 px-3 bg-surface-container-high border border-border-prominent rounded text-text-primary text-body-default placeholder:text-text-muted focus:outline-none focus:border-accent-glow"
        />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button
          type="submit"
          data-testid="direct-login-submit-btn"
          disabled={isSubmitting}
          className="flex-1 h-9 bg-primary-container hover:bg-primary-dark text-white rounded font-label-regular text-label-regular font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowDirectLogin(false)}
          className="h-9 px-3 bg-surface-container-high hover:bg-surface-panel text-text-secondary rounded font-label-regular text-label-regular transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  )

  if (status === 401) {
    return (
      <div className={`max-w-md mx-auto my-12 w-full px-4 ${className}`}>
        <div
          data-testid="workspace-unauthenticated"
          className="bg-surface-subpanel border border-border-subtle shadow-card rounded-xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-full bg-surface-container-high border border-border-prominent flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6 text-accent-glow" />
          </div>

          <h2 className="text-headline-sm font-headline-sm font-semibold text-text-primary mb-2">
            Authentication Required
          </h2>
          <p className="text-body-default text-text-secondary mb-6 leading-relaxed">
            You must be logged in to access the {subdomain ? <strong className="text-text-primary">{subdomain}</strong> : 'requested'} workspace.
          </p>

          {!showDirectLogin ? (
            <div className="flex flex-col gap-3 w-full">
              <a
                href={hubTarget}
                onClick={onLoginClick}
                data-testid="login-redirect-btn"
                className="inline-flex items-center justify-center h-9 px-5 bg-primary-container hover:bg-primary-dark text-white rounded font-label-regular text-label-regular font-semibold shadow-keylight transition-colors"
              >
                Log In at Central Hub
              </a>
              <button
                type="button"
                data-testid="toggle-direct-login-btn"
                onClick={() => setShowDirectLogin(true)}
                className="inline-flex items-center justify-center gap-2 h-9 px-5 bg-surface-container-high hover:bg-surface-panel border border-border-prominent text-text-secondary hover:text-text-primary rounded font-label-regular text-label-regular font-medium transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-text-muted" />
                <span>Sign In Directly</span>
              </button>
            </div>
          ) : (
            renderDirectLoginForm()
          )}
        </div>
      </div>
    )
  }

  if (status === 403) {
    return (
      <div className={`max-w-md mx-auto my-12 w-full px-4 ${className}`}>
        <div
          data-testid="workspace-403"
          className="bg-surface-subpanel border border-sentiment-critical/30 shadow-card rounded-xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-full bg-sentiment-critical/10 border border-sentiment-critical/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-sentiment-critical" />
          </div>

          <h2 className="text-headline-sm font-headline-sm font-semibold text-sentiment-critical mb-2">
            Access Denied
          </h2>
          <p className="text-body-default text-text-secondary mb-6 leading-relaxed">
            You are not an Organization Member of this Organization.
          </p>

          {!showDirectLogin ? (
            <div className="flex flex-col gap-3 w-full">
              <a
                href={centralHubUrl}
                className="inline-flex items-center gap-2 justify-center h-9 px-5 bg-surface-container-high hover:bg-surface-panel border border-border-prominent text-text-primary rounded font-label-regular text-label-regular font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-text-muted" />
                <span>Return to Central Hub</span>
              </a>
              <button
                type="button"
                data-testid="switch-account-btn"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('zeddesk_token')
                    localStorage.removeItem('zeddesk_user')
                  }
                  setShowDirectLogin(true)
                }}
                className="inline-flex items-center justify-center gap-2 h-9 px-5 bg-transparent hover:bg-surface-container-high border border-border-prominent text-text-secondary hover:text-text-primary rounded font-label-regular text-label-regular font-medium transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-text-muted" />
                <span>Switch Account / Sign In</span>
              </button>
            </div>
          ) : (
            renderDirectLoginForm()
          )}
        </div>
      </div>
    )
  }

  if (status === 404) {
    return (
      <div className={`max-w-md mx-auto my-12 w-full px-4 ${className}`}>
        <div
          data-testid="workspace-404"
          className="bg-surface-subpanel border border-border-subtle shadow-card rounded-xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-full bg-surface-container-high border border-border-prominent flex items-center justify-center mb-4">
            <HelpCircle className="w-6 h-6 text-text-muted" />
          </div>

          <h2 className="text-headline-sm font-headline-sm font-semibold text-text-primary mb-2">
            Organization Not Found
          </h2>
          <p className="text-body-default text-text-secondary mb-6 leading-relaxed">
            The organization subdomain{' '}
            {subdomain ? <strong className="text-text-primary">{subdomain}</strong> : ''} does not exist.
          </p>

          <a
            href={centralHubUrl}
            className="inline-flex items-center gap-2 justify-center h-9 px-5 bg-surface-container-high hover:bg-surface-panel border border-border-prominent text-text-primary rounded font-label-regular text-label-regular font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-text-muted" />
            <span>Return to Central Hub</span>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-md mx-auto my-12 w-full px-4 ${className}`}>
      <div
        data-testid="workspace-error"
        className="bg-surface-subpanel border border-border-subtle shadow-card rounded-xl p-8 text-center flex flex-col items-center"
      >
        <div className="w-12 h-12 rounded-full bg-surface-container-high border border-border-prominent flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-sentiment-warning" />
        </div>

        <h2 className="text-headline-sm font-headline-sm font-semibold text-text-primary mb-2">
          Workspace Error ({status})
        </h2>
        <p className="text-body-default text-text-secondary mb-6 leading-relaxed">
          {message || 'An error occurred while connecting to the workspace.'}
        </p>

        <a
          href={centralHubUrl}
          className="inline-flex items-center gap-2 justify-center h-9 px-5 bg-surface-container-high hover:bg-surface-panel border border-border-prominent text-text-primary rounded font-label-regular text-label-regular font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-text-muted" />
          <span>Return to Central Hub</span>
        </a>
      </div>
    </div>
  )
}

export default PerimeterErrorCard
