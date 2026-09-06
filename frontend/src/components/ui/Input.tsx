import React, { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leadingIcon?: React.ReactNode
  trailingBadge?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leadingIcon,
      trailingBadge,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-on-surface-variant tracking-wide select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {leadingIcon && (
            <div className="absolute left-3 flex items-center justify-center pointer-events-none text-on-surface-variant">
              {leadingIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full h-9 bg-surface-subpanel text-on-surface text-xs md:text-sm rounded px-3 py-1.5',
              'border border-border-subtle placeholder:text-outline transition-all duration-150',
              'focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-accent-indigo-glow/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              leadingIcon ? 'pl-9' : 'pl-3',
              trailingBadge ? 'pr-12' : 'pr-3',
              error && 'border-sentiment-negative focus:border-sentiment-negative focus:ring-sentiment-negative/30',
              className
            )}
            {...props}
          />

          {trailingBadge && (
            <div className="absolute right-2.5 flex items-center pointer-events-none">
              {typeof trailingBadge === 'string' ? (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-on-surface-variant bg-surface-container-highest/80 border border-border-prominent rounded">
                  {trailingBadge}
                </span>
              ) : (
                trailingBadge
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-sentiment-negative font-medium mt-0.5">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
