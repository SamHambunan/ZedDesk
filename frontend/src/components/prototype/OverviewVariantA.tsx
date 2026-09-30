import React, { useState } from 'react'
import {
  Users,
  Plus,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  XCircle,
  Activity,
  Layers,
  ShieldCheck,
  Server,
  Zap,
  Radio,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import {
  PROTOTYPE_TEAMS,
  PROTOTYPE_TRIAGE_TICKETS,
  PROTOTYPE_PENDING_INVITES,
  PROTOTYPE_SERVICES,
  type PrototypeTeamCapacity,
  type PrototypeTriageTicket,
  type PrototypePendingInvite,
} from './mockPrototypeData'

export interface OverviewVariantProps {
  readonly organization: {
    readonly id?: number
    readonly name: string
    readonly slug: string
  }
  readonly isZeroState?: boolean
  readonly onNavigate?: (route: string) => void
  readonly onInviteClick?: () => void
  readonly onCreateTeamClick?: () => void
}

export const OverviewVariantA: React.FC<OverviewVariantProps> = ({
  organization,
  isZeroState = false,
  onNavigate,
  onInviteClick,
  onCreateTeamClick,
}) => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [claimedTicketIds, setClaimedTicketIds] = useState<Set<number>>(new Set())
  const [revokedInviteIds, setRevokedInviteIds] = useState<Set<number>>(new Set())

  const handleCopyLink = (token: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`http://localhost:5173/invitations/${token}`).catch(() => {})
    }
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const handleClaimTicket = (ticketId: number) => {
    setClaimedTicketIds((prev) => new Set(prev).add(ticketId))
  }

  const handleRevokeInvite = (inviteId: number) => {
    setRevokedInviteIds((prev) => new Set(prev).add(inviteId))
  }

  const activeInvites = PROTOTYPE_PENDING_INVITES.filter((inv) => !revokedInviteIds.has(inv.id))

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 animate-fadeIn text-[#F1F3F7]">
      {/* 1. Context Ribbon / Hero HUD */}
      <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-4 px-6 shadow-keylight flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded bg-[#1E2026] border border-[#3B3F4D] flex items-center justify-center text-[#F59E0B] font-bold text-sm font-['JetBrains_Mono',monospace]">
            {organization.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-base font-semibold text-[#F1F3F7] tracking-tight">
                {organization.name} Operations Cockpit
              </h1>
              <span className="px-2 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[11px] font-['JetBrains_Mono',monospace] text-[#8890A0]">
                {organization.slug}.zeddesk.app
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-[#8890A0]">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
              </span>
              <span>All 3 Ingestion Lanes Operational</span>
              <span className="text-[#525866]">•</span>
              <span className="font-['JetBrains_Mono',monospace] tabular-nums">Sync nominal (0.2s)</span>
            </div>
          </div>
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
            Triage Desk
          </Button>
        </div>
      </div>

      {/* 2. Bilateral Split-Pane Layout (65% Operations Ledger / 35% Action & Pulse) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= LEFT 65%: OPERATIONS LEDGER ================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* Zero-State: Guided Command Deck (shown if 0 teams or simulated) */}
          {isZeroState ? (
            <div className="bg-[#16181C] border border-[#3B3F4D] rounded-lg p-6 shadow-keylight space-y-6">
              <div className="flex items-start justify-between border-b border-[#282A33] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B] text-xs font-semibold">
                      Guided Command Deck
                    </span>
                    <span className="text-xs text-[#8890A0] font-['JetBrains_Mono',monospace]">
                      Status: 0/3 Configured
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-[#F1F3F7] mt-2">
                    Initialize Workspace Routing &amp; Agent Infrastructure
                  </h2>
                  <p className="text-xs text-[#8890A0] mt-1">
                    Your tenant is provisioned. Complete these three mission-critical steps to begin ticket ingestion.
                  </p>
                </div>
              </div>

              {/* Step Checklist */}
              <div className="space-y-3">
                {/* Step 1 */}
                <div className="p-4 rounded-lg bg-[#1E2026] border border-[#282A33] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-[#282A33] text-[#F59E0B] font-['JetBrains_Mono',monospace] font-bold text-xs flex items-center justify-center">
                      1
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F1F3F7]">
                        Create Functional Routing Lanes
                      </h3>
                      <p className="text-xs text-[#8890A0]">
                        Define support teams (e.g. Tier-1, Billing, Escalations) to receive ticket queues.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="amber"
                    size="compact"
                    onClick={onCreateTeamClick || (() => onNavigate?.('teams'))}
                  >
                    + Create Team
                  </Button>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-lg bg-[#1E2026] border border-[#282A33] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-[#282A33] text-[#8890A0] font-['JetBrains_Mono',monospace] font-bold text-xs flex items-center justify-center">
                      2
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F1F3F7]">
                        Onboard Dispatch Agents
                      </h3>
                      <p className="text-xs text-[#8890A0]">
                        Issue cryptographic invitations for Tier-1 triage staff and administrators.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={onInviteClick || (() => onNavigate?.('invitations'))}
                  >
                    + Invite Staff
                  </Button>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-lg bg-[#1E2026] border border-[#282A33] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-[#282A33] text-[#8890A0] font-['JetBrains_Mono',monospace] font-bold text-xs flex items-center justify-center">
                      3
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F1F3F7]">
                        Verify Customer Intake Ingestion
                      </h3>
                      <p className="text-xs text-[#8890A0]">
                        Submit a test ticket through your tenant’s public customer intake portal.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.open('/portal', '_blank')
                      }
                    }}
                    rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                  >
                    Launch Portal
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Live Operations: Team Capacity & Routing Lanes */}
              <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
                <div className="p-4 px-5 border-b border-[#282A33] flex items-center justify-between bg-[#1A1C22]">
                  <div>
                    <h2 className="text-sm font-semibold text-[#F1F3F7] tracking-tight">
                      Team Capacity &amp; Routing Lanes
                    </h2>
                    <p className="text-[11px] text-[#8890A0]">
                      Real-time queue load and agent concurrency allocation
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[11px] font-['JetBrains_Mono',monospace] text-[#8890A0]">
                      3 Lanes Active
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('teams')}
                      className="text-xs text-[#F59E0B] hover:underline font-medium cursor-pointer"
                    >
                      Manage Lanes →
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[#282A33]">
                  {PROTOTYPE_TEAMS.map((team) => (
                    <div
                      key={team.id}
                      className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#1E2026]/50 transition-colors"
                    >
                      {/* Left: Team Name, Description & Agent Stack */}
                      <div className="space-y-1.5 md:w-[45%]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#F1F3F7]">{team.name}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#1E2026] text-[#8890A0] border border-[#282A33]">
                            {team.routingCategory}
                          </span>
                        </div>

                        {/* Overlapping Agent Avatar Stack */}
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex -space-x-1.5 overflow-hidden items-center">
                            {team.assignedAgents.map((agent) => (
                              <div
                                key={agent.id}
                                title={`${agent.name} (${agent.role})`}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-[#16181C] text-[10px] font-bold font-['JetBrains_Mono',monospace] ${agent.avatarBg}`}
                              >
                                {agent.initials}
                              </div>
                            ))}
                            {team.overflowCount > 0 && (
                              <div className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-[#16181C] bg-[#282A33] text-[#8890A0] text-[10px] font-bold font-['JetBrains_Mono',monospace]">
                                +{team.overflowCount}
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-[#525866] font-['JetBrains_Mono',monospace]">
                            {team.assignedAgents.length + team.overflowCount} agents assigned
                          </span>
                        </div>
                      </div>

                      {/* Right: Capacity Bar, Ticket Count & SLA */}
                      <div className="flex items-center gap-6 md:w-[50%] justify-between md:justify-end">
                        {/* Visual Capacity Bar */}
                        <div className="space-y-1 w-36">
                          <div className="flex justify-between text-[11px] font-['JetBrains_Mono',monospace]">
                            <span className="text-[#8890A0]">Capacity</span>
                            <span
                              className={`font-semibold ${
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
                          <div className="w-full h-1.5 bg-[#282A33] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                team.capacityStatus === 'critical'
                                  ? 'bg-[#F43F5E]'
                                  : team.capacityStatus === 'warning'
                                  ? 'bg-[#F59E0B]'
                                  : 'bg-[#10B981]'
                              }`}
                              style={{ width: `${team.capacityPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Open Tickets Count */}
                        <div className="text-right">
                          <div className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-[#F1F3F7]">
                            {team.openTicketsCount}
                          </div>
                          <div className="text-[10px] text-[#8890A0]">open queue</div>
                        </div>

                        {/* SLA nominal status */}
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-[#10B981]">
                            {team.slaNominalPercent}%
                          </div>
                          <div className="text-[10px] text-[#8890A0]">SLA nominal</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 2 Triage Queue Bridge */}
              <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
                <div className="p-4 px-5 border-b border-[#282A33] flex items-center justify-between bg-[#1A1C22]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-[#F1F3F7] tracking-tight">
                      Stage 2 Triage Queue Bridge
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B] text-[11px] font-['JetBrains_Mono',monospace] font-semibold">
                      4 Awaiting Triage
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('tickets')}
                    className="text-xs text-[#F59E0B] hover:underline font-medium cursor-pointer flex items-center gap-1"
                  >
                    <span>Open Live Queue (24 tickets)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Queue Summary Ribbon */}
                <div className="grid grid-cols-3 border-b border-[#282A33] bg-[#141518] text-center divide-x divide-[#282A33] py-2.5">
                  <div>
                    <span className="text-[11px] text-[#8890A0]">Unassigned Intake</span>
                    <p className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-[#F59E0B]">
                      4 Tickets
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#8890A0]">High / Critical Urgency</span>
                    <p className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-[#F43F5E]">
                      2 P0/P1
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#8890A0]">Average Ingestion Wait</span>
                    <p className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-[#10B981]">
                      14m 20s
                    </p>
                  </div>
                </div>

                {/* Live Triage Tickets Preview */}
                <div className="divide-y divide-[#282A33]">
                  {PROTOTYPE_TRIAGE_TICKETS.map((ticket) => {
                    const isClaimed = claimedTicketIds.has(ticket.id)
                    return (
                      <div
                        key={ticket.id}
                        className="p-3.5 px-5 flex items-center justify-between gap-4 hover:bg-[#1E2026]/50 transition-colors"
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
                            <span className="px-2 py-1 rounded bg-[#10B981]/15 text-[#10B981] text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Claimed</span>
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              onClick={() => handleClaimTicket(ticket.id)}
                            >
                              Claim &amp; Route
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

        {/* ================= RIGHT 35%: ACTION & PULSE ================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* Tenant Health Pulse Card */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-5 shadow-keylight space-y-4">
            <div className="flex items-center justify-between border-b border-[#282A33] pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#10B981] animate-pulse" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                  Tenant Health Pulse
                </h3>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold">
                100% HEALTHY
              </span>
            </div>

            <div className="space-y-3">
              {PROTOTYPE_SERVICES.map((srv) => (
                <div
                  key={srv.name}
                  className="flex items-center justify-between p-2 rounded bg-[#1E2026] border border-[#282A33] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    <span className="font-medium text-[#F1F3F7]">{srv.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-['JetBrains_Mono',monospace]">
                    <span className="text-[#10B981] text-[11px]">{srv.status}</span>
                    <span className="text-[#525866]">({srv.latency})</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Micro heartbeat sparkline graphic */}
            <div className="pt-2 border-t border-[#282A33] flex items-center justify-between text-[11px] text-[#525866]">
              <span>Ingestion heartbeat: 60s window</span>
              <span className="text-[#10B981] font-['JetBrains_Mono',monospace]">0 packet loss</span>
            </div>
          </div>

          {/* Pending Invitations Management Card */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-5 shadow-keylight space-y-4">
            <div className="flex items-center justify-between border-b border-[#282A33] pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#F59E0B]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
                  Pending Invites
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#1E2026] text-[#F1F3F7] font-['JetBrains_Mono',monospace] text-xs">
                {activeInvites.length}
              </span>
            </div>

            {activeInvites.length === 0 ? (
              <p className="text-xs text-[#525866] py-3 text-center">No pending invitations.</p>
            ) : (
              <div className="space-y-2.5">
                {activeInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded bg-[#1E2026] border border-[#282A33] space-y-2 text-xs"
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
                    <div className="flex items-center justify-between pt-1 border-t border-[#282A33]/60 text-[11px] text-[#8890A0]">
                      <span className="font-['JetBrains_Mono',monospace]">Expires in {inv.expiresIn}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv.token)}
                          className="hover:text-[#F59E0B] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {copiedToken === inv.token ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <Check className="w-3 h-3" /> Copied
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Copy className="w-3 h-3" /> Copy
                            </span>
                          )}
                        </button>
                        <span className="text-[#282A33]">|</span>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-[#F43F5E] hover:underline cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={onInviteClick || (() => onNavigate?.('invitations'))}
              className="w-full"
            >
              + Issue New Invitation
            </Button>
          </div>

          {/* Quick Dispatch Shortcuts */}
          <div className="bg-[#16181C] border border-[#282A33] rounded-lg p-5 shadow-keylight space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8890A0] font-['JetBrains_Mono',monospace]">
              Quick Dispatch Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigate?.('members')}
                className="p-3 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-left transition-colors cursor-pointer group"
              >
                <div className="text-xs font-semibold text-[#F1F3F7] group-hover:text-[#F59E0B] transition-colors">
                  Member Directory
                </div>
                <div className="text-[10px] text-[#8890A0] mt-0.5">Staff &amp; RBAC</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.('teams')}
                className="p-3 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-left transition-colors cursor-pointer group"
              >
                <div className="text-xs font-semibold text-[#F1F3F7] group-hover:text-[#F59E0B] transition-colors">
                  Routing Lanes
                </div>
                <div className="text-[10px] text-[#8890A0] mt-0.5">Teams &amp; Queues</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.open('/portal', '_blank')
                  }
                }}
                className="p-3 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-left transition-colors cursor-pointer group"
              >
                <div className="text-xs font-semibold text-[#F1F3F7] group-hover:text-[#F59E0B] transition-colors flex items-center justify-between">
                  <span>Customer Portal</span>
                  <ExternalLink className="w-3 h-3 text-[#525866]" />
                </div>
                <div className="text-[10px] text-[#8890A0] mt-0.5">Intake testing</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.('tickets')}
                className="p-3 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-left transition-colors cursor-pointer group"
              >
                <div className="text-xs font-semibold text-[#F1F3F7] group-hover:text-[#F59E0B] transition-colors">
                  Live Ticket Queue
                </div>
                <div className="text-[10px] text-[#8890A0] mt-0.5 font-['JetBrains_Mono',monospace]">
                  24 Open
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
