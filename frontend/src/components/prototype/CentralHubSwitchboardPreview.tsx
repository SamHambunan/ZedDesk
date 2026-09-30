import React, { useState, useEffect, useRef } from 'react'
import { Search, Plus, ArrowRight, Building2, Shield, Users, Check, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Table } from '../ui/Table'
import type { HubOrganizationItem } from '../hub/OrganizationCard'
import type { PendingInvitationItem } from '../hub/PendingInvitesBanner'

export interface CentralHubSwitchboardPreviewProps {
  readonly organizations: readonly HubOrganizationItem[]
  readonly invitations?: readonly PendingInvitationItem[]
  readonly onCreateNew: () => void
  readonly onLaunch: (org: HubOrganizationItem) => void
  readonly onAcceptInvite?: (inv: PendingInvitationItem) => void
  readonly onDeclineInvite?: (inv: PendingInvitationItem) => void
  readonly className?: string
}

export const CentralHubSwitchboardPreview: React.FC<CentralHubSwitchboardPreviewProps> = ({
  organizations,
  invitations = [],
  onCreateNew,
  onLaunch,
  onAcceptInvite,
  onDeclineInvite,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredOrgs = organizations.filter((org) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return org.name.toLowerCase().includes(q) || org.slug.toLowerCase().includes(q)
  })

  // Keyboard navigation: Pressing "/" focuses the search bar; "Enter" launches the top result
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable

      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Enter' && isInput && document.activeElement === searchInputRef.current) {
        if (filteredOrgs.length > 0 && highlightedIndex < filteredOrgs.length) {
          e.preventDefault()
          onLaunch(filteredOrgs[highlightedIndex])
        }
      } else if (e.key === 'ArrowDown' && document.activeElement === searchInputRef.current) {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredOrgs.length))
      } else if (e.key === 'ArrowUp' && document.activeElement === searchInputRef.current) {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + filteredOrgs.length) % Math.max(1, filteredOrgs.length))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredOrgs, highlightedIndex, onLaunch])

  return (
    <div data-testid="central-hub-switchboard" className={`space-y-6 ${className} text-[#F1F3F7]`}>
      {/* 1. Persistent Cadmium Amber Alert Banner for Pending Invitations */}
      {invitations.length > 0 && (
        <div
          data-testid="switchboard-pending-invites-banner"
          className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg p-3.5 px-5 shadow-keylight flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
            <span className="font-semibold text-[#F59E0B]">
              {invitations.length} Workspace Invitation{invitations.length > 1 ? 's' : ''} Awaiting Acceptance
            </span>
            <span className="text-[#8890A0] hidden md:inline">
              — You have been invited to join organizational workspaces.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {invitations.slice(0, 2).map((inv) => (
              <div key={inv.id} className="flex items-center gap-1.5 bg-[#16181C] p-1 px-2.5 rounded border border-[#282A33]">
                <span className="font-medium text-[#F1F3F7]">{inv.organizationName}</span>
                <span className="text-[10px] text-[#C4B5FD] uppercase font-bold bg-[#8B5CF6]/20 px-1 rounded">
                  {inv.role}
                </span>
                <button
                  type="button"
                  onClick={() => onAcceptInvite?.(inv)}
                  className="px-2 py-0.5 rounded bg-[#F59E0B] text-[#0F1012] font-semibold text-[10px] hover:bg-[#D97706] cursor-pointer ml-1"
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search input with keyboard shortcut hint */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525866]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setHighlightedIndex(0)
            }}
            placeholder="Search workspaces by name or slug..."
            className="w-full h-9 pl-9 pr-14 bg-[#16181C] border border-[#282A33] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] rounded text-xs text-[#F1F3F7] placeholder-[#525866] transition-colors outline-none"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[10px] text-[#8890A0] font-['JetBrains_Mono',monospace]">
              /
            </kbd>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#8890A0] font-['JetBrains_Mono',monospace]">
            <span>Workspaces: </span>
            <span className="text-[#F1F3F7] font-semibold">{filteredOrgs.length}</span>
          </div>
          <Button
            type="button"
            variant="amber"
            size="compact"
            onClick={onCreateNew}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + New Workspace
          </Button>
        </div>
      </div>

      {/* 3. Tenant Ledger Table */}
      <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
        <Table.Root>
          <Table.Header>
            <Table.Row className="bg-[#1A1C22] h-10 border-b border-[#282A33]">
              <Table.Head className="w-[8%] text-left text-xs font-semibold text-[#8890A0]">Status</Table.Head>
              <Table.Head className="w-[30%] text-left text-xs font-semibold text-[#8890A0]">Organization</Table.Head>
              <Table.Head className="w-[25%] text-left text-xs font-semibold text-[#8890A0]">Subdomain Slug</Table.Head>
              <Table.Head className="w-[15%] text-left text-xs font-semibold text-[#8890A0]">Members</Table.Head>
              <Table.Head className="w-[10%] text-left text-xs font-semibold text-[#8890A0]">Role</Table.Head>
              <Table.Head align="right" className="w-[12%] text-right text-xs font-semibold text-[#8890A0]">Dispatch</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredOrgs.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="h-32 text-center text-xs text-[#525866]">
                  No workspaces matched your query.
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredOrgs.map((org, idx) => {
                const isHighlighted = idx === highlightedIndex
                const isAdmin = org.role?.toLowerCase() === 'admin'
                return (
                  <Table.Row
                    key={org.id}
                    data-testid={`workspace-row-${org.slug}`}
                    onClick={() => onLaunch(org)}
                    className={`h-10 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-[#1E2026] border-l-2 border-[#F59E0B]'
                        : 'hover:bg-[#1E2026]/50'
                    }`}
                  >
                    {/* Status Dot */}
                    <Table.Cell>
                      <div className="flex items-center gap-1.5 pl-1">
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        <span className="text-[11px] text-[#8890A0] hidden sm:inline">Active</span>
                      </div>
                    </Table.Cell>

                    {/* Organization Name */}
                    <Table.Cell>
                      <div className="font-semibold text-xs text-[#F1F3F7]">{org.name}</div>
                    </Table.Cell>

                    {/* Subdomain Slug Badge */}
                    <Table.Cell>
                      <span className="px-2 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[11px] font-['JetBrains_Mono',monospace] text-[#8890A0]">
                        {org.slug}.zeddesk.app
                      </span>
                    </Table.Cell>

                    {/* Member Count (JetBrains Mono Tabular Figures) */}
                    <Table.Cell>
                      <span className="font-['JetBrains_Mono',monospace] tabular-nums text-xs text-[#F1F3F7]">
                        {org.agentsCount ?? (isAdmin ? 14 : 8)} members
                      </span>
                    </Table.Cell>

                    {/* User Role Pill */}
                    <Table.Cell>
                      {isAdmin ? (
                        <span className="px-2 py-0.5 rounded bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#C4B5FD] text-[11px] font-bold">
                          admin
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[#8890A0] text-[11px]">
                          agent
                        </span>
                      )}
                    </Table.Cell>

                    {/* Launch Action */}
                    <Table.Cell align="right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onLaunch(org)
                        }}
                        className="px-2.5 py-1 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-xs font-semibold text-[#F1F3F7] hover:text-[#F59E0B] transition-all flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <span>Launch</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </Table.Cell>
                  </Table.Row>
                )
              })
            )}
          </Table.Body>
        </Table.Root>
      </div>

      {/* Keyboard navigation helper footer */}
      <div className="flex items-center justify-between text-[11px] text-[#525866] font-['JetBrains_Mono',monospace]">
        <span>Press [/] to search workspaces • [Enter] to launch top result</span>
        <span>Row height: 40px flush density</span>
      </div>
    </div>
  )
}
