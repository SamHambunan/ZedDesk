import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Sliders, Layers, LayoutDashboard, Users2, Building2 } from 'lucide-react'

export type OverviewVariantKey = 'A' | 'B' | 'C'

export interface VariantMeta {
  key: OverviewVariantKey
  name: string
  description: string
  split: string
}

export const OVERVIEW_VARIANTS: readonly VariantMeta[] = [
  {
    key: 'A',
    name: 'Split-Pane Console',
    description: '65% Operations Ledger + 35% Action & Pulse',
    split: '65 / 35 Split',
  },
  {
    key: 'B',
    name: 'Unified Command Stream',
    description: 'Full-width Telemetry Bar + 70/30 Workload Matrix',
    split: 'Full HUD + 70/30',
  },
  {
    key: 'C',
    name: 'Tri-Pane Dispatch Matrix',
    description: '25% Routing + 50% Live Triage + 25% Pulse & Admin',
    split: '25 / 50 / 25 Cockpit',
  },
]

export interface PrototypeSwitcherProps {
  readonly currentVariant: OverviewVariantKey
  readonly onVariantChange: (variant: OverviewVariantKey) => void
  readonly isZeroState: boolean
  readonly onToggleZeroState: () => void
  readonly activeSurface?: 'overview' | 'teams' | 'hub'
  readonly onSurfaceChange?: (surface: 'overview' | 'teams' | 'hub') => void
  readonly className?: string
}

export const PrototypeSwitcher: React.FC<PrototypeSwitcherProps> = ({
  currentVariant,
  onVariantChange,
  isZeroState,
  onToggleZeroState,
  activeSurface = 'overview',
  onSurfaceChange,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const currentIndex = OVERVIEW_VARIANTS.findIndex((v) => v.key === currentVariant)
  const activeMeta = OVERVIEW_VARIANTS[currentIndex] || OVERVIEW_VARIANTS[0]

  const cyclePrev = () => {
    const nextIdx = (currentIndex - 1 + OVERVIEW_VARIANTS.length) % OVERVIEW_VARIANTS.length
    onVariantChange(OVERVIEW_VARIANTS[nextIdx].key)
  }

  const cycleNext = () => {
    const nextIdx = (currentIndex + 1) % OVERVIEW_VARIANTS.length
    onVariantChange(OVERVIEW_VARIANTS[nextIdx].key)
  }

  // Keyboard navigation: ArrowLeft and ArrowRight to cycle variants
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or textareas
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        cyclePrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        cycleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex])

  return (
    <div
      role="region"
      aria-label="UI Prototype Switcher"
      data-testid="prototype-switcher"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 select-none ${className}`}
    >
      <div className="bg-[#16181C]/95 backdrop-blur-md border border-[#3B3F4D] text-[#F1F3F7] shadow-[0_20px_35px_-5px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] rounded-xl p-2 px-3 flex items-center gap-3">
        {/* Prototype Identity Pill */}
        <div className="flex items-center gap-2 pr-2 border-r border-[#282A33]">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
          <span className="text-[11px] font-bold tracking-wider text-[#F59E0B] uppercase font-['JetBrains_Mono',monospace]">
            PROTOTYPE
          </span>
        </div>

        {/* Variant Cycle Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={cyclePrev}
            aria-label="Previous variant"
            className="w-7 h-7 rounded bg-[#1E2026] hover:bg-[#282A33] active:scale-95 border border-[#282A33] flex items-center justify-center text-[#8890A0] hover:text-[#F1F3F7] transition-all cursor-pointer"
            title="Previous layout (← key)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Quick Variant Switcher Buttons */}
          <div className="flex items-center gap-1 bg-[#0F1012] p-0.5 rounded-lg border border-[#282A33]">
            {OVERVIEW_VARIANTS.map((v) => {
              const isSelected = v.key === currentVariant
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => onVariantChange(v.key)}
                  data-testid={`variant-btn-${v.key}`}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#F59E0B] text-[#0F1012] shadow-sm'
                      : 'text-[#8890A0] hover:text-[#F1F3F7] hover:bg-[#1E2026]'
                  }`}
                >
                  <span className="font-['JetBrains_Mono',monospace]">V{v.key}</span>
                  <span className="hidden sm:inline text-[11px] font-normal opacity-90">{v.name}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={cycleNext}
            aria-label="Next variant"
            className="w-7 h-7 rounded bg-[#1E2026] hover:bg-[#282A33] active:scale-95 border border-[#282A33] flex items-center justify-center text-[#8890A0] hover:text-[#F1F3F7] transition-all cursor-pointer"
            title="Next layout (→ key)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zero-State Simulation Toggle (Directive 2) */}
        <div className="pl-2 border-l border-[#282A33] flex items-center">
          <button
            type="button"
            onClick={onToggleZeroState}
            data-testid="toggle-zero-state-btn"
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
              isZeroState
                ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#C4B5FD]'
                : 'bg-[#1E2026] border-[#282A33] text-[#8890A0] hover:text-[#F1F3F7]'
            }`}
            title="Toggle between populated operational data and 0-State Guided Command Deck"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isZeroState ? 'bg-[#8B5CF6]' : 'bg-[#10B981]'}`}
            />
            <span>{isZeroState ? '0-State Deck' : 'Live Ops'}</span>
          </button>
        </div>

        {/* Keyboard Hint */}
        <div className="hidden md:flex items-center text-[10px] text-[#525866] font-['JetBrains_Mono',monospace] pl-1">
          <span>← / →</span>
        </div>
      </div>
    </div>
  )
}
