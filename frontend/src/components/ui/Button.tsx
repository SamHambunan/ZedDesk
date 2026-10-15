import React from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ai' | 'danger' | 'amber'
export type ButtonSize = 'compact' | 'standard' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  focusRing?: 'amber'
}

export const Button = (
    {
      children,
      className,
      variant = 'primary',
      size = 'standard',
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      focusRing = 'amber',
      ref,
      ...props
    }: ButtonProps
  ) => {
    const ringClass = 'focus-visible:ring-focus-amber'

    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded select-none transition-colors duration-150 relative ' +
      'focus-visible:outline-none focus-visible:ring-2 ' +
      ringClass +
      ' focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-primary-container hover:bg-primary-dark text-on-primary shadow-keylight-primary border border-transparent',
      secondary:
        'bg-surface-subpanel hover:bg-surface-container-high text-on-surface border border-border-prominent shadow-keylight',
      ghost:
        'bg-transparent hover:bg-surface-subpanel text-on-surface-variant hover:text-on-surface border border-transparent',
      ai:
        'bg-gradient-to-b from-primary-highlight to-primary-container hover:brightness-110 text-on-primary border border-secondary/40 shadow-keylight-primary',
      danger:
        'bg-sentiment-negative hover:bg-rose-600 text-white shadow-keylight-primary border border-transparent',
      amber:
        'bg-amber-action hover:bg-amber-hover active:bg-amber-pressed text-on-amber-action font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] border border-transparent',
    }

    const sizeStyles: Record<ButtonSize, string> = {
      compact: 'h-8 px-3 text-xs gap-1.5',
      standard: 'h-9 px-4 text-xs gap-2',
      lg: 'h-10 px-5 text-sm gap-2.5',
      icon: 'h-9 w-9 p-0 gap-0',
    }

    const isAiVariant = variant === 'ai'

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            {isAiVariant && !leftIcon && <Sparkles className="w-4 h-4 text-secondary-light flex-shrink-0" />}
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          </>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    )
  }

Button.displayName = 'Button'
