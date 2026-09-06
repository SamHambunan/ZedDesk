import React from 'react'
import { cn } from '../../lib/utils'

export type BadgeVariant =
  | 'positive'
  | 'warning'
  | 'critical'
  | 'neutral'
  | 'ai'
  | 'workflow'
  | 'primary'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
  positive: {
    container: 'text-sentiment-positive bg-sentiment-positive/12 border-sentiment-positive/25',
    dot: 'bg-sentiment-positive',
  },
  warning: {
    container: 'text-sentiment-warning bg-sentiment-warning/12 border-sentiment-warning/25',
    dot: 'bg-sentiment-warning',
  },
  critical: {
    container: 'text-sentiment-negative bg-sentiment-negative/12 border-sentiment-negative/25',
    dot: 'bg-sentiment-negative',
  },
  neutral: {
    container: 'text-sentiment-neutral bg-sentiment-neutral/12 border-sentiment-neutral/25',
    dot: 'bg-sentiment-neutral',
  },
  ai: {
    container: 'text-secondary-light bg-secondary/12 border-secondary/25',
    dot: 'bg-secondary-light',
  },
  workflow: {
    container: 'text-workflow-n8n-orange bg-workflow-n8n-orange/12 border-workflow-n8n-orange/25',
    dot: 'bg-workflow-n8n-orange',
  },
  primary: {
    container: 'text-[#C3C0FF] bg-primary-container/12 border-primary-container/25',
    dot: 'bg-[#C3C0FF]',
  },
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'neutral',
  dot = false,
  ...props
}) => {
  const styles = variantStyles[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-5 px-2 rounded-full border',
        'text-[11px] font-semibold uppercase tracking-wider select-none leading-none whitespace-nowrap',
        styles.container,
        className
      )}
      {...props}
    >
      {dot && (
        <span
          data-testid="badge-dot"
          className={cn('w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0', styles.dot)}
        />
      )}
      {children}
    </span>
  )
}

Badge.displayName = 'Badge'
