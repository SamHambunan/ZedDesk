import React from 'react'
import { ShieldAlert, AlertTriangle, HelpCircle, ArrowLeft } from 'lucide-react'
import { getCentralHubUrl } from '../../utils/url'

export interface PerimeterErrorCardProps {
  readonly status: 401 | 403 | 404 | number
  readonly subdomain?: string | null
  readonly message?: string
  readonly centralHubUrl?: string
  readonly returnUrl?: string
  readonly onLoginClick?: () => void
  readonly className?: string
}

export const PerimeterErrorCard: React.FC<PerimeterErrorCardProps> = ({
  status,
  subdomain,
  message,
  centralHubUrl = getCentralHubUrl(),
  returnUrl,
  onLoginClick,
  className = '',
}) => {
  const hubTarget = returnUrl
    ? `${centralHubUrl}?returnUrl=${encodeURIComponent(returnUrl)}`
    : centralHubUrl

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

          <a
            href={hubTarget}
            onClick={onLoginClick}
            data-testid="login-redirect-btn"
            className="inline-flex items-center justify-center h-9 px-5 bg-primary-container hover:bg-primary-dark text-white rounded font-label-regular text-label-regular font-semibold shadow-keylight transition-colors"
          >
            Log In at Central Hub
          </a>
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
