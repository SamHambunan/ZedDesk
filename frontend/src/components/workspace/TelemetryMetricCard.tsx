import React from 'react'

export interface PriorityIndicator {
  readonly color: 'critical' | 'warning' | 'positive' | 'neutral'
  readonly label?: string
}

export interface TelemetryMetricCardProps {
  readonly title: string
  readonly value: string | number
  readonly icon?: React.ReactNode
  readonly trend?: {
    readonly text: string
    readonly isPositive?: boolean
    readonly icon?: React.ReactNode
  }
  readonly priorityIndicators?: readonly PriorityIndicator[]
  readonly valueColor?: 'default' | 'positive' | 'warning' | 'critical'
  readonly testId?: string
  readonly className?: string
}

export const TelemetryMetricCard: React.FC<TelemetryMetricCardProps> = ({
  title,
  value,
  icon,
  trend,
  priorityIndicators,
  valueColor = 'default',
  testId,
  className = '',
}) => {
  const valueColorClass = {
    default: 'text-text-primary',
    positive: 'text-sentiment-positive',
    warning: 'text-sentiment-warning',
    critical: 'text-sentiment-critical',
  }[valueColor]

  return (
    <div
      data-testid={testId}
      className={`bg-surface-subpanel rounded-xl p-5 border border-border-subtle shadow-keylight flex flex-col gap-2 transition-colors ${className}`}
    >
      <div className="text-label-caps font-label-caps text-text-secondary flex items-center gap-2 uppercase">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{title}</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`text-display-lg font-display-lg font-semibold tabular-nums ${valueColorClass}`}>
          {value}
        </span>

        {trend && (
          <span
            className={`text-body-compact font-body-compact flex items-center gap-1 ${
              trend.isPositive !== false ? 'text-sentiment-positive' : 'text-sentiment-critical'
            }`}
          >
            {trend.icon}
            <span>{trend.text}</span>
          </span>
        )}

        {priorityIndicators && priorityIndicators.length > 0 && (
          <div className="flex items-center gap-1.5 ml-1">
            {priorityIndicators.map((indicator, idx) => {
              const bgClass =
                indicator.color === 'critical'
                  ? 'bg-sentiment-critical'
                  : indicator.color === 'warning'
                  ? 'bg-sentiment-warning'
                  : indicator.color === 'positive'
                  ? 'bg-sentiment-positive'
                  : 'bg-sentiment-neutral'
              return (
                <div
                  key={idx}
                  title={indicator.label}
                  className={`w-2 h-2 rounded-full ${bgClass} shrink-0`}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default TelemetryMetricCard
