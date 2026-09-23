import React from 'react'
import { useAuthForm } from '../../hooks/useAuthForm'
import { AuthMasthead } from './AuthMasthead'
import { AuthModeTabs } from './AuthModeTabs'
import { AuthLoginForm } from './AuthLoginForm'
import { AuthRegisterForm } from './AuthRegisterForm'
import { AuthFooter } from './AuthFooter'

export interface AuthCardProps {
  readonly activeTab: 'login' | 'register'
  readonly onTabChange: (tab: 'login' | 'register') => void
  // Login props
  readonly loginEmail: string
  readonly setLoginEmail: (val: string) => void
  readonly loginPassword: string
  readonly setLoginPassword: (val: string) => void
  readonly loginError: string | null
  readonly isLoggingIn: boolean
  readonly onLoginSubmit: (e: React.FormEvent) => void
  // Register props
  readonly regName: string
  readonly setRegName: (val: string) => void
  readonly regEmail: string
  readonly setRegEmail: (val: string) => void
  readonly regPassword: string
  readonly setRegPassword: (val: string) => void
  readonly regPasswordConfirm: string
  readonly setRegPasswordConfirm: (val: string) => void
  readonly regError: string | null
  readonly isRegistering: boolean
  readonly onRegisterSubmit: (e: React.FormEvent) => void
  readonly className?: string
}

export const AuthCard: React.FC<AuthCardProps> = ({
  activeTab,
  onTabChange,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  loginError,
  isLoggingIn,
  onLoginSubmit,
  regName,
  setRegName,
  regEmail,
  setRegEmail,
  regPassword,
  setRegPassword,
  regPasswordConfirm,
  setRegPasswordConfirm,
  regError,
  isRegistering,
  onRegisterSubmit,
  className = '',
}) => {
  const {
    showPassword,
    showConfirmPassword,
    togglePasswordVisibility,
    toggleConfirmPasswordVisibility,
  } = useAuthForm()

  return (
    <div className={`w-full max-w-[480px] mx-auto flex flex-col gap-6 font-sans relative z-10 ${className}`}>
      {/* Centered Masthead */}
      <AuthMasthead />

      {/* Auth Card Box */}
      <div data-testid="auth-card" className="bg-[#16181C] rounded-lg border border-[#3B3F4D] relative overflow-hidden flex flex-col shadow-2xl p-6">
        {/* Top keylight edge highlight */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/10 pointer-events-none" />

        <AuthModeTabs activeTab={activeTab} onTabChange={onTabChange} />

        <div>
          {activeTab === 'login' ? (
            <AuthLoginForm
              email={loginEmail}
              onEmailChange={setLoginEmail}
              password={loginPassword}
              onPasswordChange={setLoginPassword}
              error={loginError}
              isLoading={isLoggingIn}
              onSubmit={onLoginSubmit}
              showPassword={showPassword}
              onToggleShowPassword={togglePasswordVisibility}
            />
          ) : (
            <AuthRegisterForm
              name={regName}
              onNameChange={setRegName}
              email={regEmail}
              onEmailChange={setRegEmail}
              password={regPassword}
              onPasswordChange={setRegPassword}
              passwordConfirm={regPasswordConfirm}
              onPasswordConfirmChange={setRegPasswordConfirm}
              error={regError}
              isLoading={isRegistering}
              onSubmit={onRegisterSubmit}
              showPassword={showPassword}
              onToggleShowPassword={togglePasswordVisibility}
              showPasswordConfirm={showConfirmPassword}
              onToggleShowPasswordConfirm={toggleConfirmPasswordVisibility}
            />
          )}
        </div>
      </div>

      {/* Architecture Context Footer */}
      <AuthFooter />
    </div>
  )
}

export default AuthCard
