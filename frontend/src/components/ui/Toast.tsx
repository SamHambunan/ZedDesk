import React, { useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface ToastProps {
  readonly open: boolean
  readonly onClose?: () => void
  readonly message: string
  readonly duration?: number
  readonly className?: string
}

export const Toast: React.FC<ToastProps> = ({
  open,
  onClose,
  message,
  duration = 3000,
  className,
}) => {
  useEffect(() => {
    if (!open || !duration) return

    const timer = setTimeout(() => {
      onClose?.()
    }, duration)

    return () => clearTimeout(timer)
  }, [open, duration, onClose])

  if (!open) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="tactical-toast"
      className={cn(
        'fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3',
        'bg-surface-subpanel/95 backdrop-blur-md border border-sentiment-positive/30 rounded-lg',
        'shadow-modal text-on-surface text-xs font-mono-data tracking-tight select-none',
        'animate-in fade-in slide-in-from-bottom-2 duration-150',
        className
      )}
    >
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-sentiment-positive/15 text-sentiment-positive shrink-0">
        <Check className="w-3.5 h-3.5" />
      </div>
      <span data-testid="toast-message" className="text-text-primary">
        {message}
      </span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss toast"
          className="ml-1 p-0.5 text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

Toast.displayName = 'Toast'
