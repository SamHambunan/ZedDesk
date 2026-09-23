import React, { useState } from 'react'
import { Mail, Lock, User as UserIcon, Shield, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { authContentData } from '../../data/mockData'
import { validateRegisterForm, isValidEmail, type RegisterFormErrors } from './authValidation'

export interface AuthRegisterFormProps {
  readonly name: string
  readonly onNameChange: (val: string) => void
  readonly email: string
  readonly onEmailChange: (val: string) => void
  readonly password: string
  readonly onPasswordChange: (val: string) => void
  readonly passwordConfirm: string
  readonly onPasswordConfirmChange: (val: string) => void
  readonly error: string | null
  readonly isLoading: boolean
  readonly onSubmit: (e: React.FormEvent) => void
  readonly showPassword?: boolean
  readonly onToggleShowPassword?: () => void
  readonly showPasswordConfirm?: boolean
  readonly onToggleShowPasswordConfirm?: () => void
  readonly className?: string
}

export const AuthRegisterForm: React.FC<AuthRegisterFormProps> = ({
  name,
  onNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  passwordConfirm,
  onPasswordConfirmChange,
  error,
  isLoading,
  onSubmit,
  showPassword = false,
  onToggleShowPassword,
  showPasswordConfirm = false,
  onToggleShowPasswordConfirm,
  className = '',
}) => {
  const [fieldErrors, setFieldErrors] = useState<RegisterFormErrors>({})
  const [touched, setTouched] = useState<{
    name?: boolean
    email?: boolean
    password?: boolean
    passwordConfirm?: boolean
  }>({})

  const handleBlur = (field: 'name' | 'email' | 'password' | 'passwordConfirm') => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const errs = validateRegisterForm(name, email, password, passwordConfirm)
    setFieldErrors((prev) => ({
      ...prev,
      [field]: errs[field],
    }))
  }

  const handleNameChange = (val: string) => {
    onNameChange(val)
    if (fieldErrors.name || touched.name) {
      setFieldErrors((prev) => ({
        ...prev,
        name: !val.trim() ? 'Full name is required.' : undefined,
      }))
    }
  }

  const handleEmailChange = (val: string) => {
    onEmailChange(val)
    if (fieldErrors.email || touched.email) {
      if (!val.trim()) {
        setFieldErrors((prev) => ({ ...prev, email: 'Email is required.' }))
      } else if (!isValidEmail(val)) {
        setFieldErrors((prev) => ({ ...prev, email: 'Please enter a valid email address.' }))
      } else {
        setFieldErrors((prev) => ({ ...prev, email: undefined }))
      }
    }
  }

  const handlePasswordChange = (val: string) => {
    onPasswordChange(val)
    if (fieldErrors.password || fieldErrors.passwordConfirm || touched.password) {
      const errs = validateRegisterForm(name, email, val, passwordConfirm)
      setFieldErrors((prev) => ({
        ...prev,
        password: errs.password,
        passwordConfirm: touched.passwordConfirm ? errs.passwordConfirm : undefined,
      }))
    }
  }

  const handlePasswordConfirmChange = (val: string) => {
    onPasswordConfirmChange(val)
    if (fieldErrors.passwordConfirm || touched.passwordConfirm) {
      if (!val) {
        setFieldErrors((prev) => ({ ...prev, passwordConfirm: 'Please confirm your password.' }))
      } else if (password !== val) {
        setFieldErrors((prev) => ({ ...prev, passwordConfirm: 'Passwords do not match.' }))
      } else {
        setFieldErrors((prev) => ({ ...prev, passwordConfirm: undefined }))
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, passwordConfirm: true })
    const errs = validateRegisterForm(name, email, password, passwordConfirm)
    setFieldErrors(errs)
    if (Object.keys(errs).length === 0) {
      onSubmit(e)
    }
  }

  const nameHasError = Boolean(fieldErrors.name)
  const emailHasError = Boolean(fieldErrors.email)
  const passwordHasError = Boolean(fieldErrors.password)
  const confirmHasError = Boolean(fieldErrors.passwordConfirm)

  return (
    <form onSubmit={handleSubmit} noValidate id="form-signup" className={`flex flex-col space-y-4 ${className}`}>
      <h2 className="sr-only">User Registration</h2>

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
        {/* Full Name Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-name"
            className="text-xs font-medium text-[#A0A6B5] block select-none"
          >
            {authContentData.signup.nameLabel}
          </label>
          <div className="relative group">
            <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signup-name"
              type="text"
              required
              placeholder={authContentData.signup.namePlaceholder}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => handleBlur('name')}
              aria-invalid={nameHasError}
              aria-describedby={nameHasError ? 'signup-name-error' : undefined}
              className={`w-full h-10 bg-[#121316] rounded px-3 py-2 pl-9 text-xs text-[#F1F3F7] placeholder-[#525866] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all ${
                nameHasError
                  ? 'border border-[#EF4444] focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border border-[#282A33] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              }`}
            />
          </div>
          {nameHasError && (
            <p id="signup-name-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.name}
            </p>
          )}
        </div>

        {/* Email Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-email"
            className="text-xs font-medium text-[#A0A6B5] block select-none"
          >
            {authContentData.signup.emailLabel}
          </label>
          <div className="relative group">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signup-email"
              type="email"
              required
              placeholder={authContentData.signup.emailPlaceholder}
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={() => handleBlur('email')}
              aria-invalid={emailHasError}
              aria-describedby={emailHasError ? 'signup-email-error' : undefined}
              className={`w-full h-10 bg-[#121316] rounded px-3 py-2 pl-9 text-xs text-[#F1F3F7] placeholder-[#525866] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all font-mono ${
                emailHasError
                  ? 'border border-[#EF4444] focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border border-[#282A33] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              }`}
            />
          </div>
          {emailHasError && (
            <p id="signup-email-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-password"
            className="text-xs font-medium text-[#A0A6B5] block select-none"
          >
            {authContentData.signup.passwordLabel}
          </label>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              placeholder={authContentData.signup.passwordPlaceholder}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              onBlur={() => handleBlur('password')}
              aria-invalid={passwordHasError}
              aria-describedby={passwordHasError ? 'signup-password-error' : undefined}
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
            <p id="signup-password-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* Confirm Password Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-confirm"
            className="text-xs font-medium text-[#A0A6B5] block select-none"
          >
            {authContentData.signup.confirmPasswordLabel}
          </label>
          <div className="relative group">
            <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866] pointer-events-none" />
            <input
              id="signup-confirm"
              type={showPasswordConfirm ? 'text' : 'password'}
              required
              minLength={8}
              placeholder={authContentData.signup.confirmPasswordPlaceholder}
              value={passwordConfirm}
              onChange={(e) => handlePasswordConfirmChange(e.target.value)}
              onBlur={() => handleBlur('passwordConfirm')}
              aria-invalid={confirmHasError}
              aria-describedby={confirmHasError ? 'signup-confirm-error' : undefined}
              className={`w-full h-10 bg-[#121316] rounded px-3 py-2 pl-9 pr-10 text-xs text-[#F1F3F7] placeholder-[#525866] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all font-mono ${
                confirmHasError
                  ? 'border border-[#EF4444] focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border border-[#282A33] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]'
              }`}
            />
            {onToggleShowPasswordConfirm && (
              <button
                type="button"
                aria-label={showPasswordConfirm ? 'Hide password' : 'Show password'}
                onClick={onToggleShowPasswordConfirm}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525866] hover:text-[#F1F3F7] transition-colors focus:outline-none cursor-pointer"
              >
                {showPasswordConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          {confirmHasError && (
            <p id="signup-confirm-error" role="alert" className="text-[11px] text-[#EF4444] font-medium mt-1">
              {fieldErrors.passwordConfirm}
            </p>
          )}
        </div>
      </div>

      {/* Tactical Amber Submit Button (10.4:1 contrast WCAG AAA) */}
      <button
        type="submit"
        disabled={isLoading}
        aria-label="Register"
        className="w-full h-10 mt-2 bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F1012] font-semibold text-xs rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Registering...' : 'Register User'}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  )
}

export default AuthRegisterForm
