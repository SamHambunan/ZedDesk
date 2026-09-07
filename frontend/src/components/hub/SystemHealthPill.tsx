import React from 'react'
import { hubContentData } from '../../data/mockData'

export interface SystemHealthPillProps {
  readonly status?: 'ok' | 'degraded' | 'down' | 'loading'
  readonly label?: string
  readonly className?: string
}

export const SystemHealthPill: React.FC<SystemHealthPillProps> = ({
  status = 'ok',
  label,
  className = '',
}) => {
  const getBeaconClass = () => {
    switch (status) {
      case 'ok':
        return 'bg-sentiment-positive shadow-[0_0_8px_rgba(16,185,129,0.5)]'
      case 'degraded':
        return 'bg-sentiment-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]'
      case 'down':
        return 'bg-sentiment-critical shadow-[0_0_8px_rgba(244,63,94,0.5)]'
      case 'loading':
      default:
        return 'bg-text-muted animate-ping'
    }
  }

  const displayLabel =
    label ??
    (status === 'ok'
      ? hubContentData.telemetry.operational
      : status === 'degraded'
      ? hubContentData.telemetry.degraded
      : status === 'down'
      ? hubContentData.telemetry.down
      : 'Checking Telemetry...')

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        data-testid="health-beacon"
        className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${getBeaconClass()}`}
      />
      <span className="font-body-compact text-body-compact text-text-muted select-none">
        {displayLabel}
      </span>
    </div>
  )
}

export default SystemHealthPill
