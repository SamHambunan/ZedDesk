import React from 'react'
import { LifeBuoy, History } from 'lucide-react'
import { Badge } from '../ui/Badge'

export interface CustomerPortalLayoutProps {
  subdomain?: string | null
  onOpenHistory?: () => void
  children: React.ReactNode
}

export const CustomerPortalLayout: React.FC<CustomerPortalLayoutProps> = ({
  subdomain,
  onOpenHistory,
  children,
}) => {
  const orgDisplayName = subdomain
    ? `${subdomain.charAt(0).toUpperCase() + subdomain.slice(1)}`
    : 'ZedDesk'

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary flex flex-col font-sans selection:bg-accent-indigo-glow selection:text-white">
      {/* Top Header */}
      <header className="h-16 border-b border-border-subtle bg-surface-panel/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3" data-testid="portal-org-branding">
          <div className="w-8 h-8 rounded-lg bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-accent-indigo-glow shadow-keylight">
            <LifeBuoy className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary text-body-sm tracking-tight">
              {orgDisplayName}
            </span>
            <span className="text-text-muted text-xs">•</span>
            <span className="text-text-secondary text-xs font-medium">Support Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5" data-testid="portal-status-badge">
            <Badge variant="positive" dot>
              Systems Operational
            </Badge>
          </div>

          <button
            type="button"
            data-testid="portal-find-tickets-btn"
            onClick={onOpenHistory}
            className="h-8 px-3 rounded-lg bg-surface-subpanel hover:bg-surface-container-high border border-border-prominent text-text-primary text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-keylight"
          >
            <History className="w-3.5 h-3.5 text-accent-indigo-glow" />
            <span>Find My Tickets</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl bg-surface-panel border border-border-subtle rounded-2xl p-6 sm:p-10 shadow-modal">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border-subtle/50 text-center text-xs text-text-muted">
        <div className="flex items-center justify-center gap-2">
          <span>Protected by</span>
          <span className="font-semibold text-text-secondary">ZedDesk Operational Platform</span>
        </div>
      </footer>
    </div>
  )
}
