import React from 'react'
import { User as UserIcon, CreditCard, LogOut, Settings } from 'lucide-react'
import { hubContentData } from '../../data/mockData'

export interface HubUserInfo {
  readonly name: string
  readonly email: string
  readonly roleTitle?: string
  readonly avatarUrl?: string
}

export interface UserProfileCardProps {
  readonly user: HubUserInfo
  readonly onLogout?: () => void
  readonly isLoggingOut?: boolean
  readonly className?: string
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({
  user,
  onLogout,
  isLoggingOut = false,
  className = '',
}) => {
  const avatarSrc = user.avatarUrl || hubContentData.profile.defaultAvatarUrl

  return (
    <div
      data-testid="user-profile-card"
      className={`bg-surface-panel border border-border-subtle rounded-xl p-5 flex flex-col gap-5 text-left shadow-sm ${className}`}
    >
      <div className="flex items-center gap-4">
        {avatarSrc ? (
          <img
            alt={user.name ? `${user.name} Avatar` : 'Avatar'}
            src={avatarSrc}
            className="w-12 h-12 rounded-full border border-border-prominent object-cover shrink-0"
            onError={(e) => {
              // Fallback to placeholder if image fails to load
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full border border-border-prominent bg-surface-subpanel flex items-center justify-center shrink-0">
            <UserIcon className="w-6 h-6 text-text-muted" />
          </div>
        )}

        <div className="flex flex-col min-w-0">
          <span className="font-title-md text-title-md text-text-primary font-semibold truncate">
            {user.name}
          </span>
          <span className="font-body-compact text-body-compact text-text-muted truncate">
            {user.email}
          </span>
          <span className="sr-only">Logged in as {user.name} ({user.email})</span>
          {user.roleTitle && (
            <div className="mt-1 inline-flex w-max">
              <span className="bg-surface-container border border-border-prominent text-text-secondary font-label-caps text-label-caps px-2 py-0.5 rounded select-none">
                {user.roleTitle}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="h-px w-full bg-border-subtle" />

      <div className="flex flex-col gap-1.5">
        <a
          href="#settings"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors font-body-default text-body-default px-2 py-1.5 rounded hover:bg-surface-subpanel"
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span>{hubContentData.profile.accountSettings}</span>
        </a>
        <a
          href="#billing"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors font-body-default text-body-default px-2 py-1.5 rounded hover:bg-surface-subpanel"
        >
          <CreditCard className="w-[18px] h-[18px] shrink-0" />
          <span>{hubContentData.profile.billingPlans}</span>
        </a>
        {onLogout && (
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={onLogout}
            className="flex items-center gap-2 text-text-secondary hover:text-sentiment-critical transition-colors font-body-default text-body-default px-2 py-1.5 rounded hover:bg-surface-subpanel w-full mt-1 border border-transparent hover:border-sentiment-critical/20 text-left cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span>{isLoggingOut ? 'Logging out...' : hubContentData.profile.logout}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default UserProfileCard
