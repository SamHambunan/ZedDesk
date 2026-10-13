import React, { useState, useMemo, use } from 'react'
import { Plus, Search, Filter } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Toast } from '../ui/Toast'
import { MemberRosterTable } from './MemberRosterTable'
import { PendingInvitationsTable } from './PendingInvitationsTable'
import { InviteMemberModal } from './InviteMemberModal'
import { membersContentData } from '../../data/mockData'
import { WorkspaceShellContext } from '../workspace/WorkspaceShellContext'
import { getCentralHubUrl } from '../../utils/url'
import { useOrganizationPresence } from '../../hooks/useOrganizationPresence'
import type { Member, PendingInvitation } from './types'
import type { ILiveClient, PresenceMember } from '../../lib/live-client'

const EMPTY_ONLINE_MEMBERS_STATE = (
  <div
    data-testid="online-members-empty"
    className="text-center py-3 text-text-muted text-xs font-mono-data border border-dashed border-border-subtle rounded-lg"
  >
    No members currently online.
  </div>
)

export interface MembersViewProps {
  readonly members: readonly Member[]
  readonly pendingInvitations: readonly PendingInvitation[]
  readonly isAdmin?: boolean
  readonly isLoadingMembers?: boolean
  readonly isLoadingInvitations?: boolean
  readonly inviteError?: string | null
  readonly inviteSuccess?: string | null
  readonly onInviteSubmit?: (email: string, role: 'agent' | 'admin') => Promise<void> | void
  readonly onRevokeInvite?: (id: number) => Promise<void> | void
  readonly onCopyInviteLink?: (invitation: PendingInvitation) => void
  readonly onActionClick?: (member: Member) => void
  readonly revokingId?: number | null
  readonly copiedId?: number | null
  readonly onlineMembers?: readonly PresenceMember[]
  readonly liveClient?: ILiveClient
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
  onActionClick,
  revokingId = null,
  copiedId = null,
  onlineMembers,
  liveClient,
  className = '',
}) => {
  const shellContext = use(WorkspaceShellContext)
  const effectiveIsAdmin =
    isAdmin !== undefined
      ? isAdmin
      : (shellContext?.role || '').toLowerCase() === 'admin'

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<'all' | 'admin' | 'agent'>('all')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [internalCopiedId, setInternalCopiedId] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<number[]>([])

  const effectiveCopiedId = copiedId ?? internalCopiedId

  // Live organization presence tracking (Issue #151)
  const effectiveLiveClient = liveClient ?? shellContext?.liveClient
  const effectiveOnlineMembers = useOrganizationPresence(effectiveLiveClient, onlineMembers)

  const effectiveOnlineMemberIds = useMemo(() => {
    return new Set(effectiveOnlineMembers.map((m) => m.member_id))
  }, [effectiveOnlineMembers])

  const displayedInvitations = useMemo(() => {
    return pendingInvitations.filter((inv) => !optimisticRemovedIds.includes(inv.id))
  }, [pendingInvitations, optimisticRemovedIds])

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

  const displayMembers = useMemo(() => {
    if (onlineMembers === undefined && !effectiveLiveClient) {
      return filteredMembers
    }
    return filteredMembers.map((m) => ({
      ...m,
      status: ((effectiveOnlineMemberIds.has(m.id) || (m.user_id && effectiveOnlineMemberIds.has(m.user_id)))
        ? 'online'
        : 'offline') as 'online' | 'offline',
    }))
  }, [filteredMembers, onlineMembers, effectiveLiveClient, effectiveOnlineMemberIds])

  // Collect all existing emails for duplicate validation in modal
  const existingEmails = useMemo(() => {
    const memberEmails = members
      .map((m) => m.user?.email)
      .filter((e): e is string => Boolean(e))
    const inviteEmails = displayedInvitations.map((i) => i.email)
    return [...memberEmails, ...inviteEmails]
  }, [members, displayedInvitations])

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

  const handleCopyLink = (invitation: PendingInvitation) => {
    const fullUrl = `${getCentralHubUrl()}/invitations/${invitation.token}`
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fullUrl).catch(() => {})
    }
    setInternalCopiedId(invitation.id)
    setTimeout(() => {
      setInternalCopiedId((curr) => (curr === invitation.id ? null : curr))
    }, 2000)

    setToastMessage(`Invitation link copied for ${invitation.email}`)
    onCopyInviteLink?.(invitation)
  }

  const handleRevoke = async (id: number) => {
    setOptimisticRemovedIds((prev) => [...prev, id])
    try {
      if (onRevokeInvite) {
        await onRevokeInvite(id)
      }
    } catch {
      setOptimisticRemovedIds((prev) => prev.filter((item) => item !== id))
    }
  }

  return (
    <div
      data-theme="internal"
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

        {effectiveIsAdmin && (
          <Button
            type="button"
            variant="amber"
            size="compact"
            data-testid="invite-member-btn"
            onClick={handleOpenInviteModal}
            className="self-start gap-2 shadow-keylight-primary font-semibold"
          >
            <Plus className="w-4 h-4 text-on-amber-action" />
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
              className="bg-transparent border-none text-text-secondary hover:text-text-primary text-xs font-label-regular focus:ring-1 focus:ring-focus-amber rounded focus:outline-none cursor-pointer pr-4"
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
          <span className="text-text-primary font-semibold font-mono tabular-nums">{members.length}</span>{' '}
          <span>{membersContentData.activeMembersLabel}</span>
          <span className="mx-1 text-border-prominent">•</span>
          <span className="text-sentiment-warning font-semibold font-mono tabular-nums">
            {displayedInvitations.length}
          </span>{' '}
          <span>{membersContentData.pendingInvitesLabel}</span>
        </div>
      </div>

      {/* Online Subsection (Issue #151: Transient Presence, distinct from On-Duty / Workload) */}
      {effectiveOnlineMembers !== undefined && (
        <div
          data-testid="online-members-subsection"
          className="bg-surface-panel border border-border-subtle rounded-lg p-4 shadow-keylight space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sentiment-positive shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
              <h2 className="text-body-compact font-semibold text-text-primary">
                Online Members ({effectiveOnlineMembers.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono-data text-text-muted">
              Connected Presence
            </span>
          </div>
          <p className="text-[11px] font-mono-data text-text-muted">
            Connected organization members (transient presence, distinct from on-duty schedule or ticket workload).
          </p>

          {effectiveOnlineMembers.length === 0 ? (
            EMPTY_ONLINE_MEMBERS_STATE
          ) : (
            <div className="flex items-center gap-2 flex-wrap" data-testid="online-members-list">
              {effectiveOnlineMembers.map((member) => (
                <div
                  key={member.member_id}
                  data-testid={`online-member-${member.member_id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-subpanel/60 border border-border-subtle rounded-md text-xs"
                >
                  <span
                    data-testid={`online-member-name-${member.member_id}`}
                    className="text-text-primary font-medium"
                  >
                    {member.name}
                  </span>
                  <Badge
                    variant="positive"
                    data-testid={`online-member-badge-${member.member_id}`}
                  >
                    Connected
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member Roster Table */}
      <MemberRosterTable
        members={displayMembers}
        isAdmin={effectiveIsAdmin}
        isLoading={isLoadingMembers}
        onActionClick={onActionClick}
      />

      {/* Pending Invitations Section (Admins only) */}
      {effectiveIsAdmin && (
        <PendingInvitationsTable
          invitations={displayedInvitations}
          isAdmin={effectiveIsAdmin}
          isLoading={isLoadingInvitations}
          revokingId={revokingId}
          copiedId={effectiveCopiedId}
          onCopyLink={handleCopyLink}
          onRevoke={handleRevoke}
        />
      )}

      {/* Invite Member Modal */}
      {effectiveIsAdmin && (
        <InviteMemberModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseInviteModal}
          onSubmit={handleInviteSubmit}
          existingEmails={existingEmails}
          error={inviteError}
          success={inviteSuccess}
        />
      )}

      {/* Tactical Toast Notification */}
      <Toast
        open={Boolean(toastMessage)}
        onClose={() => setToastMessage(null)}
        message={toastMessage || ''}
      />
    </div>
  )
}

MembersView.displayName = 'MembersView'
