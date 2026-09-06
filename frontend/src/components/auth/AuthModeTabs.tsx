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
      className={`flex border-b border-border-subtle bg-surface-panel/50 ${className}`}
    >
      <button
        type="button"
        id="tab-signin"
        role="tab"
        aria-selected={activeTab === 'login'}
        aria-label="Log In"
        onClick={() => onTabChange('login')}
        className={`flex-1 py-4 text-center font-title-md text-title-md transition-colors ${
          activeTab === 'login'
            ? 'text-text-primary border-b-2 border-accent-glow bg-surface-subpanel/50'
            : 'text-text-secondary border-b-2 border-transparent hover:text-text-primary'
        }`}
      >
        {signinLabel}
      </button>
      <button
        type="button"
        id="tab-signup"
        role="tab"
        aria-selected={activeTab === 'register'}
        aria-label="Register"
        onClick={() => onTabChange('register')}
        className={`flex-1 py-4 text-center font-title-md text-title-md transition-colors ${
          activeTab === 'register'
            ? 'text-text-primary border-b-2 border-accent-glow bg-surface-subpanel/50'
            : 'text-text-secondary border-b-2 border-transparent hover:text-text-primary'
        }`}
      >
        {signupLabel}
      </button>
    </div>
  )
}


export default AuthModeTabs
