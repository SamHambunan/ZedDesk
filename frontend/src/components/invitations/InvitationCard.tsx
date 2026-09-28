import React, { useState } from 'react'
import { Lock, ArrowRight, LogOut, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { InvitationRegisterForm } from './InvitationRegisterForm'
import { InvitationLoginForm } from './InvitationLoginForm'
import { invitationsContentData } from '../../data/mockData'
import { cn } from '../../lib/utils'
import type { PublicInvitationData, AuthenticatedUser, AcceptSuccessData } from './types'

export function getOrgInitials(name: string): string {
  if (!name) return 'ZD'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function getInviterDisplayName(invitation?: PublicInvitationData | null): string {
  if (!invitation) return 'an administrator'
  return invitation.invited_by?.name || invitation.inviter_name || 'an administrator'
}

// ----------------------------------------------------------------------
// Compound Subcomponents
// ----------------------------------------------------------------------

export interface InvitationCardRootProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly children: React.ReactNode
  readonly className?: string
}

export const InvitationCardRoot: React.FC<InvitationCardRootProps> = ({
  children,
  className = '',
  'data-testid': testId = 'invitation-card',
  ...props
}) => {
  return (
    <Card
      data-testid={testId}
      className={cn(
        'w-full max-w-[440px] bg-surface-subpanel rounded-xl border border-border-subtle shadow-keylight overflow-hidden',
        className
      )}
      {...props}
    >
      <div data-testid="invitation-acceptance-card" className="w-full">
        {children}
      </div>
    </Card>
  )
}
InvitationCardRoot.displayName = 'InvitationCard.Root'

export interface InvitationCardHeaderProps {
  readonly organizationName: string
  readonly role: string
  readonly inviterName?: string
  readonly className?: string
}

export const InvitationCardHeader: React.FC<InvitationCardHeaderProps> = ({
  organizationName,
  role,
  inviterName,
  className = '',
}) => {
  const orgInitials = getOrgInitials(organizationName)
  const roleLower = (role || 'agent').toLowerCase()
  const isAdmin = roleLower === 'admin'
  const resolvedInviter = inviterName || 'an administrator'

  return (
    <div
      data-testid="invitation-card-header"
      className={cn(
        'p-6 border-b border-border-subtle bg-surface-panel flex flex-col items-center text-center',
        className
      )}
    >
      {/* Tactile Organization Avatar */}
      <div className="w-16 h-16 bg-surface-container-highest rounded-full border border-border-prominent flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
        <span className="font-headline-md text-headline-md text-primary font-semibold select-none">
          {orgInitials}
        </span>
      </div>

      {/* Organization Name */}
      <h1 className="font-headline-md text-headline-md text-text-primary mb-1.5 font-semibold">
        Join <span data-testid="invitation-org-name">{organizationName}</span>
      </h1>

      {/* Inviting Member Header Metadata */}
      <div
        data-testid="invitation-inviter-wrapper"
        className="flex items-center gap-1.5 text-xs text-text-secondary mb-1.5"
      >
        <span>Invited by</span>
        <span
          data-testid="inviting-member"
          className="text-text-primary font-medium"
        >
          {resolvedInviter}
        </span>
      </div>

      {/* Role and Invitation Text */}
      <p className="font-body-default text-body-default text-text-secondary">
        You have been invited to join as an{' '}
        <Badge
          variant={isAdmin ? 'admin' : 'agent'}
          data-testid="invitation-role"
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-label-caps font-label-caps font-semibold uppercase',
            isAdmin
              ? 'bg-purple-900/30 text-purple-300 border border-purple-700/50'
              : 'bg-accent-glow/10 text-primary border border-accent-glow/30'
          )}
        >
          {role}
        </Badge>{' '}
        member.
      </p>
    </div>
  )
}
InvitationCardHeader.displayName = 'InvitationCard.Header'

export interface InvitationCardLockedEmailProps {
  readonly email: string
  readonly className?: string
}

export const InvitationCardLockedEmail: React.FC<InvitationCardLockedEmailProps> = ({
  email,
  className = '',
}) => {
  return (
    <div className={cn('px-6 pt-5 pb-2', className)}>
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg border border-border-subtle opacity-90">
        <Lock className="w-4 h-4 text-text-muted shrink-0" />
        <span
          data-testid="invitation-email"
          className="font-mono-data text-mono-data text-text-secondary truncate text-xs"
        >
          {email}
        </span>
      </div>
    </div>
  )
}
InvitationCardLockedEmail.displayName = 'InvitationCard.LockedEmail'

export interface InvitationCardSegmentedToggleProps {
  readonly activeTab: 'register' | 'login'
  readonly onTabChange: (tab: 'register' | 'login') => void
  readonly registerLabel?: string
  readonly loginLabel?: string
  readonly className?: string
}

export const InvitationCardSegmentedToggle: React.FC<InvitationCardSegmentedToggleProps> = ({
  activeTab,
  onTabChange,
  registerLabel = invitationsContentData.tabCreateAccount,
  loginLabel = invitationsContentData.tabSignIn,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      aria-label="Invitation Account Mode"
      className={cn(
        'grid grid-cols-2 p-1 bg-surface-canvas border border-border-subtle rounded-lg mb-5 select-none',
        className
      )}
    >
      <button
        type="button"
        id="tab-register"
        role="tab"
        aria-selected={activeTab === 'register'}
        data-testid="tab-register"
        onClick={() => onTabChange('register')}
        className={cn(
          'py-2 px-3 text-xs font-medium rounded-md transition-all cursor-pointer text-center truncate',
          activeTab === 'register'
            ? 'bg-surface-subpanel text-text-primary shadow-sm font-semibold border border-border-subtle'
            : 'text-text-secondary hover:text-text-primary border border-transparent'
        )}
      >
        {registerLabel}
      </button>

      <button
        type="button"
        id="tab-login"
        role="tab"
        aria-selected={activeTab === 'login'}
        data-testid="tab-login"
        onClick={() => onTabChange('login')}
        className={cn(
          'py-2 px-3 text-xs font-medium rounded-md transition-all cursor-pointer text-center truncate',
          activeTab === 'login'
            ? 'bg-surface-subpanel text-text-primary shadow-sm font-semibold border border-border-subtle'
            : 'text-text-secondary hover:text-text-primary border border-transparent'
        )}
      >
        {loginLabel}
      </button>
    </div>
  )
}
InvitationCardSegmentedToggle.displayName = 'InvitationCard.SegmentedToggle'

export interface InvitationCardAuthenticatedUserProps {
  readonly currentUser: AuthenticatedUser
  readonly error?: string | null
  readonly isAccepting?: boolean
  readonly onAcceptLoggedIn?: () => Promise<void> | void
  readonly onLogout?: () => Promise<void> | void
  readonly className?: string
}

export const InvitationCardAuthenticatedUser: React.FC<InvitationCardAuthenticatedUserProps> = ({
  currentUser,
  error = null,
  isAccepting = false,
  onAcceptLoggedIn,
  onLogout,
  className = '',
}) => {
  return (
    <div data-testid="invitation-authenticated-user" className={cn('space-y-4', className)}>
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
  )
}
InvitationCardAuthenticatedUser.displayName = 'InvitationCard.AuthenticatedUser'

export interface InvitationCardSuccessProps {
  readonly acceptSuccess: AcceptSuccessData
  readonly onGoToWorkspace?: (slug: string) => void
  readonly className?: string
}

export const InvitationCardSuccess: React.FC<InvitationCardSuccessProps> = ({
  acceptSuccess,
  onGoToWorkspace,
  className = '',
}) => {
  return (
    <div
      data-testid="invitation-accepted-success"
      className={cn('space-y-5 text-center py-2', className)}
    >
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
  )
}
InvitationCardSuccess.displayName = 'InvitationCard.Success'

export interface InvitationCardErrorProps {
  readonly error: string
  readonly onGoToCentralHub?: () => void
  readonly className?: string
}

export const InvitationCardError: React.FC<InvitationCardErrorProps> = ({
  error,
  onGoToCentralHub,
  className = '',
}) => {
  return (
    <div
      data-testid="invitation-error-card"
      className={cn(
        'w-full max-w-[440px] bg-surface-subpanel rounded-xl border border-sentiment-negative/30 p-8 text-center shadow-keylight flex flex-col items-center gap-4',
        className
      )}
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
  )
}
InvitationCardError.displayName = 'InvitationCard.Error'

export interface InvitationCardLoadingProps {
  readonly message?: string
  readonly className?: string
}

export const InvitationCardLoading: React.FC<InvitationCardLoadingProps> = ({
  message = invitationsContentData.loadingMessage,
  className = '',
}) => {
  return (
    <div
      data-testid="invitation-loading"
      className={cn(
        'w-full max-w-[440px] bg-surface-subpanel rounded-xl border border-border-subtle p-12 text-center shadow-keylight flex flex-col items-center gap-3',
        className
      )}
    >
      <div className="w-6 h-6 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
      <span className="text-text-secondary text-sm">{message}</span>
    </div>
  )
}
InvitationCardLoading.displayName = 'InvitationCard.Loading'

// ----------------------------------------------------------------------
// Main Composed Component
// ----------------------------------------------------------------------

export interface InvitationCardProps {
  readonly invitation: PublicInvitationData
  readonly currentUser?: AuthenticatedUser | null
  readonly acceptSuccess?: AcceptSuccessData | null
  readonly error?: string | null
  readonly isAccepting?: boolean
  readonly defaultTab?: 'register' | 'login'
  readonly onAcceptRegister?: (name: string, password: string, confirmPassword: string) => Promise<void> | void
  readonly onAcceptLogin?: (password: string, email?: string) => Promise<void> | void
  readonly onAcceptLoggedIn?: () => Promise<void> | void
  readonly onLogout?: () => Promise<void> | void
  readonly onGoToWorkspace?: (slug: string) => void
  readonly className?: string
}

export const InvitationCardComponent: React.FC<InvitationCardProps> = ({
  invitation,
  currentUser = null,
  acceptSuccess = null,
  error = null,
  isAccepting = false,
  defaultTab = 'register',
  onAcceptRegister,
  onAcceptLogin,
  onAcceptLoggedIn,
  onLogout,
  onGoToWorkspace,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'login'>(defaultTab)
  const inviterName = getInviterDisplayName(invitation)

  return (
    <InvitationCardRoot
      data-testid="invitation-card"
      className={className}
    >
      {/* Header */}
      <InvitationCardHeader
        organizationName={invitation.organization_name}
        role={invitation.role}
        inviterName={inviterName}
      />

      {/* Locked Email Pill */}
      <InvitationCardLockedEmail email={invitation.email} />

      {/* Card Content Body */}
      <div className="p-6 pt-3">
        {acceptSuccess ? (
          <InvitationCardSuccess
            acceptSuccess={acceptSuccess}
            onGoToWorkspace={onGoToWorkspace}
          />
        ) : currentUser ? (
          <InvitationCardAuthenticatedUser
            currentUser={currentUser}
            error={error}
            isAccepting={isAccepting}
            onAcceptLoggedIn={onAcceptLoggedIn}
            onLogout={onLogout}
          />
        ) : (
          <div>
            {/* Interactive Segmented Tab Toggle */}
            <InvitationCardSegmentedToggle
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Active Form */}
            {activeTab === 'register' ? (
              <InvitationRegisterForm
                onSubmit={(name, pw, confirm) => onAcceptRegister?.(name, pw, confirm)}
                onToggleExistingUser={() => setActiveTab('login')}
                isSubmitting={isAccepting}
                error={error}
              />
            ) : (
              <InvitationLoginForm
                defaultEmail={invitation.email}
                onSubmit={(pw, em) => onAcceptLogin?.(pw, em)}
                onToggleRegister={() => setActiveTab('register')}
                isSubmitting={isAccepting}
                error={error}
              />
            )}
          </div>
        )}
      </div>
    </InvitationCardRoot>
  )
}

InvitationCardComponent.displayName = 'InvitationCard'

// Compound Component Attachments
export const InvitationCard = Object.assign(InvitationCardComponent, {
  Root: InvitationCardRoot,
  Header: InvitationCardHeader,
  LockedEmail: InvitationCardLockedEmail,
  SegmentedToggle: InvitationCardSegmentedToggle,
  RegisterForm: InvitationRegisterForm,
  LoginForm: InvitationLoginForm,
  AuthenticatedUser: InvitationCardAuthenticatedUser,
  Success: InvitationCardSuccess,
  Error: InvitationCardError,
  Loading: InvitationCardLoading,
})

export default InvitationCard
