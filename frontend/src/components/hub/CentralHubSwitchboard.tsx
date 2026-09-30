import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Plus, ArrowRight, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Table } from '../ui/Table'
import { CreateOrganizationModal } from './CreateOrganizationModal'

export interface HubOrganizationItem {
  readonly id: number
  readonly name: string
  readonly slug: string
  readonly role: string
  readonly agentsCount?: number
}

export interface PendingInvitationItem {
  readonly id: number | string
  readonly organizationName: string
  readonly role?: string
  readonly token?: string
  readonly inviterName?: string
  readonly invitedAt?: string
}

export interface CentralHubSwitchboardProps {
  readonly organizations: readonly HubOrganizationItem[]
  readonly invitations?: readonly PendingInvitationItem[]
  readonly onCreateNew?: () => void
  readonly onCreateWorkspace?: (data: { readonly name: string; readonly slug: string }) => Promise<void> | void
  readonly onLaunch: (org: HubOrganizationItem) => void
  readonly onAcceptInvite?: (inv: PendingInvitationItem) => void
  readonly onDeclineInvite?: (inv: PendingInvitationItem) => void
  readonly onDismissBanner?: () => void
  readonly isCreateModalOpen?: boolean
  readonly onCloseCreateModal?: () => void
  readonly isSubmittingCreate?: boolean
  readonly createError?: string | null
  readonly onClearCreateError?: () => void
  readonly apiUrl?: string
  readonly token?: string | null
  readonly className?: string
}

export const CentralHubSwitchboard: React.FC<CentralHubSwitchboardProps> = ({
  organizations,
  invitations = [],
  onCreateNew,
  onCreateWorkspace,
  onLaunch,
  onAcceptInvite,
  onDeclineInvite,
  onDismissBanner,
  isCreateModalOpen,
  onCloseCreateModal,
  isSubmittingCreate = false,
  createError = null,
  onClearCreateError,
  apiUrl,
  token,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [internalModalOpen, setInternalModalOpen] = useState(false)
  const [isBannerDismissed, setIsBannerDismissed] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const effectiveModalOpen = isCreateModalOpen !== undefined ? isCreateModalOpen : internalModalOpen

  const handleOpenModal = () => {
    setInternalModalOpen(true)
    onCreateNew?.()
  }

  const handleCloseModal = () => {
    setInternalModalOpen(false)
    onCloseCreateModal?.()
  }

  const handleSubmitModal = async (data: { readonly name: string; readonly slug: string }) => {
    if (onCreateWorkspace) {
      await onCreateWorkspace(data)
    }
    setInternalModalOpen(false)
  }

  // Derive filtered organizations directly without effect sync (rerender-derived-state-no-effect)
  const normalizedQuery = searchQuery.toLowerCase().trim()
  const filteredOrgs = useMemo(() => {
    if (!normalizedQuery) return organizations
    return organizations.filter((org) => {
      return org.name.toLowerCase().includes(normalizedQuery) || org.slug.toLowerCase().includes(normalizedQuery)
    })
  }, [organizations, normalizedQuery])

  // Keyboard navigation: Pressing "/" anywhere on the page focuses the search bar; "Enter" launches top result
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
        if (filteredOrgs.length > 0) {
          e.preventDefault()
          const safeIndex = highlightedIndex >= 0 && highlightedIndex < filteredOrgs.length ? highlightedIndex : 0
          onLaunch(filteredOrgs[safeIndex])
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
      {!isBannerDismissed && invitations.length > 0 && (
        <div
          data-testid="switchboard-pending-invites-banner"
          role="region"
          aria-label="Pending Invitations"
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
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-1.5 bg-[#16181C] p-1 px-2.5 rounded border border-[#282A33]"
              >
                <span className="font-medium text-[#F1F3F7]">{inv.organizationName}</span>
                {inv.role && (
                  <Badge variant={inv.role.toLowerCase() === 'admin' ? 'admin' : 'agent'}>
                    {inv.role}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => onAcceptInvite?.(inv)}
                  className="px-2 py-0.5 rounded bg-[#F59E0B] text-[#0F1012] font-semibold text-[10px] hover:bg-[#D97706] cursor-pointer ml-1 transition-colors"
                >
                  Accept
                </button>
                {onDeclineInvite && (
                  <button
                    type="button"
                    onClick={() => onDeclineInvite(inv)}
                    className="px-2 py-0.5 rounded bg-[#1E2026] text-[#8890A0] hover:text-[#F1F3F7] font-semibold text-[10px] hover:bg-[#282A33] cursor-pointer transition-colors"
                  >
                    Decline
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              aria-label="Dismiss banner"
              onClick={() => {
                setIsBannerDismissed(true)
                onDismissBanner?.()
              }}
              className="text-[#F59E0B]/70 hover:text-[#F59E0B] hover:bg-[#F59E0B]/10 p-1 rounded transition-colors shrink-0 cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
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
            placeholder="Search workspaces... Press / to filter"
            aria-label="Filter workspaces"
            className="w-full h-9 pl-9 pr-24 bg-[#16181C] border border-[#282A33] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] rounded text-xs text-[#F1F3F7] placeholder-[#525866] transition-colors outline-none"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1E2026] border border-[#282A33] text-[10px] text-[#8890A0] font-['JetBrains_Mono',monospace]">
              / Press / to filter
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
            onClick={handleOpenModal}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + New Workspace
          </Button>
        </div>
      </div>

      {/* 3. 40px High-Density Tabular Command Switchboard */}
      <div className="bg-[#16181C] border border-[#282A33] rounded-lg shadow-keylight overflow-hidden">
        <Table.Root>
          <Table.Header>
            <Table.Row className="bg-[#1A1C22] h-10 border-b border-[#282A33]">
              <Table.Head className="w-[8%] text-left text-xs font-semibold text-[#8890A0]">Status</Table.Head>
              <Table.Head className="w-[30%] text-left text-xs font-semibold text-[#8890A0]">Organization</Table.Head>
              <Table.Head className="w-[25%] text-left text-xs font-semibold text-[#8890A0]">Subdomain Slug</Table.Head>
              <Table.Head className="w-[15%] text-left text-xs font-semibold text-[#8890A0]">Members</Table.Head>
              <Table.Head className="w-[10%] text-left text-xs font-semibold text-[#8890A0]">Role</Table.Head>
              <Table.Head align="right" className="w-[12%] text-right text-xs font-semibold text-[#8890A0]">
                Dispatch
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredOrgs.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="h-32 text-center text-xs text-[#525866]">
                  {organizations.length === 0 ? 'No workspaces found.' : 'No workspaces matched your query.'}
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredOrgs.map((org, idx) => {
                const isHighlighted = idx === highlightedIndex
                const isAdmin = org.role?.toLowerCase() === 'admin'
                const memberCount = org.agentsCount ?? (isAdmin ? 14 : 8)

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
                    {/* Status Beacon */}
                    <Table.Cell>
                      <div className="flex items-center gap-1.5 pl-1">
                        <span data-testid="status-beacon" className="w-2 h-2 rounded-full bg-[#10B981]" />
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

                    {/* Member Count (JetBrains Mono forced Tabular Figures) */}
                    <Table.Cell>
                      <span className="font-['JetBrains_Mono',monospace] tabular-nums text-xs text-[#F1F3F7]">
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
                        className="px-2.5 py-1 rounded bg-[#1E2026] hover:bg-[#282A33] border border-[#282A33] text-xs font-semibold text-[#F1F3F7] hover:text-[#F59E0B] transition-all flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <span>Launch Workspace →</span>
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

      {/* Tactile Compound Modal with Live Kebab-Slug Generation */}
      <CreateOrganizationModal
        isOpen={effectiveModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitModal}
        isSubmitting={isSubmittingCreate}
        error={createError}
        onClearError={onClearCreateError}
        apiUrl={apiUrl}
        token={token}
      />
    </div>
  )
}

export default CentralHubSwitchboard
