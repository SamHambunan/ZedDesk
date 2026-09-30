import React, { useState } from 'react'
import {
  Users,
  Plus,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Server,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
} from 'lucide-react'
import { Button } from '../ui/Button'
import {
  PROTOTYPE_TEAMS,
  PROTOTYPE_TRIAGE_TICKETS,
  PROTOTYPE_PENDING_INVITES,
  PROTOTYPE_SERVICES,
} from './mockPrototypeData'
import type { OverviewVariantProps } from './OverviewVariantA'

export const OverviewVariantB: React.FC<OverviewVariantProps> = ({
  organization,
  isZeroState = false,
  onNavigate,
  onInviteClick,
  onCreateTeamClick,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'unassigned' | 'urgent'>('all')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [claimedIds, setClaimedIds] = useState<Set<number>>(new Set())

  const handleCopyLink = (token: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`http://localhost:5173/invitations/${token}`).catch(() => {})
    }
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const filteredTickets = PROTOTYPE_TRIAGE_TICKETS.filter((ticket) => {
    if (filterTab === 'unassigned') return !claimedIds.has(ticket.id)
    if (filterTab === 'urgent') return ticket.urgency === 'P0' || ticket.urgency === 'P1'
    return true
  })

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 animate-fadeIn text-[#F1F3F7]">
      {/* 1. Full-Width Unified Operational Telemetry Bar (No isolated KPI boxes) */}
      <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight divide-y md:divide-y-0 md:divide-x divide-[#282A33] grid grid-cols-1 md:grid-cols-5 text-xs">
        {/* Segment 1: Organization & Slug */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#1E2026] border border-[#3B3F4D] flex items-center justify-center text-[#F59E0B] font-bold text-xs font-['JetBrains_Mono',monospace]">
            {organization.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[#F1F3F7] truncate">{organization.name}</div>
            <div className="text-[11px] font-['JetBrains_Mono',monospace] text-[#8890A0]">
              {organization.slug}.zeddesk.app
            </div>
          </div>
        </div>

        {/* Segment 2: Active Routing Lanes */}
        <div className="p-4 flex flex-col justify-center">
          <span className="text-[11px] text-[#8890A0]">Routing Lanes</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-bold text-sm text-[#F1F3F7] font-['JetBrains_Mono',monospace]">
              3 Active
            </span>
            <span className="px-1.5 py-0.2 rounded bg-[#10B981]/15 text-[#10B981] text-[10px] font-medium">
              100% Up
            </span>
          </div>
        </div>

        {/* Segment 3: Live Queue Load */}
        <div className="p-4 flex flex-col justify-center">
          <span className="text-[11px] text-[#8890A0]">Triage Queue</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-bold text-sm text-[#F59E0B] font-['JetBrains_Mono',monospace]">
              24 Open
            </span>
            <span className="px-1.5 py-0.2 rounded bg-[#F43F5E]/15 text-[#F43F5E] text-[10px] font-medium font-['JetBrains_Mono',monospace]">
              2 P0 Critical
            </span>
          </div>
        </div>

        {/* Segment 4: Agent Concurrency & SLA */}
        <div className="p-4 flex flex-col justify-center">
          <span className="text-[11px] text-[#8890A0]">SLA Reliability</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-bold text-sm text-[#10B981] font-['JetBrains_Mono',monospace]">
              99.4%
            </span>
            <span className="text-[11px] text-[#525866] font-['JetBrains_Mono',monospace]">
              14m avg wait
            </span>
          </div>
        </div>

        {/* Segment 5: Primary Action Strip */}
        <div className="p-4 flex items-center justify-end gap-2 bg-[#1A1C22]/50">
          <Button
            type="button"
            variant="amber"
            size="compact"
            onClick={onInviteClick || (() => onNavigate?.('invitations'))}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Invite
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => onNavigate?.('tickets')}
          >
            Dispatch Desk
          </Button>
        </div>
      </div>

      {/* 2. Main 70/30 Workload Stream & Command Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 70%: Routing Matrix + Live Triage Stream */}
        <div className="lg:col-span-8 space-y-6">
          {/* Zero State Guided Command Deck */}
          {isZeroState ? (
            <div className="bg-[#16181C] border border-[#3B3F4D] rounded-lg p-6 shadow-keylight space-y-4">
              <div className="flex items-center justify-between border-b border-[#282A33] pb-3">
                <h3 className="font-semibold text-sm text-[#F59E0B]">
                  Guided Command Deck — Onboarding Pipeline
                </h3>
                <span className="text-xs font-['JetBrains_Mono',monospace] text-[#8890A0]">
                  Stage: 0/3 Ready
                </span>
              </div>
              <p className="text-xs text-[#8890A0]">
                Initialize your tenant by provisioning routing lanes, onboarding agents, and running a test ticket intake.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-[#1E2026] rounded border border-[#282A33] space-y-2">
                  <div className="text-xs font-semibold text-[#F1F3F7]">1. Create Teams</div>
                  <p className="text-[11px] text-[#8890A0]">Partition queues by function</p>
                  <Button
                    type="button"
                    variant="amber"
                    size="compact"
                    className="w-full"
                    onClick={onCreateTeamClick || (() => onNavigate?.('teams'))}
                  >
                    + Add Team
                  </Button>
                </div>
                <div className="p-3 bg-[#1E2026] rounded border border-[#282A33] space-y-2">
                  <div className="text-xs font-semibold text-[#F1F3F7]">2. Invite Agents</div>
                  <p className="text-[11px] text-[#8890A0]">Assign staff to triage lanes</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="w-full"
                    onClick={onInviteClick || (() => onNavigate?.('invitations'))}
                  >
                    + Invite Staff
                  </Button>
                </div>
                <div className="p-3 bg-[#1E2026] rounded border border-[#282A33] space-y-2">
                  <div className="text-xs font-semibold text-[#F1F3F7]">3. Test Intake</div>
                  <p className="text-[11px] text-[#8890A0]">Verify customer portal intake</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="w-full"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.open('/portal', '_blank')
                    }}
                  >
                    Launch Portal →
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Team Workload Matrix */}
              <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
                <div className="p-4 px-5 border-b border-[#282A33] flex items-center justify-between bg-[#1A1C22]">
                  <div>
                    <h2 className="text-sm font-semibold text-[#F1F3F7]">
                      Operational Routing Matrix
                    </h2>
                    <p className="text-[11px] text-[#8890A0]">
                      Team capacity distribution and active triage agents
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => onNavigate?.('teams')}
                  >
                    Manage Teams →
                  </Button>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {PROTOTYPE_TEAMS.map((team) => (
                    <div
                      key={team.id}
                      className="p-4 rounded-lg bg-[#1E2026] border border-[#282A33] hover:border-[#3B3F4D] transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm text-[#F1F3F7]">{team.name}</div>
                          <div className="text-[10px] text-[#8890A0] truncate max-w-[150px]">
                            {team.routingCategory}
                          </div>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono',monospace] font-bold ${
                            team.capacityStatus === 'critical'
                              ? 'bg-[#F43F5E]/15 text-[#F43F5E]'
                              : team.capacityStatus === 'warning'
                              ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                              : 'bg-[#10B981]/15 text-[#10B981]'
                          }`}
                        >
                          {team.capacityPercent}% LOAD
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-[#282A33] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            team.capacityStatus === 'critical'
                              ? 'bg-[#F43F5E]'
                              : team.capacityStatus === 'warning'
                              ? 'bg-[#F59E0B]'
                              : 'bg-[#10B981]'
                          }`}
                          style={{ width: `${team.capacityPercent}%` }}
                        />
                      </div>

                      {/* Metrics & Roster Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#282A33]/70 text-xs">
                        <div className="flex -space-x-1.5 items-center">
                          {team.assignedAgents.slice(0, 3).map((agent) => (
                            <span
                              key={agent.id}
                              className={`w-5 h-5 rounded-full ring-2 ring-[#1E2026] text-[9px] font-bold flex items-center justify-center font-['JetBrains_Mono',monospace] ${agent.avatarBg}`}
                            >
                              {agent.initials}
                            </span>
                          ))}
                        </div>
                        <div className="text-right font-['JetBrains_Mono',monospace]">
                          <span className="font-bold text-[#F1F3F7]">{team.openTicketsCount}</span>
                          <span className="text-[#8890A0] text-[10px]"> tickets</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Triage Deck with Filters */}
              <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
                <div className="p-4 px-5 border-b border-[#282A33] flex flex-wrap items-center justify-between gap-3 bg-[#1A1C22]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-[#F1F3F7]">
                      Live Triage Dispatch Stream
                    </h2>
                    <div className="flex items-center bg-[#0F1012] p-0.5 rounded-lg border border-[#282A33]">
                      <button
                        type="button"
                        onClick={() => setFilterTab('all')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          filterTab === 'all'
                            ? 'bg-[#1E2026] text-[#F1F3F7] font-semibold'
                            : 'text-[#8890A0] hover:text-[#F1F3F7]'
                        }`}
                      >
                        All (24)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab('unassigned')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          filterTab === 'unassigned'
                            ? 'bg-[#1E2026] text-[#F59E0B] font-semibold'
                            : 'text-[#8890A0] hover:text-[#F1F3F7]'
                        }`}
                      >
                        Unassigned (4)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab('urgent')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          filterTab === 'urgent'
                            ? 'bg-[#1E2026] text-[#F43F5E] font-semibold'
                            : 'text-[#8890A0] hover:text-[#F1F3F7]'
                        }`}
                      >
                        Urgent (2)
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate?.('tickets')}
                    className="text-xs text-[#F59E0B] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Full Ticket Deck</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-[#282A33]">
                  {filteredTickets.map((ticket) => {
                    const isClaimed = claimedIds.has(ticket.id)
                    return (
                      <div
                        key={ticket.id}
                        className="p-3.5 px-5 flex items-center justify-between gap-4 hover:bg-[#1E2026]/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-['JetBrains_Mono',monospace] ${
                              ticket.urgencyColor === 'critical'
                                ? 'bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-[#F43F5E]'
                                : ticket.urgencyColor === 'warning'
                                ? 'bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B]'
                                : 'bg-[#282A33] text-[#8890A0]'
                            }`}
                          >
                            {ticket.urgency}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#F1F3F7] truncate">
                                {ticket.title}
                              </span>
                              <span className="text-[11px] text-[#525866] font-['JetBrains_Mono',monospace]">
                                {ticket.ticketNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[#8890A0] mt-0.5">
                              <span>{ticket.customerEmail}</span>
                              <span className="text-[#525866]">•</span>
                              <span className="font-['JetBrains_Mono',monospace]">{ticket.timeAgo}</span>
                              <span className="text-[#525866]">•</span>
                              <span className="text-[#F59E0B]">{ticket.laneRecommendation}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isClaimed ? (
                            <span className="px-2.5 py-1 rounded bg-[#10B981]/15 text-[#10B981] text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Dispatched
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              onClick={() => setClaimedIds((prev) => new Set(prev).add(ticket.id))}
                            >
                              Dispatch Now
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right 30%: Command Rail (Invites, Shortcuts & Latency) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Pending Invitations Command Card */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-5 shadow-keylight space-y-4">
            <div className="flex items-center justify-between border-b border-[#282A33] pb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                Staff Invitations Ledger
              </h3>
              <span className="px-2 py-0.5 rounded bg-[#1E2026] text-[#F1F3F7] font-['JetBrains_Mono',monospace] text-xs">
                {PROTOTYPE_PENDING_INVITES.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {PROTOTYPE_PENDING_INVITES.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded bg-[#1E2026] border border-[#282A33] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#F1F3F7] truncate max-w-[180px]">
                      {inv.email}
                    </span>
                    {inv.role === 'admin' ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#C4B5FD] text-[10px] font-bold">
                        ADMIN
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#282A33] text-[#8890A0] text-[10px]">
                        AGENT
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#282A33]/70 text-[11px] text-[#8890A0]">
                    <span className="font-['JetBrains_Mono',monospace]">Expires in {inv.expiresIn}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(inv.token)}
                      className="text-[#F59E0B] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedToken === inv.token ? 'Copied Link' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="w-full"
              onClick={onInviteClick || (() => onNavigate?.('invitations'))}
            >
              + Issue Cryptographic Invite
            </Button>
          </div>

          {/* Infrastructure Health Diagnostics */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-5 shadow-keylight space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
              Infrastructure Diagnostics
            </h3>
            <div className="space-y-2 text-xs">
              {PROTOTYPE_SERVICES.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between p-2 rounded bg-[#1E2026] border border-[#282A33]"
                >
                  <span className="text-[#F1F3F7] font-medium">{s.name}</span>
                  <span className="text-[#10B981] font-['JetBrains_Mono',monospace]">
                    {s.latency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
