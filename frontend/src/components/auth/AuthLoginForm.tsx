import React, { useState } from 'react'
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { authContentData } from '../../data/mockData'

export interface AuthLoginFormProps {
  readonly email: string
  readonly onEmailChange: (val: string) => void
  readonly password: string
  readonly onPasswordChange: (val: string) => void
  readonly error: string | null
  readonly isLoading: boolean
  readonly onSubmit: (e: React.FormEvent) => void
  readonly showPassword?: boolean
  readonly onToggleShowPassword?: () => void
  readonly className?: string
}

export const AuthLoginForm: React.FC<AuthLoginFormProps> = ({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  error,
  isLoading,
  onSubmit,
  showPassword = false,
  onToggleShowPassword,
  className = '',
}) => {
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})

  const validate = () => {
    const errs: { email?: string; password?: string } = {}
    if (!email.trim()) {
      errs.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address.'
    }
    if (!password) {
      errs.password = 'Password is required.'
    }
    return errs
  }

  const handleBlur = (field: 'email' | 'password') => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const errs = validate()
    setFieldErrors((prev) => ({
      ...prev,
      [field]: errs[field],
    }))
  }

  const handleEmailChange = (val: string) => {
    onEmailChange(val)
    if (fieldErrors.email || touched.email) {
      if (!val.trim()) {
        setFieldErrors((prev) => ({ ...prev, email: 'Email is required.' }))
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
        setFieldErrors((prev) => ({ ...prev, email: 'Please enter a valid email address.' }))
      } else {
        setFieldErrors((prev) => ({ ...prev, email: undefined }))
      }
    }
  }

  const handlePasswordChange = (val: string) => {
    onPasswordChange(val)
    if (fieldErrors.password || touched.password) {
      if (!val) {
        setFieldErrors((prev) => ({ ...prev, password: 'Password is required.' }))
      } else {
        setFieldErrors((prev) => ({ ...prev, password: undefined }))
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length === 0) {
      onSubmit(e)
    }
  }

  const emailHasError = Boolean(fieldErrors.email)
  const passwordHasError = Boolean(fieldErrors.password)

  return (
    <form onSubmit={handleSubmit} noValidate id="form-signin" className={`flex flex-col space-y-4 ${className}`}>
      <h2 className="sr-only">Central Hub Login</h2>

      {error && (
        <div
          role="alert"
          className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-3 flex items-start gap-2.5 text-xs text-[#EF4444] font-medium"
        >
          <AlertCircle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Email Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signin-email"
            className="text-xs font-medium text-[#A0A6B5] block select-none"
          >
            {authContentData.signin.emailLabel}
          </label>
          <div className="relative group">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signin-email"
              type="email"
              required
              placeholder={authContentData.signin.emailPlaceholder}
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={() => handleBlur('email')}
              aria-invalid={emailHasError}
              aria-describedby={emailHasError ? 'signin-email-error' : undefined}
              className={`w-full h-10 bg-[#121316] rounded px-3 py-2 pl-9 text-xs text-[#F1F3F7] placeholder-[#525866] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all font-mono ${
                emailHasError
                  ? 'border border-[#EF4444] focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border border-[#282A33] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              }`}
            />
          </div>
          {emailHasError && (
            <p id="signin-email-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password Input */}
        <div className="space-y-1.5 text-left">
          <div className="flex justify-between items-center">
            <label
              htmlFor="signin-password"
              className="text-xs font-medium text-[#A0A6B5] block select-none"
            >
              {authContentData.signin.passwordLabel}
            </label>
            <a
              href="#"
              className="text-xs text-[#F59E0B] hover:text-[#FBBF24] transition-colors"
            >
              Forgot?
            </a>
          </div>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder={authContentData.signin.passwordPlaceholder}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              onBlur={() => handleBlur('password')}
              aria-invalid={passwordHasError}
              aria-describedby={passwordHasError ? 'signin-password-error' : undefined}
              className={`w-full h-10 bg-[#121316] rounded px-3 py-2 pl-9 pr-10 text-xs text-[#F1F3F7] placeholder-[#525866] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all font-mono ${
                passwordHasError
                  ? 'border border-[#EF4444] focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border border-[#282A33] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              }`}
            />
            {onToggleShowPassword && (
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={onToggleShowPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525866] hover:text-[#F1F3F7] transition-colors focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          {passwordHasError && (
            <p id="signin-password-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.password}
            </p>
          )}
        </div>
      </div>

      {/* Tactical Amber Submit Button (10.4:1 contrast WCAG AAA) */}
      <button
        type="submit"
        disabled={isLoading}
        aria-label="Log In"
        className="w-full h-10 mt-2 bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F1012] font-semibold text-xs rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Signing In...' : 'Sign In to ZedDesk'}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  )
}

export default AuthLoginForm
