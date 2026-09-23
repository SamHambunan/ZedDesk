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
      className={`grid grid-cols-2 p-1 bg-[#121316] border border-[#282A33] rounded mb-5 ${className}`}
    >
      <button
        type="button"
        id="tab-signin"
        role="tab"
        aria-selected={activeTab === 'login'}
        aria-label="Log In"
        onClick={() => onTabChange('login')}
        className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer select-none ${
          activeTab === 'login'
            ? 'bg-[#1E2026] text-[#F1F3F7] shadow-sm font-semibold'
            : 'text-[#8890A0] hover:text-[#F1F3F7]'
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
        className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer select-none ${
          activeTab === 'register'
            ? 'bg-[#1E2026] text-[#F1F3F7] shadow-sm font-semibold'
            : 'text-[#8890A0] hover:text-[#F1F3F7]'
        }`}
      >
        {signupLabel}
      </button>
    </div>
  )
}


export default AuthModeTabs
