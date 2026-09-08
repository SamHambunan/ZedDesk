import React from 'react'
import { LayoutGrid, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '../ui/Button'
import { InvitationAcceptanceCard } from './InvitationAcceptanceCard'
import { invitationsContentData } from '../../data/mockData'
import type { PublicInvitationData, AuthenticatedUser, AcceptSuccessData } from './types'

export interface PublicInvitationViewProps {
  readonly invitation: PublicInvitationData | null
  readonly isLoading?: boolean
  readonly error?: string | null
  readonly currentUser?: AuthenticatedUser | null
  readonly acceptSuccess?: AcceptSuccessData | null
  readonly acceptError?: string | null
  readonly isAccepting?: boolean
  readonly onAcceptRegister?: (name: string, password: string, confirmPassword: string) => Promise<void> | void
  readonly onAcceptLogin?: (password: string, email?: string) => Promise<void> | void
  readonly onAcceptLoggedIn?: () => Promise<void> | void
  readonly onLogout?: () => Promise<void> | void
  readonly onGoToWorkspace?: (slug: string) => void
  readonly onGoToCentralHub?: () => void
  readonly className?: string
}

export const PublicInvitationView: React.FC<PublicInvitationViewProps> = ({
  invitation,
  isLoading = false,
  error = null,
  currentUser = null,
  acceptSuccess = null,
  acceptError = null,
  isAccepting = false,
  onAcceptRegister,
  onAcceptLogin,
  onAcceptLoggedIn,
  onLogout,
  onGoToWorkspace,
  onGoToCentralHub,
  className = '',
}) => {
  return (
    <div
      data-testid="public-invitation-view"
      className={`bg-canvas-base text-text-primary min-h-screen flex flex-col items-center justify-center p-4 md:p-6 font-body-default ${className}`}
    >
      {/* Minimal Header */}
      <header className="mb-8 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary-container rounded-lg flex items-center justify-center shadow-keylight-primary">
          <LayoutGrid className="w-4 h-4 text-white" />
        </div>
        <span className="font-headline-sm text-headline-sm text-text-primary font-semibold">
          {invitationsContentData.brandName}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-accent-glow/20 border border-accent-glow/30 text-primary font-label-caps text-label-caps font-semibold">
          {invitationsContentData.aiBadge}
        </span>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-[520px] flex flex-col items-center">
        {isLoading ? (
          <div
            data-testid="invitation-loading"
            className="w-full bg-surface-subpanel rounded-xl border border-border-subtle p-12 text-center shadow-keylight flex flex-col items-center gap-3"
          >
            <div className="w-6 h-6 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
            <span className="text-text-secondary text-sm">
              {invitationsContentData.loadingMessage}
            </span>
          </div>
        ) : error ? (
          <div
            data-testid="invitation-error-card"
            className="w-full bg-surface-subpanel rounded-xl border border-sentiment-negative/30 p-8 text-center shadow-keylight flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-sentiment-negative/10 border border-sentiment-negative/30 flex items-center justify-center text-sentiment-negative">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="font-headline-sm text-headline-sm text-text-primary font-semibold">
                Invalid or Expired Invitation
              </h2>
              <p
                data-testid="invitation-error"
                className="text-xs text-text-secondary max-w-sm"
              >
                {error}
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="compact"
              data-testid="go-to-central-hub-btn"
              onClick={onGoToCentralHub}
              className="mt-2 gap-2 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-text-muted" />
              <span>{invitationsContentData.goToCentralHubBtn}</span>
            </Button>
          </div>
        ) : invitation ? (
          <InvitationAcceptanceCard
            invitation={invitation}
            currentUser={currentUser}
            acceptSuccess={acceptSuccess}
            error={acceptError}
            isAccepting={isAccepting}
            onAcceptRegister={onAcceptRegister}
            onAcceptLogin={onAcceptLogin}
            onAcceptLoggedIn={onAcceptLoggedIn}
            onLogout={onLogout}
            onGoToWorkspace={onGoToWorkspace}
          />
        ) : null}
      </main>

      {/* Security Footer */}
      <footer className="mt-8 text-center max-w-[400px]">
        <p className="font-body-compact text-body-compact text-text-muted text-xs">
          {invitationsContentData.securityFooter}
        </p>
      </footer>
    </div>
  )
}

PublicInvitationView.displayName = 'PublicInvitationView'
