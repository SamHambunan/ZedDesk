import React from 'react'
import { Mail, Lock, User as UserIcon, Shield, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { authContentData } from '../../data/mockData'

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
  className = '',
}) => {
  return (
    <form onSubmit={onSubmit} id="form-signup" className={`flex flex-col space-y-5 ${className}`}>
      <h2 className="sr-only">User Registration</h2>

      {error && (
        <div
          role="alert"
          className="bg-sentiment-critical/10 border border-sentiment-critical/20 rounded-lg p-3 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-sentiment-critical mt-0.5 flex-shrink-0" />
          <div className="font-body-compact text-body-compact text-sentiment-critical">
            {error}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Full Name Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-name"
            className="font-label-regular text-label-regular text-text-secondary block"
          >
            Full Name
          </label>
          <div className="relative group">
            <UserIcon className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-glow transition-colors pointer-events-none" />
            <input
              id="signup-name"
              type="text"
              required
              placeholder={authContentData.signup.namePlaceholder}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full h-10 bg-container-low border border-border-subtle rounded-lg pl-10 pr-3 font-body-default text-body-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-glow/50 focus:ring-1 focus:ring-accent-glow/50 transition-all"
            />
          </div>
        </div>

        {/* Email Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-email"
            className="font-label-regular text-label-regular text-text-secondary block"
          >
            Email Address
          </label>
          <div className="relative group">
            <Mail className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-glow transition-colors pointer-events-none" />
            <input
              id="signup-email"
              type="email"
              required
              placeholder={authContentData.signup.emailPlaceholder}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="w-full h-10 bg-container-low border border-border-subtle rounded-lg pl-10 pr-3 font-body-default text-body-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-glow/50 focus:ring-1 focus:ring-accent-glow/50 transition-all"
            />
          </div>
        </div>

        {/* Password Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-password"
            className="font-label-regular text-label-regular text-text-secondary block"
          >
            Password
          </label>
          <div className="relative group">
            <Lock className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-glow transition-colors pointer-events-none" />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="Min 12 chars, alphanumeric"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full h-10 bg-container-low border border-border-subtle rounded-lg pl-10 pr-10 font-body-default text-body-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-glow/50 focus:ring-1 focus:ring-accent-glow/50 transition-all"
            />
            {onToggleShowPassword && (
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={onToggleShowPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-[18px] h-[18px]" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Confirm Password Input */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-confirm"
            className="font-label-regular text-label-regular text-text-secondary block"
          >
            Confirm Password
          </label>
          <div className="relative group">
            <Shield className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-glow transition-colors pointer-events-none" />
            <input
              id="signup-confirm"
              type="password"
              required
              minLength={8}
              placeholder="Verify password"
              value={passwordConfirm}
              onChange={(e) => onPasswordConfirmChange(e.target.value)}
              className="w-full h-10 bg-container-low border border-border-subtle rounded-lg pl-10 pr-3 font-body-default text-body-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-glow/50 focus:ring-1 focus:ring-accent-glow/50 transition-all"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        aria-label="Register"
        className="w-full h-10 bg-primary-container text-white font-title-md text-title-md rounded-lg chiseled-btn hover:bg-inverse-primary active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Creating Account...' : 'Create Global Account'}</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  )
}

export default AuthRegisterForm

