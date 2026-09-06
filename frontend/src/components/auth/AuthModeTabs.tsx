import React from 'react'
import { authContentData } from '../../data/mockData'

export interface AuthModeTabsProps {
  readonly activeTab: 'login' | 'register'
  readonly onTabChange: (tab: 'login' | 'register') => void
  readonly signinLabel?: string
  readonly signupLabel?: string
  readonly className?: string
}

export const AuthModeTabs: React.FC<AuthModeTabsProps> = ({
  activeTab,
  onTabChange,
  signinLabel = authContentData.tabs.signin,
  signupLabel = authContentData.tabs.signup,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      className={`flex border-b border-border-subtle dark:border-border-subtle bg-surface-panel/60 dark:bg-surface-panel/60 ${className}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'login'}
        aria-label="Log In"
        onClick={() => onTabChange('login')}
        className={`flex-1 py-3 text-center text-xs font-semibold tracking-wide transition-colors ${
          activeTab === 'login'
            ? 'text-white border-b-2 border-accent-indigo-glow bg-surface-subpanel/50 dark:bg-surface-subpanel/50'
            : 'text-on-surface-variant hover:text-white border-b-2 border-transparent'
        }`}
      >
        {signinLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'register'}
        aria-label="Register"
        onClick={() => onTabChange('register')}
        className={`flex-1 py-3 text-center text-xs font-semibold tracking-wide transition-colors ${
          activeTab === 'register'
            ? 'text-white border-b-2 border-accent-indigo-glow bg-surface-subpanel/50 dark:bg-surface-subpanel/50'
            : 'text-on-surface-variant hover:text-white border-b-2 border-transparent'
        }`}
      >
        {signupLabel}
      </button>
    </div>
  )
}

export default AuthModeTabs
