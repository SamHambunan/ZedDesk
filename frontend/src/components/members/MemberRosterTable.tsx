import React from 'react'
import { MoreVertical } from 'lucide-react'
import { Table } from '../ui/Table'
import { Badge } from '../ui/Badge'
import { membersContentData } from '../../data/mockData'
import type { Member } from './types'

export interface MemberRosterTableProps {
  readonly members: readonly Member[]
  readonly isAdmin?: boolean
  readonly isLoading?: boolean
  readonly emptyMessage?: string
  readonly onActionClick?: (member: Member) => void
  readonly className?: string
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const MemberRosterTable: React.FC<MemberRosterTableProps> = ({
  members,
  isAdmin = true,
  isLoading = false,
  emptyMessage = membersContentData.emptyMembersMessage,
  onActionClick,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div
        data-testid="members-loading"
        className={`h-40 flex items-center justify-center bg-surface-subpanel rounded border border-border-subtle text-text-muted text-body-compact ${className}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
          <span>Loading staff members...</span>
        </div>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div
        data-testid="members-empty"
        className={`h-40 flex items-center justify-center bg-surface-subpanel rounded border border-border-subtle text-text-muted text-body-compact ${className}`}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div
      data-testid="members-roster-table"
      className={`bg-surface-subpanel rounded border border-border-subtle overflow-hidden shadow-keylight flex flex-col ${className}`}
    >
      <Table.Root>
        <Table.Header>
          <Table.Row className="bg-surface-panel h-10 border-b border-border-subtle">
            <Table.Head className="w-[30%] min-w-[200px] text-label-caps font-label-caps text-text-muted uppercase">
              {membersContentData.columns.member}
            </Table.Head>
            <Table.Head className="w-[15%] text-label-caps font-label-caps text-text-muted uppercase">
              {membersContentData.columns.role}
            </Table.Head>
            <Table.Head className="w-[25%] text-label-caps font-label-caps text-text-muted uppercase">
              {membersContentData.columns.teams}
            </Table.Head>
            <Table.Head className="w-[15%] text-label-caps font-label-caps text-text-muted uppercase">
              {membersContentData.columns.joinedDate}
            </Table.Head>
            <Table.Head className="w-[10%] text-label-caps font-label-caps text-text-muted uppercase">
              {membersContentData.columns.status}
            </Table.Head>
            {isAdmin && (
              <Table.Head align="center" className="w-[50px] text-label-caps font-label-caps text-text-muted uppercase">
                {membersContentData.columns.actions}
              </Table.Head>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {members.map((member) => {
            const userName = member.user?.name || 'Unnamed Member'
            const userEmail = member.user?.email || ''
            const roleLower = (member.role || 'agent').toLowerCase()
            const isMemberAdmin = roleLower === 'admin'
            const isOnline = member.status === 'online'
            const initials = getInitials(userName)
            const joined = member.joined_date || '—'

            return (
              <Table.Row
                key={member.id}
                data-testid={`member-row-${member.id}`}
                className="h-10 border-b border-border-subtle hover:bg-surface-container-high/60 transition-colors group cursor-default"
              >
                {/* Member Info */}
                <Table.Cell className="py-1">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-border-subtle flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {member.user?.avatar_url ? (
                        <img
                          src={member.user.avatar_url}
                          alt={userName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <span className="font-mono-data text-[10px] font-semibold text-text-secondary select-none">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        data-testid={`member-name-${member.id}`}
                        className="font-label-regular text-label-regular text-text-primary truncate font-medium"
                      >
                        {userName}
                      </span>
                      {userEmail && (
                        <span
                          data-testid={`member-email-${member.id}`}
                          className="text-[10px] text-text-muted truncate block"
                        >
                          {userEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </Table.Cell>

                {/* Role Badge */}
                <Table.Cell className="py-1">
                  <Badge
                    variant={isMemberAdmin ? 'admin' : 'agent'}
                    data-testid={`member-role-${member.id}`}
                  >
                    {isMemberAdmin ? 'Admin' : 'Agent'}
                  </Badge>
                </Table.Cell>

                {/* Team Tags */}
                <Table.Cell className="py-1">
                  <div className="flex items-center gap-1 overflow-hidden flex-wrap max-h-[32px]">
                    {member.teams && member.teams.length > 0 ? (
                      member.teams.map((teamName) => (
                        <span
                          key={teamName}
                          className="px-1.5 py-0.5 rounded bg-surface-container-highest text-text-secondary font-label-regular text-[10px] whitespace-nowrap border border-border-subtle"
                        >
                          {teamName}
                        </span>
                      ))
                    ) : (
                      <span className="text-text-muted text-[11px] font-body-compact italic">
                        Unassigned
                      </span>
                    )}
                  </div>
                </Table.Cell>

                {/* Joined Date */}
                <Table.Cell
                  align="left"
                  className="py-1 font-mono-data text-mono-data text-text-muted tabular-nums align-middle"
                >
                  <span
                    data-testid={`member-joined-${member.id}`}
                    className="tabular-nums"
                  >
                    {joined}
                  </span>
                </Table.Cell>

                {/* Status Indicator */}
                <Table.Cell className="py-1">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOnline
                          ? 'bg-sentiment-positive shadow-[0_0_4px_rgba(16,185,129,0.5)]'
                          : 'bg-text-muted'
                      }`}
                    />
                    <span
                      data-testid={`member-status-${member.id}`}
                      className="font-label-regular text-[11px] text-text-secondary"
                    >
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </Table.Cell>

                {/* Actions - completely omitted when viewed as agent */}
                {isAdmin && (
                  <Table.Cell align="center" className="py-1">
                    <button
                      type="button"
                      aria-label={`Actions for ${userName}`}
                      data-testid={`member-actions-btn-${member.id}`}
                      onClick={() => onActionClick?.(member)}
                      className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-container-high transition-colors focus:outline-none"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </Table.Cell>
                )}
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
    </div>
  )
}

MemberRosterTable.displayName = 'MemberRosterTable'
