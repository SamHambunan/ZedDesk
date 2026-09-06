import React from 'react'
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
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
  return (
    <form onSubmit={onSubmit} className={`flex flex-col space-y-4 ${className}`}>
      <h2 className="sr-only">Central Hub Login</h2>

      {error && (
        <div
          role="alert"
          className="bg-sentiment-negative/10 dark:bg-sentiment-negative/10 border border-sentiment-negative/25 dark:border-sentiment-negative/25 rounded p-3 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-sentiment-negative mt-0.5 flex-shrink-0" />
          <div className="text-xs text-sentiment-negative font-medium leading-tight">
            {error}
          </div>
        </div>
      )}

      <Input
        label={authContentData.signin.emailLabel}
        id="login-email"
        type="email"
        required
        placeholder={authContentData.signin.emailPlaceholder}
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        leadingIcon={<Mail className="w-4 h-4" />}
      />

      <div className="relative">
        <Input
          label={authContentData.signin.passwordLabel}
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          required
          placeholder={authContentData.signin.passwordPlaceholder}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          leadingIcon={<Lock className="w-4 h-4" />}
        />
        {onToggleShowPassword && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={onToggleShowPassword}
            className="absolute right-3 top-[29px] text-outline hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="standard"
          isLoading={isLoading}
          className="w-full h-10 font-semibold"
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Log In
        </Button>
      </div>
    </form>
  )
}

export default AuthLoginForm
