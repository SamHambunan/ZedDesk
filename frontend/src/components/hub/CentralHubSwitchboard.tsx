import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Plus, ArrowRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Table } from '../ui/Table'
import { Input } from '../ui/Input'
import { PendingInvitesBanner, type PendingInvitationItem } from './PendingInvitesBanner'

export interface HubOrganizationItem {
  readonly id: number
  readonly name: string
  readonly slug: string
  readonly role: string
  readonly agentsCount?: number
}

export interface CentralHubSwitchboardProps {
  readonly organizations: readonly HubOrganizationItem[]
  readonly invitations?: readonly PendingInvitationItem[]
  readonly onCreateNew?: () => void
  readonly onLaunch: (org: HubOrganizationItem) => void
  readonly onAcceptInvite?: (inv: PendingInvitationItem) => void
  readonly onDeclineInvite?: (inv: PendingInvitationItem) => void
  readonly className?: string
}

export const CentralHubSwitchboard: React.FC<CentralHubSwitchboardProps> = ({
  organizations,
  invitations = [],
  onCreateNew,
  onLaunch,
  onAcceptInvite,
  onDeclineInvite,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Derive filtered organizations during render (rerender-derived-state-no-effect)
  const normalizedQuery = searchQuery.toLowerCase().trim()
  const filteredOrgs = useMemo(() => {
    if (!normalizedQuery) return organizations
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(normalizedQuery) ||
        org.slug.toLowerCase().includes(normalizedQuery)
    )
  }, [organizations, normalizedQuery])

  // Global keyboard shortcut: Pressing "/" anywhere on the page focuses the search input
  // Static listener that never re-binds on query changes (client-event-listeners)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable

      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Input onKeyDown handler: Pressing Enter directly launches top filtered workspace
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredOrgs.length > 0) {
      e.preventDefault()
      onLaunch(filteredOrgs[0])
    }
  }

  return (
    <div data-testid="central-hub-switchboard" className={`space-y-6 ${className} text-text-primary`}>
      {/* 1. Persistent Cadmium Amber Alert Banner for Pending Invitations */}
      {invitations.length > 0 && (
        <div data-testid="switchboard-pending-invites-banner">
          <PendingInvitesBanner
            invitations={invitations}
            onAccept={onAcceptInvite}
            onDecline={onDeclineInvite}
          />
        </div>
      )}

      {/* 2. Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Instant Search input with modular Input primitive */}
        <div className="flex-1 max-w-md">
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search workspaces... Press / to filter"
            aria-label="Filter workspaces"
            leadingIcon={<Search className="w-4 h-4 text-text-muted" />}
            trailingBadge={
              <kbd className="px-1.5 py-0.5 rounded bg-surface-panel border border-border-subtle text-[10px] text-text-secondary font-mono">
                / Press / to filter
              </kbd>
            }
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-text-secondary font-mono">
            <span>Workspaces: </span>
            <span className="text-text-primary font-semibold">{filteredOrgs.length}</span>
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

      {/* 3. 40px High-Density Tabular Command Switchboard */}
      <div className="bg-surface-panel border border-border-subtle rounded-lg shadow-keylight overflow-hidden">
        <Table.Root>
          <Table.Header>
            <Table.Row className="bg-surface-subpanel/50 h-10 border-b border-border-subtle">
              <Table.Head className="w-[8%] text-left text-xs font-semibold text-text-secondary">Status</Table.Head>
              <Table.Head className="w-[30%] text-left text-xs font-semibold text-text-secondary">Organization</Table.Head>
              <Table.Head className="w-[25%] text-left text-xs font-semibold text-text-secondary">Subdomain Slug</Table.Head>
              <Table.Head className="w-[15%] text-left text-xs font-semibold text-text-secondary">Members</Table.Head>
              <Table.Head className="w-[10%] text-left text-xs font-semibold text-text-secondary">Role</Table.Head>
              <Table.Head align="right" className="w-[12%] text-right text-xs font-semibold text-text-secondary">
                Dispatch
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredOrgs.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="h-32 text-center text-xs text-text-muted">
                  {organizations.length === 0 ? 'No workspaces found.' : 'No workspaces matched your query.'}
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredOrgs.map((org) => {
                const isAdmin = org.role?.toLowerCase() === 'admin'
                const memberCount = org.agentsCount ?? 0

                return (
                  <Table.Row
                    key={org.id}
                    data-testid={`workspace-row-${org.slug}`}
                    onClick={() => onLaunch(org)}
                    className="h-10 cursor-pointer transition-colors hover:bg-surface-subpanel/50"
                  >
                    {/* Status Beacon */}
                    <Table.Cell>
                      <div className="flex items-center gap-1.5 pl-1">
                        <span data-testid="status-beacon" className="w-2 h-2 rounded-full bg-sentiment-positive" />
                        <span className="text-[11px] text-text-secondary hidden sm:inline">Active</span>
                      </div>
                    </Table.Cell>

                    {/* Organization Name */}
                    <Table.Cell>
                      <div className="font-semibold text-xs text-text-primary">{org.name}</div>
                    </Table.Cell>

                    {/* Subdomain Slug Badge */}
                    <Table.Cell>
                      <span className="px-2 py-0.5 rounded bg-surface-subpanel border border-border-subtle text-[11px] font-mono text-text-secondary">
                        {org.slug}.zeddesk.app
                      </span>
                    </Table.Cell>

                    {/* Member Count (JetBrains Mono forced Tabular Figures) */}
                    <Table.Cell>
                      <span className="font-mono tabular-nums text-xs text-text-primary">
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </Table.Cell>

                    {/* User Role Pill */}
                    <Table.Cell>
                      <Badge variant={isAdmin ? 'admin' : 'agent'}>
                        {org.role}
                      </Badge>
                    </Table.Cell>

                    {/* Launch Workspace Action */}
                    <Table.Cell align="right">
                      <button
                        type="button"
                        aria-label={`Launch workspace for ${org.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onLaunch(org)
                        }}
                        className="px-2.5 py-1 rounded bg-surface-subpanel hover:bg-surface-panel border border-border-subtle text-xs font-semibold text-text-primary hover:text-primary-container transition-all flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <span>Launch Workspace →</span>
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
    </div>
  )
}

export default CentralHubSwitchboard
