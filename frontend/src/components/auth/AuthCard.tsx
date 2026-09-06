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
    <div className={`w-full max-w-md mx-auto flex flex-col gap-6 font-sans relative z-10 ${className}`}>
      {/* Masthead */}
      <AuthMasthead />

      {/* Auth Card (Surface Level 2) */}
      <main className="bg-surface-subpanel dark:bg-surface-subpanel rounded-lg border border-border-prominent dark:border-border-prominent shadow-keylight overflow-hidden flex flex-col shadow-2xl shadow-black/50">
        <AuthModeTabs activeTab={activeTab} onTabChange={onTabChange} />

        <div className="p-6">
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
              showPassword={showConfirmPassword}
              onToggleShowPassword={toggleConfirmPasswordVisibility}
            />
          )}
        </div>
      </main>

      {/* Architecture Context Footer */}
      <AuthFooter />
    </div>
  )
}

export default AuthCard
