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
  signupLabel = 'Register',
  className = '',
}) => {
  return (
    <div
      role="tablist"
      aria-label="Authentication Mode"
      className={`grid grid-cols-2 p-1 bg-surface-container-lowest border border-border-subtle rounded mb-5 ${className}`}
    >
      <button
        type="button"
        id="tab-signin"
        role="tab"
        aria-selected={activeTab === 'login'}
        aria-label="Log In"
        onClick={() => onTabChange('login')}
        className={`h-11 text-sm font-medium rounded transition-colors cursor-pointer select-none ${
          activeTab === 'login'
            ? 'bg-surface-subpanel text-text-primary shadow-sm font-semibold'
            : 'text-text-secondary hover:text-text-primary'
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
        className={`h-11 text-sm font-medium rounded transition-colors cursor-pointer select-none ${
          activeTab === 'register'
            ? 'bg-surface-subpanel text-text-primary shadow-sm font-semibold'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        {signupLabel}
      </button>
    </div>
  )
}


export default AuthModeTabs
