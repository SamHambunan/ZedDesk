import React, { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { InvitationCard, getInviterDisplayName } from './InvitationCard'
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
  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register')

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

      {/* Main Content Area: Centered 440px tactile card featuring compound <InvitationCard.*> */}
      <main className="w-full max-w-[440px] flex flex-col items-center">
        {isLoading ? (
          <InvitationCard.Loading />
        ) : error ? (
          <InvitationCard.Error
            error={error}
            onGoToCentralHub={onGoToCentralHub}
          />
        ) : invitation ? (
          <InvitationCard.Root>
            <InvitationCard.Header
              organizationName={invitation.organization_name}
              role={invitation.role}
              inviterName={getInviterDisplayName(invitation)}
            />
            <InvitationCard.LockedEmail email={invitation.email} />

            <div className="p-6 pt-3">
              {acceptSuccess ? (
                <InvitationCard.Success
                  acceptSuccess={acceptSuccess}
                  onGoToWorkspace={onGoToWorkspace}
                />
              ) : currentUser ? (
                <InvitationCard.AuthenticatedUser
                  currentUser={currentUser}
                  error={acceptError}
                  isAccepting={isAccepting}
                  onAcceptLoggedIn={onAcceptLoggedIn}
                  onLogout={onLogout}
                />
              ) : (
                <div>
                  {/* Interactive Segmented Tab Toggle */}
                  <InvitationCard.SegmentedToggle
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                  />

                  {/* Active Form */}
                  {activeTab === 'register' ? (
                    <InvitationCard.RegisterForm
                      onSubmit={(name, pw, conf) => onAcceptRegister?.(name, pw, conf)}
                      onToggleExistingUser={() => setActiveTab('login')}
                      isSubmitting={isAccepting}
                      error={acceptError}
                    />
                  ) : (
                    <InvitationCard.LoginForm
                      defaultEmail={invitation.email}
                      onSubmit={(pw, em) => onAcceptLogin?.(pw, em)}
                      onToggleRegister={() => setActiveTab('register')}
                      isSubmitting={isAccepting}
                      error={acceptError}
                    />
                  )}
                </div>
              )}
            </div>
          </InvitationCard.Root>
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
