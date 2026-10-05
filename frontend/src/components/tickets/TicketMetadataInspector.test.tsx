import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TicketCockpit } from './TicketCockpit'
import { INITIAL_MOCK_TICKETS, MOCK_TEAMS, MOCK_MEMBERS, MOCK_TAGS_POOL } from './mockData'

describe('TicketCockpit.Inspector & TicketMetadataInspector (Issue #105)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consumes actions and state via React 19 use(TicketCockpitContext) without prop drilling', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        userRole="agent"
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Inspector container renders
    expect(screen.getByTestId('ticket-cockpit-inspector')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-metadata-inspector')).toBeInTheDocument()

    // Attributes header with role badge
    expect(screen.getByText('Ticket Attributes')).toBeInTheDocument()
    expect(screen.getByText('agent')).toBeInTheDocument()
  })

  it('renders Customer Profile Card with identity, email, company, tier, and inquiry history count', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const customer = INITIAL_MOCK_TICKETS[0].customer!
    expect(screen.getByTestId('customer-profile-card')).toBeInTheDocument()
    expect(screen.getByTestId('customer-name')).toHaveTextContent(customer.name)
    expect(screen.getByTestId('customer-email')).toHaveTextContent(customer.email)
    expect(screen.getByTestId('customer-company')).toHaveTextContent(customer.company!)
    expect(screen.getByText(customer.tier!)).toBeInTheDocument()
    expect(screen.getByTestId('customer-inquiry-count')).toHaveTextContent(`${customer.total_inquiries} tickets`)
  })

  it('renders 1-click Claim Ticket CTA for unassigned ticket and transitions status new -> open', async () => {
    const user = userEvent.setup()
    const onClaimSpy = vi.fn()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        currentUserId={2}
        onClaimTicket={onClaimSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    // Ticket 1 is unassigned to member and has status 'new'
    const claimBtn = screen.getByTestId('claim-ticket-btn')
    expect(claimBtn).toBeInTheDocument()
    expect(screen.getByText('Unassigned Ticket')).toBeInTheDocument()

    await user.click(claimBtn)

    expect(onClaimSpy).toHaveBeenCalledWith('ticket-1')

    // Status select updates to 'open'
    const statusSelect = screen.getByTestId('inspector-status-select') as HTMLSelectElement
    expect(statusSelect.value).toBe('open')

    // Member select updates to currentUserId (2)
    const memberSelect = screen.getByTestId('inspector-member-select') as HTMLSelectElement
    expect(memberSelect.value).toBe('2')

    // Claim CTA should now disappear because ticket is assigned
    expect(screen.queryByTestId('claim-ticket-btn')).not.toBeInTheDocument()
  })

  it('does not render Claim Ticket CTA when ticket is already assigned to a member', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        initialTicketNumber={1002} // Ticket 2 is assigned to member 2
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    expect(screen.queryByTestId('claim-ticket-btn')).not.toBeInTheDocument()
  })

  it('cascades team selection by filtering member dropdown options to members of that team derived during render', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const teamSelect = screen.getByTestId('inspector-team-select') as HTMLSelectElement
    const memberSelect = screen.getByTestId('inspector-member-select') as HTMLSelectElement

    // Initial state: Ticket 1 has no team assigned -> all members available in dropdown
    // MOCK_MEMBERS has 5 members
    const initialOptions = Array.from(memberSelect.options).map((opt) => opt.text)
    expect(initialOptions).toContain('Sarah Chen (agent)')
    expect(initialOptions).toContain('Marcus Brody (agent)')
    expect(initialOptions).toContain('Alex Rivera (agent)')

    // Select Team 2 (Billing Support, memberIds: [1, 4])
    await user.selectOptions(teamSelect, '2')

    // Immediately in render: options should be filtered to members of Team 2 (Acme Admin, Marcus Brody)
    const filteredOptions = Array.from(memberSelect.options).map((opt) => opt.text)
    expect(filteredOptions).toContain('(Unassigned)')
    expect(filteredOptions).toContain('Acme Admin (admin)')
    expect(filteredOptions).toContain('Marcus Brody (agent)')
    // Sarah Chen (in Team 1) and Alex Rivera (in Team 3) should NOT be present
    expect(filteredOptions).not.toContain('Sarah Chen (agent)')
    expect(filteredOptions).not.toContain('Alex Rivera (agent)')
  })

  it('auto-populates primary team when selecting a member', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const teamSelect = screen.getByTestId('inspector-team-select') as HTMLSelectElement
    const memberSelect = screen.getByTestId('inspector-member-select') as HTMLSelectElement

    expect(teamSelect.value).toBe('')

    // Select Marcus Brody (memberId: 4, primary teamId: 2)
    await user.selectOptions(memberSelect, '4')

    // Team select should be auto-populated to Team 2
    expect(teamSelect.value).toBe('2')
    expect(memberSelect.value).toBe('4')
  })

  it('resets assigned member to Unassigned and triggers informational toast when selecting an incompatible team', async () => {
    const user = userEvent.setup()

    // Render with ticket-2 which is already assigned to Team 1 and Member 2 (Acme Agent)
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        initialTicketNumber={1002}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const teamSelect = screen.getByTestId('inspector-team-select') as HTMLSelectElement
    const memberSelect = screen.getByTestId('inspector-member-select') as HTMLSelectElement

    expect(teamSelect.value).toBe('1')
    expect(memberSelect.value).toBe('2')

    // Switch to Team 3 (Security Operations, memberIds: [1, 5] -> does not contain Member 2)
    await user.selectOptions(teamSelect, '3')

    // Member should be reset to Unassigned
    expect(memberSelect.value).toBe('')

    // Informational toast must be rendered
    const toast = screen.getByTestId('tactical-toast')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveTextContent(/reset to unassigned/i)
  })

  it('executes atomic optimistic priority mutation and rolls back instantly on error', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.fn().mockRejectedValue(new Error('Network gateway timeout'))

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        onUpdatePriority={errorSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const prioritySelect = screen.getByTestId('inspector-priority-select') as HTMLSelectElement
    expect(prioritySelect.value).toBe('urgent')

    // Attempt to change priority to 'low'
    await user.selectOptions(prioritySelect, 'low')

    // Wait for the rejection and verify rollback
    await waitFor(() => {
      expect(prioritySelect.value).toBe('urgent')
    })

    // Rollback error toast is shown
    expect(screen.getByTestId('tactical-toast')).toBeInTheDocument()
    expect(screen.getByText(/Network gateway timeout|rolled back/i)).toBeInTheDocument()
  })

  it('executes atomic optimistic status mutation and rolls back instantly on error', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.fn().mockRejectedValue(new Error('Transition disallowed'))

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        onUpdateStatus={errorSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    const statusSelect = screen.getByTestId('inspector-status-select') as HTMLSelectElement
    expect(statusSelect.value).toBe('new')

    // Attempt to change status to 'resolved'
    await user.selectOptions(statusSelect, 'resolved')

    // Wait for the rejection and verify rollback
    await waitFor(() => {
      expect(statusSelect.value).toBe('new')
    })

    // Rollback error toast is shown
    expect(screen.getByTestId('tactical-toast')).toBeInTheDocument()
  })

  it('allows 1-click detachment of existing tags via remove tag button', async () => {
    const user = userEvent.setup()
    const onRemoveTagSpy = vi.fn()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        onRemoveTag={onRemoveTagSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    // Ticket 1 has tags: security, p0-escalation, auth-v2
    expect(screen.getByTestId('tag-chip-security')).toBeInTheDocument()
    expect(screen.getByTestId('tag-chip-p0-escalation')).toBeInTheDocument()

    const removeBtn = screen.getByTestId('remove-tag-security')
    await user.click(removeBtn)

    expect(onRemoveTagSpy).toHaveBeenCalledWith('ticket-1', 1)
    // Tag should be removed from view
    expect(screen.queryByTestId('tag-chip-security')).not.toBeInTheDocument()
  })

  it('provides keyboard-navigable autocomplete popover to select and attach tags (ArrowDown, ArrowUp, Enter, Escape)', async () => {
    const user = userEvent.setup()
    const onAddTagSpy = vi.fn()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        onAddTag={onAddTagSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    // Open tag popover
    await user.click(screen.getByTestId('add-tag-trigger'))
    expect(screen.getByTestId('tag-autocomplete-popover')).toBeInTheDocument()

    const input = screen.getByTestId('tag-search-input')
    expect(input).toHaveFocus()

    // Filter suggestions by typing "data"
    await user.type(input, 'data')

    const option = screen.getByTestId('tag-option-database')
    expect(option).toBeInTheDocument()

    // Press ArrowDown to highlight database option, then Enter to select
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(onAddTagSpy).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({ slug: 'database' })
    )

    // Popover closes after attaching
    expect(screen.queryByTestId('tag-autocomplete-popover')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-chip-database')).toBeInTheDocument()
  })

  it('creates and attaches new tags via autocomplete popover input', async () => {
    const user = userEvent.setup()
    const onAddTagSpy = vi.fn()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        onAddTag={onAddTagSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    await user.click(screen.getByTestId('add-tag-trigger'))
    const input = screen.getByTestId('tag-search-input')

    await user.type(input, 'infra-remediation')
    await user.keyboard('{Enter}')

    expect(onAddTagSpy).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({ name: 'infra-remediation', slug: 'infra-remediation' })
    )

    expect(screen.getByTestId('tag-chip-infra-remediation')).toBeInTheDocument()
  })

  it('renders expandable assignment history audit log subledger and toggles visibility', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    expect(screen.getByTestId('assignment-history-section')).toBeInTheDocument()
    const toggleBtn = screen.getByTestId('toggle-assignment-history')
    expect(toggleBtn).toBeInTheDocument()

    // Initially expanded: audit record is visible
    expect(screen.getByTestId('assignment-history-body')).toBeInTheDocument()
    expect(screen.getByText('Ticket ingested via Customer Portal form')).toBeInTheDocument()
    expect(screen.getByText(/By System Intake/i)).toBeInTheDocument()

    // Click toggle to collapse
    await user.click(toggleBtn)
    expect(screen.queryByTestId('assignment-history-body')).not.toBeInTheDocument()

    // Click toggle to re-expand
    await user.click(toggleBtn)
    expect(screen.getByTestId('assignment-history-body')).toBeInTheDocument()
  })

  it('strictly omits destructive controls (delete button) from DOM for agent role', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        userRole="agent"
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    // Agent role: No delete button or modal in DOM
    expect(screen.queryByTestId('admin-delete-ticket-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('confirm-delete-btn')).not.toBeInTheDocument()
  })

  it('renders Delete Ticket button for admin role and opens confirmation modal before issuing delete', async () => {
    const user = userEvent.setup()
    const onDeleteSpy = vi.fn()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        userRole="admin"
        onDeleteTicket={onDeleteSpy}
      >
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    // Admin sees Delete button
    const deleteBtn = screen.getByTestId('admin-delete-ticket-btn')
    expect(deleteBtn).toBeInTheDocument()

    // Click Delete Ticket -> Confirmation Modal opens
    await user.click(deleteBtn)
    expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument()
    expect(screen.getByText(/Confirm Ticket Deletion/i)).toBeInTheDocument()

    // Cancel deletion
    const cancelBtn = screen.getByTestId('cancel-delete-btn')
    await user.click(cancelBtn)
    expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument()
    expect(onDeleteSpy).not.toHaveBeenCalled()

    // Click again and confirm deletion
    await user.click(deleteBtn)
    const confirmBtn = screen.getByTestId('confirm-delete-btn')
    await user.click(confirmBtn)

    expect(onDeleteSpy).toHaveBeenCalledWith('ticket-1')
    expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument()
  })

  it('dispatches API requests for claim, assign, status, priority, and delete when apiUrl is configured', async () => {
    const user = userEvent.setup()
    const fetchCalls: { url: string; method: string; body?: any }[] = []

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({
        url,
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      })

      if (url.includes('/claim')) {
        return {
          ok: true,
          json: async () => ({ message: 'Claimed', data: { id: 'ticket-1', status: 'open' } }),
        }
      }
      if (url.includes('/assign')) {
        return {
          ok: true,
          json: async () => ({ message: 'Assigned', data: { id: 'ticket-1', assigned_team_id: 1 } }),
        }
      }
      if (url.includes('/status')) {
        return {
          ok: true,
          json: async () => ({ message: 'Status updated', data: { id: 'ticket-1', status: 'pending' } }),
        }
      }
      if (url.includes('/priority')) {
        return {
          ok: true,
          json: async () => ({ message: 'Priority updated', data: { id: 'ticket-1', priority: 'high' } }),
        }
      }
      if (init?.method === 'DELETE' && url.includes('/tickets/ticket-1')) {
        return {
          ok: true,
          json: async () => ({ message: 'Deleted' }),
        }
      }
      return { ok: true, json: async () => ({ data: [] }) }
    })

    vi.stubGlobal('fetch', mockFetch)

    try {
      render(
        <TicketCockpit.Provider
          apiUrl="http://zeddesk.test/api"
          token="test-token-auth"
          tickets={INITIAL_MOCK_TICKETS}
          teams={MOCK_TEAMS}
          members={MOCK_MEMBERS}
          allTags={MOCK_TAGS_POOL}
          userRole="admin"
        >
          <TicketCockpit.Inspector />
        </TicketCockpit.Provider>
      )

      // 1. Claim ticket
      await user.click(screen.getByTestId('claim-ticket-btn'))
      expect(fetchCalls.some((c) => c.url.endsWith('/tickets/ticket-1/claim') && c.method === 'POST')).toBe(true)

      // 2. Update status
      await user.selectOptions(screen.getByTestId('inspector-status-select'), 'pending')
      expect(fetchCalls.some((c) => c.url.endsWith('/tickets/ticket-1/status') && c.method === 'PATCH' && c.body?.status === 'pending')).toBe(true)

      // 3. Update priority
      await user.selectOptions(screen.getByTestId('inspector-priority-select'), 'high')
      expect(fetchCalls.some((c) => c.url.endsWith('/tickets/ticket-1/priority') && c.method === 'PATCH' && c.body?.priority === 'high')).toBe(true)

      // 4. Assign team
      await user.selectOptions(screen.getByTestId('inspector-team-select'), '1')
      expect(fetchCalls.some((c) => c.url.endsWith('/tickets/ticket-1/assign') && c.method === 'POST' && c.body?.team_id === 1)).toBe(true)

      // 5. Delete ticket
      await user.click(screen.getByTestId('admin-delete-ticket-btn'))
      await user.click(screen.getByTestId('confirm-delete-btn'))
      expect(fetchCalls.some((c) => c.url.endsWith('/tickets/ticket-1') && c.method === 'DELETE')).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('supports compound subcomponents directly on TicketCockpit.Inspector (CustomerCard, Lifecycle, Routing, Tags, AuditLog, Destructive)', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        userRole="admin"
      >
        <TicketCockpit.Inspector>
          <TicketCockpit.Inspector.CustomerCard />
          <TicketCockpit.Inspector.ClaimCta />
          <TicketCockpit.Inspector.Lifecycle />
          <TicketCockpit.Inspector.Routing />
          <TicketCockpit.Inspector.Tags />
          <TicketCockpit.Inspector.AuditLog />
          <TicketCockpit.Inspector.Destructive />
        </TicketCockpit.Inspector>
      </TicketCockpit.Provider>
    )

    expect(screen.getByTestId('customer-profile-card')).toBeInTheDocument()
    expect(screen.getByTestId('claim-ticket-btn')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-status-select')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-team-select')).toBeInTheDocument()
    expect(screen.getByTestId('inline-tag-manager')).toBeInTheDocument()
    expect(screen.getByTestId('assignment-history-section')).toBeInTheDocument()
    expect(screen.getByTestId('admin-delete-ticket-btn')).toBeInTheDocument()
  })
})
