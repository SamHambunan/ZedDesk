import React, { useState } from 'react'
import {
  Users,
  Plus,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Radio,
  Server,
  Layers,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '../ui/Button'
import {
  PROTOTYPE_TEAMS,
  PROTOTYPE_TRIAGE_TICKETS,
  PROTOTYPE_PENDING_INVITES,
  PROTOTYPE_SERVICES,
} from './mockPrototypeData'
import type { OverviewVariantProps } from './OverviewVariantA'

export const OverviewVariantC: React.FC<OverviewVariantProps> = ({
  organization,
  isZeroState = false,
  onNavigate,
  onInviteClick,
  onCreateTeamClick,
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [claimedIds, setClaimedIds] = useState<Set<number>>(new Set())

  const handleCopyLink = (token: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`http://localhost:5173/invitations/${token}`).catch(() => {})
    }
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const activeTickets = selectedTeamId
    ? PROTOTYPE_TRIAGE_TICKETS.filter((t) => {
        const team = PROTOTYPE_TEAMS.find((teamItem) => teamItem.id === selectedTeamId)
        return team && t.laneRecommendation === team.name
      })
    : PROTOTYPE_TRIAGE_TICKETS

  return (
    <div className="max-w-[1700px] mx-auto space-y-6 pb-20 animate-fadeIn text-[#F1F3F7]">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#282A33]">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[#F1F3F7]">
            {organization.name}
          </h1>
          <span className="px-2 py-0.5 rounded bg-[#1E2026] text-[#8890A0] text-xs font-['JetBrains_Mono',monospace]">
            {organization.slug}
          </span>
          <span className="text-xs text-[#10B981] flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            Tri-Pane Multi-Monitor Cockpit
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="amber"
            size="compact"
            onClick={onInviteClick || (() => onNavigate?.('invitations'))}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Invite Member
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => onNavigate?.('tickets')}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Full Queue (24)
          </Button>
        </div>
      </div>

      {/* Tri-Pane Multi-Monitor Cockpit (25% / 50% / 25%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Pane 1 (25% Width): Routing Lanes Switchboard */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
            <div className="p-3.5 px-4 border-b border-[#282A33] flex items-center justify-between bg-[#1A1C22]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                Routing Lanes ({PROTOTYPE_TEAMS.length})
              </h3>
              <button
                type="button"
                onClick={onCreateTeamClick || (() => onNavigate?.('teams'))}
                className="text-xs text-[#F59E0B] hover:underline font-semibold"
              >
                + New
              </button>
            </div>

            <div className="divide-y divide-[#282A33]">
              <button
                type="button"
                onClick={() => setSelectedTeamId(null)}
                className={`w-full p-3 px-4 text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                  selectedTeamId === null
                    ? 'bg-[#1E2026] text-[#F59E0B] font-semibold border-l-2 border-[#F59E0B]'
                    : 'text-[#8890A0] hover:bg-[#1E2026]/40 hover:text-[#F1F3F7]'
                }`}
              >
                <span>All Triage Queues</span>
                <span className="font-['JetBrains_Mono',monospace]">24</span>
              </button>

              {PROTOTYPE_TEAMS.map((team) => {
                const isSelected = selectedTeamId === team.id
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full p-3 px-4 text-left transition-colors cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'bg-[#1E2026] border-l-2 border-[#F59E0B]'
                        : 'hover:bg-[#1E2026]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-[#F59E0B]' : 'text-[#F1F3F7]'}`}>
                        {team.name}
                      </span>
                      <span className="text-[11px] font-['JetBrains_Mono',monospace] text-[#8890A0]">
                        {team.openTicketsCount} tickets
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#8890A0]">
                      <span className="truncate max-w-[140px]">{team.routingCategory}</span>
                      <span
                        className={`font-['JetBrains_Mono',monospace] font-bold ${
                          team.capacityStatus === 'critical'
                            ? 'text-[#F43F5E]'
                            : team.capacityStatus === 'warning'
                            ? 'text-[#F59E0B]'
                            : 'text-[#10B981]'
                        }`}
                      >
                        {team.capacityPercent}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Pane 2 (50% Width): Central Operational Triage Deck */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
            <div className="p-3.5 px-5 border-b border-[#282A33] flex items-center justify-between bg-[#1A1C22]">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#F1F3F7]">
                  Operational Triage Deck
                </h2>
                <span className="px-2 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] text-[11px] font-['JetBrains_Mono',monospace] font-bold">
                  {activeTickets.length} Items
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.('tickets')}
                className="text-xs text-[#F59E0B] hover:underline font-medium flex items-center gap-1"
              >
                <span>Full View</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {isZeroState ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#1E2026] border border-[#282A33] flex items-center justify-center mx-auto text-[#F59E0B]">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-[#F1F3F7]">
                  Guided Command Deck — 0-State
                </h3>
                <p className="text-xs text-[#8890A0] max-w-sm mx-auto">
                  Initialize your workspace teams and invite triage staff before receiving tickets.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="amber"
                    size="compact"
                    onClick={onCreateTeamClick || (() => onNavigate?.('teams'))}
                  >
                    + Create First Team
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={onInviteClick || (() => onNavigate?.('invitations'))}
                  >
                    + Invite Staff
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#282A33]">
                {activeTickets.map((t) => {
                  const isClaimed = claimedIds.has(t.id)
                  return (
                    <div
                      key={t.id}
                      className="p-4 px-5 space-y-2 hover:bg-[#1E2026]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-['JetBrains_Mono',monospace] ${
                              t.urgencyColor === 'critical'
                                ? 'bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30'
                                : t.urgencyColor === 'warning'
                                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                                : 'bg-[#282A33] text-[#8890A0]'
                            }`}
                          >
                            {t.urgency}
                          </span>
                          <span className="text-xs font-semibold text-[#F1F3F7]">
                            {t.ticketNumber}
                          </span>
                          <span className="text-[11px] text-[#8890A0]">• {t.laneRecommendation}</span>
                        </div>
                        <span className="text-[11px] text-[#525866] font-['JetBrains_Mono',monospace]">
                          {t.timeAgo}
                        </span>
                      </div>

                      <div className="text-xs text-[#F1F3F7] font-medium">{t.title}</div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-[#8890A0]">
                        <span>From: {t.customerEmail}</span>
                        {isClaimed ? (
                          <span className="text-[#10B981] font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Assigned
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            onClick={() => setClaimedIds((prev) => new Set(prev).add(t.id))}
                          >
                            Claim
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pane 3 (25% Width): Pulse, Pending Invites & Diagnostics */}
        <div className="lg:col-span-3 space-y-4">
          {/* Health Pulse */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-4 shadow-keylight space-y-3">
            <div className="flex items-center justify-between border-b border-[#282A33] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                Infrastructure
              </span>
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            </div>
            <div className="space-y-2 text-xs">
              {PROTOTYPE_SERVICES.map((s) => (
                <div key={s.name} className="flex justify-between">
                  <span className="text-[#8890A0]">{s.name}</span>
                  <span className="text-[#10B981] font-['JetBrains_Mono',monospace]">
                    {s.latency}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-4 shadow-keylight space-y-3">
            <div className="flex items-center justify-between border-b border-[#282A33] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                Pending Invites
              </span>
              <span className="font-['JetBrains_Mono',monospace] text-xs text-[#F1F3F7]">
                {PROTOTYPE_PENDING_INVITES.length}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              {PROTOTYPE_PENDING_INVITES.map((inv) => (
                <div key={inv.id} className="p-2 bg-[#1E2026] rounded border border-[#282A33] space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="truncate max-w-[130px] font-medium text-[#F1F3F7]">
                      {inv.email}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-[#C4B5FD] bg-[#8B5CF6]/20 px-1 rounded">
                      {inv.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(inv.token)}
                    className="text-[#F59E0B] text-[11px] hover:underline"
                  >
                    {copiedToken === inv.token ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Shortcuts */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-3 shadow-keylight space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onNavigate?.('members')}
              className="w-full text-left p-2 rounded hover:bg-[#1E2026] text-[#8890A0] hover:text-[#F1F3F7] flex items-center justify-between"
            >
              <span>Staff Directory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('teams')}
              className="w-full text-left p-2 rounded hover:bg-[#1E2026] text-[#8890A0] hover:text-[#F1F3F7] flex items-center justify-between"
            >
              <span>Teams &amp; Routing</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.open('/portal', '_blank')
              }}
              className="w-full text-left p-2 rounded hover:bg-[#1E2026] text-[#8890A0] hover:text-[#F1F3F7] flex items-center justify-between"
            >
              <span>Customer Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
