import React from 'react'
import { Sparkles, HelpCircle } from 'lucide-react'
import { SystemHealthPill } from './SystemHealthPill'
import { hubContentData } from '../../data/mockData'

export interface CentralHubHeaderProps {
  readonly healthStatus?: 'ok' | 'degraded' | 'down' | 'loading'
  readonly healthLabel?: string
  readonly onHelpClick?: () => void
  readonly className?: string
}

export const CentralHubHeader: React.FC<CentralHubHeaderProps> = ({
  healthStatus = 'ok',
  healthLabel,
  onHelpClick,
  className = '',
}) => {
  return (
    <header
      className={`bg-surface-panel border-b border-border-subtle h-header-height flex items-center justify-between px-margin-mobile md:px-margin-desktop shrink-0 relative z-20 ${className}`}
    >
      {/* Brand & AI Indicator */}
      <div className="flex items-center gap-3">
        <span className="font-headline-md text-headline-md text-text-primary tracking-tight font-semibold">
          {hubContentData.brand.name}
        </span>
        <div className="bg-primary-container/20 border border-primary-container/40 rounded-full px-2 py-0.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-accent-glow" />
          <span className="font-label-caps text-label-caps text-accent-glow font-medium">
            {hubContentData.brand.badge}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4 md:gap-6">
        <SystemHealthPill status={healthStatus} label={healthLabel} />

        <div className="hidden sm:block w-px h-4 bg-border-subtle" />

        <a
          href="#docs"
          onClick={(e) => e.preventDefault()}
          className="hidden sm:inline-block font-body-default text-body-default text-text-secondary hover:text-text-primary transition-colors"
        >
          {hubContentData.nav.docs}
        </a>

        <button
          type="button"
          onClick={onHelpClick}
          className="font-body-default text-body-default text-text-primary border border-border-prominent bg-surface-subpanel px-3 py-1.5 rounded shadow-keylight hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-text-muted" />
          <span>{hubContentData.nav.help}</span>
        </button>
      </div>
    </header>
  )
}

export default CentralHubHeader
