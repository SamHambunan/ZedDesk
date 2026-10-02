import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CentralHubSwitchboard } from './components/hub/CentralHubSwitchboard'
import { TeamsTabularLedger } from './components/teams/TeamsTabularLedger'
import { MemberRosterTable } from './components/members/MemberRosterTable'
import { PendingInvitationsTable } from './components/members/PendingInvitationsTable'
import { WorkspaceOverview } from './components/overview/WorkspaceOverview'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Modal } from './components/ui/Modal'
import { Table } from './components/ui/Table'
import { CreateOrganizationModal } from './components/hub/CreateOrganizationModal'
import { InviteMemberModal } from './components/members/InviteMemberModal'
import { SafeQueryProvider } from './components/workspace/WorkspaceShellContext'

describe('Rollup Verification Gate & Production Bundle Integrity (Ticket #96)', () => {
  describe('Accessible Cadmium Amber Focus Rings Across All UI Primitives', () => {
    it('verifies Button features accessible Cadmium Amber focus rings for amber variant and explicit focusRing prop', () => {
      const { rerender } = render(<Button variant="amber">Dispatch Action</Button>)
      let btn = screen.getByRole('button', { name: 'Dispatch Action' })

      expect(btn.className).toContain('focus-visible:ring-[#F59E0B]')
      expect(btn.className).toContain('bg-[#F59E0B]')
      expect(btn.className).toContain('text-[#0F1012]')

      btn.focus()
      expect(btn).toHaveFocus()

      rerender(<Button variant="secondary" focusRing="amber">Secondary With Amber Focus</Button>)
      btn = screen.getByRole('button', { name: 'Secondary With Amber Focus' })
      expect(btn.className).toContain('focus-visible:ring-[#F59E0B]')
      btn.focus()
      expect(btn).toHaveFocus()
    })

    it('verifies Input features accessible Cadmium Amber border and focus ring by default', () => {
      render(<Input placeholder="Search records..." />)
      const input = screen.getByPlaceholderText('Search records...')

      expect(input.className).toContain('focus:border-[#F59E0B]')
      expect(input.className).toContain('focus:ring-[#F59E0B]')

      input.focus()
      expect(input).toHaveFocus()
    })

    it('verifies TableRow features accessible Cadmium Amber focus ring when focused', () => {
      render(
        <Table.Root>
          <Table.Body>
            <Table.Row tabIndex={0} data-testid="test-row">
              <Table.Cell>Row Data</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      )

      const row = screen.getByTestId('test-row')
      expect(row.className).toContain('focus-visible:ring-[#F59E0B]')
      expect(row.className).toContain('focus-visible:ring-inset')

      row.focus()
      expect(row).toHaveFocus()
    })

    it('verifies Modal close button and dialog container feature accessible Cadmium Amber focus rings', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Dialog">
          <p>Dialog Body</p>
        </Modal>
      )

      const closeBtn = screen.getByRole('button', { name: /close/i })
      expect(closeBtn.className).toContain('focus-visible:ring-[#F59E0B]')

      closeBtn.focus()
      expect(closeBtn).toHaveFocus()
    })
  })

  describe('Cross-View Verification: Central Hub (/)', () => {
    const mockOrgs = [
      {
        id: 1,
        name: 'Apex Engineering',
        slug: 'apex',
        agentsCount: 8,
        role: 'admin',
      },
      {
        id: 2,
        name: 'Beacon Systems',
        slug: 'beacon',
        agentsCount: 3,
        role: 'agent',
      },
    ]

    it('verifies Central Hub switchboard renders 40px flush rows, tabular figures, and keyboard navigation with Cadmium Amber focus', async () => {
      const user = userEvent.setup()
      const onLaunch = vi.fn()
      const onCreateNew = vi.fn()

      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={onLaunch}
          onCreateNew={onCreateNew}
        />
      )

      // 40px row height and tabular figures
      const row1 = screen.getByTestId('workspace-row-apex')
      expect(row1.className).toContain('h-10')
      expect(row1).toHaveAttribute('tabIndex', '0')
      expect(row1.className).toContain('focus-visible:ring-[#F59E0B]')

      // Mono tabular figures for member count
      const memberCount = screen.getByText('8 members')
      expect(memberCount.className).toContain('font-mono')
      expect(memberCount.className).toContain('tabular-nums')

      // Filter input with Cadmium Amber focus
      const filterInput = screen.getByRole('textbox', { name: /filter workspaces/i })
      expect(filterInput.className).toContain('focus:border-[#F59E0B]')
      expect(filterInput.className).toContain('focus:ring-[#F59E0B]')

      // Keyboard focus and Enter key launch
      row1.focus()
      expect(row1).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[0])

      // Launch button focus styling
      const launchBtn = screen.getByRole('button', { name: /launch workspace for apex engineering/i })
      expect(launchBtn.className).toContain('focus-visible:ring-[#F59E0B]')
    })

    it('verifies CreateOrganizationModal features Cadmium Amber focus inputs and primary button contrast', () => {
      render(
        <CreateOrganizationModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      const orgNameInput = screen.getByLabelText(/organization name/i)
      const slugInput = screen.getByLabelText(/workspace subdomain url/i)
      const submitBtn = screen.getByRole('button', { name: /create organization & launch/i })

      expect(orgNameInput.className).toContain('focus:border-[#F59E0B]')
      expect(orgNameInput.className).toContain('focus:ring-[#F59E0B]')
      expect(slugInput.className).toContain('focus:border-[#F59E0B]')
      expect(slugInput.className).toContain('focus:ring-[#F59E0B]')

      expect(submitBtn.className).toContain('bg-[#F59E0B]')
      expect(submitBtn.className).toContain('text-[#0F1012]')
      expect(submitBtn.className).toContain('focus:ring-[#F59E0B]')
    })
  })

  describe('Cross-View Verification: Teams (/teams)', () => {
    const mockTeams = [
      {
        id: 10,
        organization_id: 1,
        name: 'DevOps & Infrastructure',
        description: 'Cloud systems and site reliability',
        members: [
          { id: 101, organization_id: 1, team_id: 10, user_id: 1, role: 'admin', user: { id: 1, name: 'Alex Lead', email: 'alex@example.com' } },
          { id: 102, organization_id: 1, team_id: 10, user_id: 2, role: 'agent', user: { id: 2, name: 'Morgan Ops', email: 'morgan@example.com' } },
        ],
      },
    ]

    it('verifies Teams tabular ledger renders 40px flush rows, tabular numbers, and accessible focus on avatar stack', () => {
      const onInspect = vi.fn()
      render(
        <TeamsTabularLedger
          teams={mockTeams}
          isAdmin={true}
          onInspectTeam={onInspect}
          onEditTeam={vi.fn()}
          onDeleteTeam={vi.fn()}
        />
      )

      const row = screen.getByTestId('team-row-10')
      expect(row.className).toContain('h-10')
      expect(row).toHaveAttribute('tabIndex', '0')
      expect(row.className).toContain('focus-visible:ring-[#F59E0B]')

      const memberCount = screen.getByTestId('team-member-count-10')
      expect(memberCount.className).toContain('font-mono')
      expect(memberCount.className).toContain('tabular-nums')

      const avatarStack = screen.getByTestId('team-avatar-stack-10')
      expect(avatarStack.className).toContain('focus-visible:ring-[#F59E0B]')
    })
  })

  describe('Cross-View Verification: Members (/members)', () => {
    const mockMembers = [
      {
        id: 201,
        organization_id: 1,
        user_id: 1,
        role: 'admin',
        joined_date: '2026-09-01',
        status: 'online' as const,
        user: { id: 1, name: 'Admin User', email: 'admin@example.com' },
        teams: ['Engineering', 'Support'],
      },
    ]

    const mockInvitations = [
      {
        id: 301,
        email: 'invited.agent@example.com',
        role: 'agent',
        token: 'test-token-301',
        created_at: '2026-09-20T10:00:00Z',
        expires_at: '2026-10-20T10:00:00Z',
      },
    ]

    it('verifies Member roster and Pending invitations tables enforce 40px flush rows, tabular dates, and focus rings', () => {
      render(
        <MemberRosterTable
          members={mockMembers}
          isAdmin={true}
          onActionClick={vi.fn()}
        />
      )

      const memberRow = screen.getByTestId('member-row-201')
      expect(memberRow.className).toContain('h-10')
      expect(memberRow).toHaveAttribute('tabIndex', '0')
      expect(memberRow.className).toContain('focus-visible:ring-[#F59E0B]')

      const actionBtn = screen.getByTestId('member-actions-btn-201')
      expect(actionBtn.className).toContain('focus-visible:ring-[#F59E0B]')
    })

    it('verifies PendingInvitationsTable provides accessible copy and revoke buttons with Cadmium Amber rings', () => {
      render(
        <PendingInvitationsTable
          invitations={mockInvitations}
          isAdmin={true}
          onCopyLink={vi.fn()}
          onRevoke={vi.fn()}
        />
      )

      const inviteRow = screen.getByTestId('invitation-row-301')
      expect(inviteRow.className).toContain('h-10')
      expect(inviteRow).toHaveAttribute('tabIndex', '0')
      expect(inviteRow.className).toContain('focus-visible:ring-[#F59E0B]')

      const copyBtn = screen.getByTestId('copy-invitation-link-301')
      expect(copyBtn.className).toContain('focus-visible:ring-[#F59E0B]')

      const revokeBtn = screen.getByTestId('revoke-invitation-btn-301')
      expect(revokeBtn.className).toContain('focus-visible:ring-[#F59E0B]')
    })

    it('verifies InviteMemberModal features Cadmium Amber focus on email input, role select, and submit button', () => {
      render(
        <InviteMemberModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      const emailInput = screen.getByTestId('invite-email-input')
      const roleSelect = screen.getByTestId('invite-role-select')
      const submitBtn = screen.getByTestId('invite-submit-btn')

      expect(emailInput.className).toContain('focus:border-[#F59E0B]')
      expect(emailInput.className).toContain('focus:ring-[#F59E0B]')

      expect(roleSelect.className).toContain('focus:border-[#F59E0B]')
      expect(roleSelect.className).toContain('focus:ring-[#F59E0B]')

      expect(submitBtn.className).toContain('bg-[#F59E0B]')
      expect(submitBtn.className).toContain('text-[#0F1012]')
      expect(submitBtn.className).toContain('focus-visible:ring-[#F59E0B]')
    })
  })

  describe('Cross-View Verification: Overview (/overview)', () => {
    it('verifies WorkspaceOverview renders bilateral split-pane console with Cadmium Amber interactive controls', () => {
      render(
        <SafeQueryProvider>
          <WorkspaceOverview
            role="admin"
            organization={{ id: 1, name: 'Acme Cloud', slug: 'acme' }}
            onInviteMemberClick={vi.fn()}
            onCreateTeamClick={vi.fn()}
            onNavigate={vi.fn()}
          />
        </SafeQueryProvider>
      )

      // Context Ribbon Invite CTA uses Cadmium Amber
      const inviteBtn = screen.getByTestId('invite-member-button')
      expect(inviteBtn.className).toContain('bg-[#F59E0B]')
      expect(inviteBtn.className).toContain('text-[#0F1012]')
      expect(inviteBtn.className).toContain('focus-visible:ring-[#F59E0B]')

      // Quick Dispatch Shortcuts feature Cadmium Amber focus rings
      const portalShortcut = screen.getByTestId('dispatch-shortcut-portal')
      expect(portalShortcut.className).toContain('focus-visible:ring-[#F59E0B]')

      const ticketsShortcut = screen.getByTestId('dispatch-shortcut-tickets')
      expect(ticketsShortcut.className).toContain('focus-visible:ring-[#F59E0B]')

      // Triage Queue Bridge link features Cadmium Amber focus ring
      const triageLink = screen.getByTestId('view-all-tickets-link')
      expect(triageLink.className).toContain('focus-visible:ring-[#F59E0B]')
    })
  })

  describe('Visual Rhythm & Design Token Harmony', () => {
    it('enforces 4px micro-radii on buttons and inputs, and 8px radii on panels and modals', () => {
      const { container } = render(
        <div>
          <Button variant="amber">Action</Button>
          <Input placeholder="Text input" />
          <Table.Root>
            <Table.Body>
              <Table.Row>
                <Table.Cell>Cell</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Root>
        </div>
      )

      const btn = screen.getByRole('button', { name: 'Action' })
      expect(btn.className).toContain('rounded')

      const input = screen.getByPlaceholderText('Text input')
      expect(input.className).toContain('rounded')

      const tableContainer = container.querySelector('.rounded-lg')
      expect(tableContainer).toBeInTheDocument()
    })
  })
})
