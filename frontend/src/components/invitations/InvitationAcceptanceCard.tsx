import React, { useState } from 'react'
import { Lock, ArrowRight, LogOut, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { InvitationRegisterForm } from './InvitationRegisterForm'
import { InvitationLoginForm } from './InvitationLoginForm'
import { invitationsContentData } from '../../data/mockData'
import type { PublicInvitationData, AuthenticatedUser, AcceptSuccessData } from './types'

export interface InvitationAcceptanceCardProps {
  readonly invitation: PublicInvitationData
  readonly currentUser?: AuthenticatedUser | null
  readonly acceptSuccess?: AcceptSuccessData | null
  readonly error?: string | null
  readonly isAccepting?: boolean
  readonly onAcceptRegister?: (name: string, password: string, confirmPassword: string) => Promise<void> | void
  readonly onAcceptLogin?: (password: string, email?: string) => Promise<void> | void
  readonly onAcceptLoggedIn?: () => Promise<void> | void
  readonly onLogout?: () => Promise<void> | void
  readonly onGoToWorkspace?: (slug: string) => void
  readonly className?: string
}

function getOrgInitials(name: string): string {
  if (!name) return 'ZD'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export const InvitationAcceptanceCard: React.FC<InvitationAcceptanceCardProps> = ({
  invitation,
  currentUser = null,
  acceptSuccess = null,
  error = null,
  isAccepting = false,
  onAcceptRegister,
  onAcceptLogin,
  onAcceptLoggedIn,
  onLogout,
  onGoToWorkspace,
  className = '',
}) => {
  const [isLoginMode, setIsLoginMode] = useState(false)
  const orgInitials = getOrgInitials(invitation.organization_name)
  const roleLower = (invitation.role || 'agent').toLowerCase()
  const isAdmin = roleLower === 'admin'

  return (
    <div
      data-testid="invitation-acceptance-card"
      className={`w-full max-w-[520px] bg-surface-subpanel rounded-xl border border-border-subtle shadow-keylight overflow-hidden ${className}`}
    >
      {/* Banner & Invitation Text */}
      <div className="p-6 border-b border-border-subtle bg-surface-panel flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-surface-container-highest rounded-full border border-border-prominent flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
          <span className="font-headline-md text-headline-md text-primary font-semibold select-none">
            {orgInitials}
          </span>
        </div>

        <h1 className="font-headline-md text-headline-md text-text-primary mb-2 font-semibold">
          Join <span data-testid="invitation-org-name">{invitation.organization_name}</span>
        </h1>

        <p className="font-body-default text-body-default text-text-secondary">
          You have been invited to join as an{' '}
          <span
            data-testid="invitation-role"
            className={`inline-flex items-center px-2 py-0.5 rounded text-label-caps font-label-caps ml-1 font-semibold uppercase ${
              isAdmin
                ? 'bg-purple-900/30 text-purple-300 border border-purple-700/50'
                : 'bg-accent-glow/10 text-primary border border-accent-glow/30'
            }`}
          >
            {invitation.role}
          </span>{' '}
          member.
        </p>
      </div>

      {/* Locked Email Badge */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg border border-border-subtle opacity-90">
          <Lock className="w-4 h-4 text-text-muted shrink-0" />
          <span
            data-testid="invitation-email"
            className="font-mono-data text-mono-data text-text-secondary truncate"
          >
            {invitation.email}
          </span>
        </div>
      </div>

      {/* Card Content Area */}
      <div className="p-6 pt-4">
        {/* Success State */}
        {acceptSuccess ? (
          <div data-testid="invitation-accepted-success" className="space-y-5 text-center py-2">
            <div className="p-4 bg-sentiment-positive/10 border border-sentiment-positive/30 rounded-lg text-sentiment-positive flex items-start gap-3 text-left">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-1">
                  {invitationsContentData.acceptedSuccessTitle}
                </h3>
                <p className="text-xs text-text-primary">
                  {`You are now an Organization Member of ${acceptSuccess.organizationName} with the ${acceptSuccess.role} Role.`}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="primary"
              size="standard"
              data-testid="go-to-workspace-btn"
              onClick={() => onGoToWorkspace?.(acceptSuccess.slug)}
              className="w-full h-9 rounded-lg shadow-keylight-primary gap-2 font-label-regular text-label-regular"
            >
              <span>{invitationsContentData.goToWorkspaceBtn}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : currentUser ? (
          /* Authenticated User Mode */
          <div className="space-y-4">
            <div className="p-3 bg-surface-container rounded-lg border border-border-subtle text-xs text-text-secondary">
              Logged in as{' '}
              <strong className="text-text-primary">{currentUser.name}</strong>{' '}
              ({currentUser.email}).
            </div>

            {error && (
              <div
                data-testid="accept-error"
                className="p-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-xs text-sentiment-negative flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              size="standard"
              data-testid="accept-logged-in-btn"
              disabled={isAccepting}
              onClick={() => onAcceptLoggedIn?.()}
              className="w-full h-9 rounded-lg shadow-keylight-primary gap-2 font-label-regular text-label-regular"
            >
              {isAccepting ? (
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

            <Button
              type="button"
              variant="secondary"
              size="compact"
              data-testid="invitation-logout-btn"
              onClick={() => onLogout?.()}
              className="w-full h-8 rounded-lg gap-2 text-text-secondary text-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{invitationsContentData.switchUser}</span>
            </Button>
          </div>
        ) : isLoginMode ? (
          /* Unauthenticated Existing User Login Form */
          <InvitationLoginForm
            defaultEmail={invitation.email}
            onSubmit={(pw, em) => onAcceptLogin?.(pw, em)}
            onToggleRegister={() => setIsLoginMode(false)}
            isSubmitting={isAccepting}
            error={error}
          />
        ) : (
          /* Unauthenticated New User Registration Form */
          <InvitationRegisterForm
            onSubmit={(name, pw, confirm) => onAcceptRegister?.(name, pw, confirm)}
            onToggleExistingUser={() => setIsLoginMode(true)}
            isSubmitting={isAccepting}
            error={error}
          />
        )}
      </div>
    </div>
  )
}

InvitationAcceptanceCard.displayName = 'InvitationAcceptanceCard'
