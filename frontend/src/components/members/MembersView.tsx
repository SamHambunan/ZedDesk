import React, { useState, useMemo } from 'react'
import { Plus, Search, Filter } from 'lucide-react'
import { Button } from '../ui/Button'
import { MemberRosterTable } from './MemberRosterTable'
import { PendingInvitationsTable } from './PendingInvitationsTable'
import { InviteMemberModal } from './InviteMemberModal'
import { membersContentData } from '../../data/mockData'
import type { Member, PendingInvitation } from './types'

export interface MembersViewProps {
  readonly members: readonly Member[]
  readonly pendingInvitations: readonly PendingInvitation[]
  readonly isAdmin: boolean
  readonly isLoadingMembers?: boolean
  readonly isLoadingInvitations?: boolean
  readonly inviteError?: string | null
  readonly inviteSuccess?: string | null
  readonly onInviteSubmit?: (email: string, role: 'agent' | 'admin') => Promise<void> | void
  readonly onRevokeInvite?: (id: number) => Promise<void> | void
  readonly onCopyInviteLink?: (invitation: PendingInvitation) => void
  readonly revokingId?: number | null
  readonly copiedId?: number | null
  readonly className?: string
}

export const MembersView: React.FC<MembersViewProps> = ({
  members,
  pendingInvitations,
  isAdmin,
  isLoadingMembers = false,
  isLoadingInvitations = false,
  inviteError = null,
  inviteSuccess = null,
  onInviteSubmit,
  onRevokeInvite,
  onCopyInviteLink,
  revokingId = null,
  copiedId = null,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<'all' | 'admin' | 'agent'>('all')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  // Filtered members based on search query and role filter
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const name = (member.user?.name || '').toLowerCase()
      const email = (member.user?.email || '').toLowerCase()
      const query = searchQuery.trim().toLowerCase()

      const matchesSearch = !query || name.includes(query) || email.includes(query)

      const role = (member.role || 'agent').toLowerCase()
      const matchesRole =
        selectedRole === 'all' ||
        (selectedRole === 'admin' && role === 'admin') ||
        (selectedRole === 'agent' && role !== 'admin')

      return matchesSearch && matchesRole
    })
  }, [members, searchQuery, selectedRole])

  // Collect all existing emails for duplicate validation in modal
  const existingEmails = useMemo(() => {
    const memberEmails = members
      .map((m) => m.user?.email)
      .filter((e): e is string => Boolean(e))
    const inviteEmails = pendingInvitations.map((i) => i.email)
    return [...memberEmails, ...inviteEmails]
  }, [members, pendingInvitations])

  const handleOpenInviteModal = () => {
    setIsInviteModalOpen(true)
  }

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false)
  }

  const handleInviteSubmit = async (email: string, role: 'agent' | 'admin') => {
    if (onInviteSubmit) {
      await onInviteSubmit(email, role)
    }
  }

  return (
    <div
      data-testid="invitations-manager"
      className={`max-w-6xl mx-auto flex flex-col gap-6 pb-12 w-full ${className}`}
    >
      {/* Module Header */}
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1
            data-testid="members-view-title"
            className="font-headline-md text-headline-md text-text-primary mb-1 font-semibold"
          >
            {membersContentData.title}
          </h1>
          <p className="font-body-compact text-body-compact text-text-secondary">
            {membersContentData.subtitle}
          </p>
        </div>

        {isAdmin && (
          <Button
            type="button"
            variant="primary"
            size="compact"
            data-testid="invite-member-btn"
            onClick={handleOpenInviteModal}
            className="self-start gap-2 shadow-keylight-primary"
          >
            <Plus className="w-4 h-4" />
            <span>{membersContentData.inviteMemberBtn}</span>
          </Button>
        )}
      </header>

      {/* Filter Bar */}
      <div className="h-10 flex items-center justify-between bg-surface-panel border border-border-subtle rounded px-3 shadow-keylight">
        <div className="flex items-center gap-3 w-full max-w-md">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-text-muted absolute left-2 pointer-events-none" />
            <input
              type="text"
              data-testid="members-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={membersContentData.filterPlaceholder}
              className="w-full bg-transparent border-none text-text-primary text-xs pl-8 pr-2 focus:ring-0 font-body-compact h-full placeholder:text-text-muted focus:outline-none"
            />
          </div>

          <div className="h-4 w-px bg-border-subtle shrink-0" />

          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <select
              data-testid="members-role-filter"
              value={selectedRole}
              onChange={(e) =>
                setSelectedRole(e.target.value as 'all' | 'admin' | 'agent')
              }
              aria-label="Filter by role"
              className="bg-transparent border-none text-text-secondary hover:text-text-primary text-xs font-label-regular focus:ring-0 focus:outline-none cursor-pointer pr-4"
            >
              <option value="all" className="bg-surface-panel text-text-primary">
                {membersContentData.allRoles}
              </option>
              <option value="admin" className="bg-surface-panel text-text-primary">
                Admin
              </option>
              <option value="agent" className="bg-surface-panel text-text-primary">
                Agent
              </option>
            </select>
          </div>
        </div>

        <div
          data-testid="members-stats"
          className="font-mono-data text-mono-data text-text-muted tracking-tight tabular-nums hidden sm:flex items-center gap-1.5 select-none"
        >
          <span className="text-text-primary font-semibold">{members.length}</span>{' '}
          <span>{membersContentData.activeMembersLabel}</span>
          <span className="mx-1">•</span>
          <span className="text-sentiment-warning font-semibold">
            {pendingInvitations.length}
          </span>{' '}
          <span>{membersContentData.pendingInvitesLabel}</span>
        </div>
      </div>

      {/* Member Roster Table */}
      <MemberRosterTable
        members={filteredMembers}
        isLoading={isLoadingMembers}
      />

      {/* Pending Invitations Section (Admins only) */}
      {isAdmin && (
        <PendingInvitationsTable
          invitations={pendingInvitations}
          isLoading={isLoadingInvitations}
          revokingId={revokingId}
          copiedId={copiedId}
          onCopyLink={onCopyInviteLink}
          onRevoke={onRevokeInvite}
        />
      )}

      {/* Invite Member Modal */}
      {isAdmin && (
        <InviteMemberModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseInviteModal}
          onSubmit={handleInviteSubmit}
          existingEmails={existingEmails}
          error={inviteError}
          success={inviteSuccess}
        />
      )}
    </div>
  )
}

MembersView.displayName = 'MembersView'
