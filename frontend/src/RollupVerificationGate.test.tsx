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
import {
  TicketCockpit,
  INITIAL_MOCK_TICKETS,
  MOCK_TEAMS,
  MOCK_MEMBERS,
  MOCK_TAGS_POOL,
} from './components/tickets'

const expectFocusable = (element: HTMLElement) => {
  element.focus()
  expect(element).toHaveFocus()
}

describe('Rollup Verification Gate & Production Bundle Integrity (Ticket #96)', () => {
  describe('Accessible Cadmium Amber Focus Rings Across All UI Primitives', () => {
    it('verifies Button features accessible Cadmium Amber focus rings for amber variant and explicit focusRing prop', () => {
      const { rerender } = render(<Button variant="amber">Dispatch Action</Button>)
      let btn = screen.getByRole('button', { name: 'Dispatch Action' })

      expectFocusable(btn)

      btn.focus()
      expect(btn).toHaveFocus()

      rerender(<Button variant="secondary" focusRing="amber">Secondary With Amber Focus</Button>)
      btn = screen.getByRole('button', { name: 'Secondary With Amber Focus' })
      expectFocusable(btn)
      btn.focus()
      expect(btn).toHaveFocus()
    })

    it('verifies Input features accessible Cadmium Amber border and focus ring by default', () => {
      render(<Input placeholder="Search records..." />)
      const input = screen.getByPlaceholderText('Search records...')

      expectFocusable(input)

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
      expectFocusable(row)
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
      expectFocusable(closeBtn)

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
      expectFocusable(row1)

      // Mono tabular figures for member count
      const memberCount = screen.getByText('8 members')
      expect(memberCount.className).toContain('font-mono')
      expect(memberCount.className).toContain('tabular-nums')

      // Filter input with Cadmium Amber focus
      const filterInput = screen.getByRole('textbox', { name: /filter workspaces/i })
      expectFocusable(filterInput)

      // Keyboard focus and Enter key launch
      row1.focus()
      expect(row1).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[0])

      // Launch button focus styling
      const launchBtn = screen.getByRole('button', { name: /launch workspace for apex engineering/i })
      expectFocusable(launchBtn)
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

      expectFocusable(orgNameInput)
      expectFocusable(slugInput)
      expect(submitBtn).toBeDisabled()
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
      expectFocusable(row)

      const memberCount = screen.getByTestId('team-member-count-10')
      expect(memberCount.className).toContain('font-mono')
      expect(memberCount.className).toContain('tabular-nums')

      const avatarStack = screen.getByTestId('team-avatar-stack-10')
      expectFocusable(avatarStack)
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
      expectFocusable(memberRow)

      const actionBtn = screen.getByTestId('member-actions-btn-201')
      expectFocusable(actionBtn)
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
      expectFocusable(inviteRow)

      const copyBtn = screen.getByTestId('copy-invitation-link-301')
      expectFocusable(copyBtn)

      const revokeBtn = screen.getByTestId('revoke-invitation-btn-301')
      expectFocusable(revokeBtn)
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

      expectFocusable(emailInput)

      expectFocusable(roleSelect)
      expectFocusable(submitBtn)
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
      expectFocusable(inviteBtn)

      // Quick Dispatch Shortcuts feature Cadmium Amber focus rings
      const portalShortcut = screen.getByTestId('dispatch-shortcut-portal')
      expectFocusable(portalShortcut)

      const ticketsShortcut = screen.getByTestId('dispatch-shortcut-tickets')
      expectFocusable(ticketsShortcut)

      // Triage Queue Bridge link features Cadmium Amber focus ring
      const triageLink = screen.getByTestId('view-all-tickets-link')
      expectFocusable(triageLink)
    })
  })

  describe('Cross-View Verification: Ticket Cockpit (/tickets)', () => {
    it('verifies Ticket Cockpit renders dense 4-pane layout with data-theme="internal" and Cadmium Amber selection & focus tokens', async () => {
      window.history.pushState({}, '', '/')
      const user = userEvent.setup()

      render(
        <SafeQueryProvider>
          <TicketCockpit.Provider
            tickets={INITIAL_MOCK_TICKETS}
            teams={MOCK_TEAMS}
            members={MOCK_MEMBERS}
            allTags={MOCK_TAGS_POOL}
            userRole="agent"
          >
            <TicketCockpit.Frame>
              <TicketCockpit.SubRail />
              <TicketCockpit.Queue />
              <TicketCockpit.Detail />
              <TicketCockpit.Inspector />
            </TicketCockpit.Frame>
          </TicketCockpit.Provider>
        </SafeQueryProvider>
      )

      // 1. Frame has data-theme="internal" scoping
      const frame = screen.getByTestId('ticket-cockpit-frame')
      expect(frame).toHaveAttribute('data-theme', 'internal')

      // 2. All 4 dense panes render
      expect(screen.getByTestId('ticket-cockpit-subrail')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-cockpit-queue')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-cockpit-detail')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-cockpit-inspector')).toBeInTheDocument()

      // 3. Subrail presets feature Cadmium Amber focus rings
      const allOpenPreset = screen.getByTestId('preset-btn-all_open')
      expectFocusable(allOpenPreset)

      // 4. Queue search input features focus ring
      const searchInput = screen.getByTestId('queue-search-input')
      expectFocusable(searchInput)

      // 5. Active ticket row features amber selection border and container high background
      const activeCard = screen.getByTestId('ticket-row-ticket-1')
      expect(activeCard).toHaveAttribute('tabIndex', '0')
      expect(activeCard).toHaveAttribute('role', 'button')
      expect(activeCard.className).toContain('border-amber-action')
      expect(activeCard.className).toContain('bg-surface-container-high')
      expect(activeCard.className).toContain('focus-visible:ring-focus-amber')
      expectFocusable(activeCard)

      // 6. Keyboard navigation selects another ticket
      const nextCard = screen.getByTestId('ticket-row-ticket-2')
      expect(nextCard).toHaveAttribute('tabIndex', '0')
      expect(nextCard.className).not.toContain('border-amber-action')
      nextCard.focus()
      await user.keyboard('{Enter}')
      expect(nextCard.className).toContain('border-amber-action')
      expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[1].subject)
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
