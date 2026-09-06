import React, { useState } from 'react'
import { Mail, Lock, User as UserIcon, Shield, ArrowRight, Eye, EyeOff, AlertCircle, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export interface AuthCardProps {
  activeTab: 'login' | 'register'
  onTabChange: (tab: 'login' | 'register') => void
  // Login props
  loginEmail: string
  setLoginEmail: (val: string) => void
  loginPassword: string
  setLoginPassword: (val: string) => void
  loginError: string | null
  isLoggingIn: boolean
  onLoginSubmit: (e: React.FormEvent) => void
  // Register props
  regName: string
  setRegName: (val: string) => void
  regEmail: string
  setRegEmail: (val: string) => void
  regPassword: string
  setRegPassword: (val: string) => void
  regPasswordConfirm: string
  setRegPasswordConfirm: (val: string) => void
  regError: string | null
  isRegistering: boolean
  onRegisterSubmit: (e: React.FormEvent) => void
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
}) => {
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-6 font-sans">
      {/* Centered Masthead */}
      <header className="flex flex-col items-center text-center space-y-3">
        <div className="w-14 h-14 rounded-lg bg-surface-panel border border-border-subtle flex items-center justify-center shadow-keylight relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#38BDF8]/10 to-[#818CF8]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Sparkles className="w-7 h-7 text-accent-indigo-glow" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#38BDF8] to-[#818CF8] bg-clip-text text-transparent">
            ZedDesk
          </h1>
          <p className="text-xs text-on-surface-variant mt-1 font-medium">
            Multi-tenant AI-Powered Helpdesk
          </p>
        </div>
      </header>

      {/* Auth Card (Surface Level 2) */}
      <main className="bg-surface-subpanel rounded-lg border border-border-prominent shadow-keylight overflow-hidden flex flex-col shadow-2xl shadow-black/50">
        {/* Mode Controller (Tabs) */}
        <div role="tablist" className="flex border-b border-border-subtle bg-surface-panel/60">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'login'}
            aria-label="Log In"
            onClick={() => onTabChange('login')}
            className={`flex-1 py-3 text-center text-xs font-semibold tracking-wide transition-colors ${
              activeTab === 'login'
                ? 'text-white border-b-2 border-accent-indigo-glow bg-surface-subpanel/50'
                : 'text-on-surface-variant hover:text-white border-b-2 border-transparent'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'register'}
            aria-label="Register"
            onClick={() => onTabChange('register')}
            className={`flex-1 py-3 text-center text-xs font-semibold tracking-wide transition-colors ${
              activeTab === 'register'
                ? 'text-white border-b-2 border-accent-indigo-glow bg-surface-subpanel/50'
                : 'text-on-surface-variant hover:text-white border-b-2 border-transparent'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'login' ? (
            /* Sign In Form (POST /api/login contract) */
            <form onSubmit={onLoginSubmit} className="flex flex-col space-y-4">
              <h2 className="sr-only">Central Hub Login</h2>

              {loginError && (
                <div role="alert" className="bg-sentiment-negative/10 border border-sentiment-negative/25 rounded p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-sentiment-negative mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-sentiment-negative font-medium leading-tight">
                    {loginError}
                  </div>
                </div>
              )}

              <Input
                label="Email"
                id="login-email"
                type="email"
                required
                placeholder="admin@domain.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                leadingIcon={<Mail className="w-4 h-4" />}
              />

              <div className="relative">
                <Input
                  label="Password"
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  leadingIcon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-[29px] text-outline hover:text-white transition-colors"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="standard"
                  isLoading={isLoggingIn}
                  className="w-full h-10 font-semibold"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Log In
                </Button>
              </div>
            </form>
          ) : (
            /* Create Account Form (POST /api/register contract) */
            <form onSubmit={onRegisterSubmit} className="flex flex-col space-y-4">
              <h2 className="sr-only">User Registration</h2>

              {regError && (
                <div role="alert" className="bg-sentiment-negative/10 border border-sentiment-negative/25 rounded p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-sentiment-negative mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-sentiment-negative font-medium leading-tight">
                    {regError}
                  </div>
                </div>
              )}

              <Input
                label="Name"
                id="reg-name"
                type="text"
                required
                placeholder="e.g. Sarah Connor"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                leadingIcon={<UserIcon className="w-4 h-4" />}
              />

              <Input
                label="Email"
                id="reg-email"
                type="email"
                required
                placeholder="sarah@company.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                leadingIcon={<Mail className="w-4 h-4" />}
              />

              <div className="relative">
                <Input
                  label="Password"
                  id="reg-password"
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  leadingIcon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-[29px] text-outline hover:text-white transition-colors"
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Input
                label="Confirm Password"
                id="reg-password-confirm"
                type="password"
                required
                minLength={8}
                placeholder="Repeat your password"
                value={regPasswordConfirm}
                onChange={(e) => setRegPasswordConfirm(e.target.value)}
                leadingIcon={<Shield className="w-4 h-4" />}
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="standard"
                  isLoading={isRegistering}
                  className="w-full h-10 font-semibold"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Register
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Architecture Context Footer */}
      <footer className="text-center text-[11px] text-outline leading-relaxed space-y-1">
        <p>Global User identity decoupled from workspaces (ADR-0002). Sanctum Bearer token persistence.</p>
        <p>Row-level database scoping & subdomain routing ({'{org}'}.zeddesk.app)</p>
      </footer>
    </div>
  )
}
