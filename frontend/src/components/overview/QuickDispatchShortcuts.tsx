import React from 'react'
import { Users, Network, Globe, Inbox, ArrowUpRight } from 'lucide-react'

export interface QuickDispatchShortcutsProps {
  readonly onNavigate?: (view: string) => void
}

export const QuickDispatchShortcuts: React.FC<QuickDispatchShortcutsProps> = ({ onNavigate }) => {
  const SHORTCUTS = [
    {
      id: 'members',
      title: 'Member Directory',
      subtitle: '/members',
      description: 'Directory & Admin Roles',
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      route: 'members',
    },
    {
      id: 'teams',
      title: 'Routing Lanes',
      subtitle: '/teams',
      description: 'Capacity & Assignments',
      icon: Network,
      color: 'text-[#F59E0B]',
      bgColor: 'bg-[#F59E0B]/10',
      route: 'teams',
    },
    {
      id: 'portal',
      title: 'Customer Portal',
      subtitle: '/portal',
      description: 'Intake Forms & Tickets',
      icon: Globe,
      color: 'text-sentiment-positive',
      bgColor: 'bg-sentiment-positive/10',
      route: 'portal',
    },
    {
      id: 'tickets',
      title: 'Triage Queue',
      subtitle: '/tickets',
      description: 'Stage 2 Ingestion Ledger',
      icon: Inbox,
      color: 'text-accent-glow',
      bgColor: 'bg-accent-glow/10',
      route: 'tickets',
    },
  ]

  return (
    <div
      data-testid="quick-dispatch-shortcuts"
      className="bg-surface-subpanel/80 border border-border-subtle rounded-xl p-5 shadow-sm space-y-4"
    >
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <h2 className="text-headline-sm font-semibold text-text-primary">
          Quick Dispatch Shortcuts
        </h2>
        <span className="text-xs font-mono-data text-text-muted">
          1-Click Jump
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`dispatch-shortcut-${item.id}`}
              onClick={() => onNavigate?.(item.route)}
              className="bg-surface-panel/60 border border-border-subtle/80 hover:border-accent-glow/50 rounded-lg p-3.5 text-left transition-all group cursor-pointer flex flex-col justify-between gap-2.5 hover:bg-surface-panel"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-7 h-7 rounded-md ${item.bgColor} ${item.color} flex items-center justify-center`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-glow transition-colors" />
              </div>

              <div>
                <div className="text-body-default font-medium text-text-primary group-hover:text-white transition-colors">
                  {item.title}
                </div>
                <div className="text-[11px] font-mono-data text-text-muted mt-0.5 truncate">
                  {item.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
