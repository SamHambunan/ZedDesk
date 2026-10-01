import React from 'react'
import { Sparkles, Network, UserPlus, Globe, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '../ui/Button'

export interface GuidedCommandDeckProps {
  readonly teamsCount: number
  readonly membersCount: number
  readonly ticketsCount?: number
  readonly onCreateTeamClick?: () => void
  readonly onInviteMemberClick?: () => void
  readonly onVerifyIntakeClick?: () => void
}

export const GuidedCommandDeck: React.FC<GuidedCommandDeckProps> = ({
  teamsCount,
  membersCount,
  ticketsCount = 0,
  onCreateTeamClick,
  onInviteMemberClick,
  onVerifyIntakeClick,
}) => {
  const step1Complete = teamsCount > 0
  const step2Complete = membersCount > 1
  const step3Complete = ticketsCount > 0

  return (
    <div
      data-testid="guided-command-deck"
      className="bg-surface-subpanel/90 border border-accent-glow/30 rounded-xl p-5 shadow-luminous-indigo/10 space-y-5 relative overflow-hidden"
    >
      {/* Background glow effect */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-accent-glow/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-glow/15 flex items-center justify-center text-accent-glow">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-headline-sm font-semibold text-text-primary">
              Guided Command Deck
            </h2>
            <p className="text-xs text-text-secondary mt-0.5 font-mono-data">
              Initialize operational infrastructure to activate live capacity monitoring.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-mono-data px-3 py-1 rounded-full bg-surface-container border border-border-prominent text-sentiment-warning">
          <span>0-State Setup Pipeline</span>
        </div>
      </div>

      {/* 3-Step Setup Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
        {/* Step 1: Create Functional Routing Lanes */}
        <div
          data-testid="guided-step-1"
          className={`rounded-lg p-4 border transition-all flex flex-col justify-between gap-4 ${
            step1Complete
              ? 'bg-sentiment-positive/5 border-sentiment-positive/30'
              : 'bg-surface-panel/80 border-border-subtle hover:border-border-prominent'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono-data text-accent-glow font-semibold tracking-wider uppercase">
                Step 01
              </span>
              {step1Complete ? (
                <CheckCircle2 className="w-4 h-4 text-sentiment-positive" />
              ) : (
                <Network className="w-4 h-4 text-text-muted" />
              )}
            </div>
            <h3 className="text-title-md font-semibold text-text-primary">
              Create Functional Routing Lanes
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Define operational teams (e.g. Tier 1 Support, Critical Incidents) to route customer inquiries.
            </p>
          </div>

          <div>
            {step1Complete ? (
              <div className="text-xs font-mono-data text-sentiment-positive flex items-center gap-1">
                <span>{teamsCount} Routing Lanes Active</span>
              </div>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="compact"
                data-testid="step-trigger-routing-lanes"
                onClick={onCreateTeamClick}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                className="w-full"
              >
                Create Functional Routing Lanes
              </Button>
            )}
          </div>
        </div>

        {/* Step 2: Onboard Dispatch Agents */}
        <div
          data-testid="guided-step-2"
          className={`rounded-lg p-4 border transition-all flex flex-col justify-between gap-4 ${
            step2Complete
              ? 'bg-sentiment-positive/5 border-sentiment-positive/30'
              : 'bg-surface-panel/80 border-border-subtle hover:border-border-prominent'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono-data text-accent-glow font-semibold tracking-wider uppercase">
                Step 02
              </span>
              {step2Complete ? (
                <CheckCircle2 className="w-4 h-4 text-sentiment-positive" />
              ) : (
                <UserPlus className="w-4 h-4 text-text-muted" />
              )}
            </div>
            <h3 className="text-title-md font-semibold text-text-primary">
              Onboard Dispatch Agents
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Invite support agents and administrators to staff your capacity lanes and handle queues.
            </p>
          </div>

          <div>
            {step2Complete ? (
              <div className="text-xs font-mono-data text-sentiment-positive flex items-center gap-1">
                <span>{membersCount} Dispatch Agents Onboarded</span>
              </div>
            ) : (
              <Button
                type="button"
                variant="amber"
                size="compact"
                data-testid="step-trigger-dispatch-agents"
                onClick={onInviteMemberClick}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                className="w-full"
              >
                Onboard Dispatch Agents
              </Button>
            )}
          </div>
        </div>

        {/* Step 3: Verify Customer Intake Ingestion */}
        <div
          data-testid="guided-step-3"
          className={`rounded-lg p-4 border transition-all flex flex-col justify-between gap-4 ${
            step3Complete
              ? 'bg-sentiment-positive/5 border-sentiment-positive/30'
              : 'bg-surface-panel/80 border-border-subtle hover:border-border-prominent'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono-data text-accent-glow font-semibold tracking-wider uppercase">
                Step 03
              </span>
              {step3Complete ? (
                <CheckCircle2 className="w-4 h-4 text-sentiment-positive" />
              ) : (
                <Globe className="w-4 h-4 text-text-muted" />
              )}
            </div>
            <h3 className="text-title-md font-semibold text-text-primary">
              Verify Customer Intake Ingestion
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Inspect the tenant Customer Portal to confirm customer inquiries flow into Stage 2 triage.
            </p>
          </div>

          <div>
            {step3Complete ? (
              <div className="text-xs font-mono-data text-sentiment-positive flex items-center gap-1">
                <span>{ticketsCount} Intake Inquiries Active</span>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                data-testid="step-trigger-customer-intake"
                onClick={onVerifyIntakeClick}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                className="w-full"
              >
                Verify Customer Intake Ingestion
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
