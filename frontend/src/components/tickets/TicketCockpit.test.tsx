import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { TicketCockpit } from './TicketCockpit'
import { useTicketCockpit, DEFAULT_COMPOUND_FILTERS } from './TicketCockpitContext'
import { TicketQueueView } from './TicketQueueView'
import { INITIAL_MOCK_TICKETS, MOCK_TEAMS, MOCK_MEMBERS, MOCK_TAGS_POOL } from './mockData'

describe('TicketCockpit Compound Component Baseline', () => {
  it('exposes generic TicketCockpitContextValue with state, actions, and meta via use()', () => {
    function TestConsumer() {
      const { state, actions, meta } = useTicketCockpit()
      const { searchInputRef } = meta
      return (
        <div data-testid="context-consumer">
          <span data-testid="ticket-count">{state.tickets.length}</span>
          <span data-testid="active-preset">{state.activePreset}</span>
          <span data-testid="mobile-pane">{state.mobilePane}</span>
          <button
            type="button"
            data-testid="test-select-btn"
            onClick={() => actions.selectTicket('ticket-2')}
          >
            Select Ticket 2
          </button>
          <input
            data-testid="test-meta-input"
            ref={searchInputRef}
            readOnly
          />
        </div>
      )
    }

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TestConsumer />
      </TicketCockpit.Provider>
    )

    expect(screen.getByTestId('context-consumer')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-count')).toHaveTextContent(String(INITIAL_MOCK_TICKETS.length))
    expect(screen.getByTestId('active-preset')).toHaveTextContent('all_open')
    expect(screen.getByTestId('mobile-pane')).toHaveTextContent('queue')
    expect(screen.getByTestId('test-meta-input')).toBeInTheDocument()
  })

  it('renders declaratively composed compound components without prop drilling', () => {
    render(
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
    )

    // Verify all 4 panels render in the DOM
    expect(screen.getByTestId('ticket-cockpit-frame')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-subrail')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-queue')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-detail')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-inspector')).toBeInTheDocument()

    // Verify sub-rail preset items render with counts
    expect(screen.getByTestId('preset-btn-all_open')).toBeInTheDocument()
    expect(screen.getByTestId('preset-btn-my_tickets')).toBeInTheDocument()

    // Verify queue cards render
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-number-ticket-1')).toHaveTextContent('#1001')

    // Verify detail header
    expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[0].subject)

    // Verify RBAC in inspector (agent cannot see admin delete button)
    expect(screen.queryByTestId('admin-delete-ticket-btn')).not.toBeInTheDocument()
  })

  it('filters tickets when selecting presets and updates queue card list', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Click Unassigned preset
    await user.click(screen.getByTestId('preset-btn-unassigned'))

    // Ticket 2 is assigned to member 2, so it should not appear under unassigned
    expect(screen.queryByTestId('ticket-row-ticket-2')).not.toBeInTheDocument()
    // Ticket 1 is unassigned, should appear
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
  })

  it('filters queue on search input using meta search ref', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    const searchInput = screen.getByTestId('queue-search-input')
    await user.type(searchInput, 'Database')

    // Only ticket 2 (Database query timeout) matches
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-ticket-1')).not.toBeInTheDocument()
  })

  it('supports dependency-injected context value directly into TicketCockpit.Provider', () => {
    const customValue = {
      state: {
        tickets: [INITIAL_MOCK_TICKETS[0]],
        filteredTickets: [INITIAL_MOCK_TICKETS[0]],
        selectedTicketId: INITIAL_MOCK_TICKETS[0].id,
        activeTicket: INITIAL_MOCK_TICKETS[0],
        activePreset: 'all_open' as const,
        searchQuery: '',
        filters: DEFAULT_COMPOUND_FILTERS,
        presetCounts: {
          all_open: 1,
          my_tickets: 0,
          unassigned: 0,
          team_queue: 0,
          resolved_closed: 0,
        },
        mobilePane: 'queue' as const,
        teams: MOCK_TEAMS,
        members: MOCK_MEMBERS,
        allTags: MOCK_TAGS_POOL,
        currentUserId: 2,
        userRole: 'admin' as const,
        isLoading: false,
        isError: false,
        isFetching: false,
      },
      actions: {
        selectTicket: vi.fn(),
        setActivePreset: vi.fn(),
        setSearchQuery: vi.fn(),
        setFilters: vi.fn(),
        resetFilters: vi.fn(),
        setMobilePane: vi.fn(),
        claimTicket: vi.fn(),
        updateStatus: vi.fn(),
        updatePriority: vi.fn(),
        assign: vi.fn(),
        addTag: vi.fn(),
        removeTag: vi.fn(),
        deleteTicket: vi.fn(),
        submitComposer: vi.fn(),
      },
      meta: {
        searchInputRef: { current: null },
      },
    }

    render(
      <TicketCockpit.Provider value={customValue}>
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    // Admin role shows admin delete button
    expect(screen.getByTestId('admin-delete-ticket-btn')).toBeInTheDocument()
  })

  it('transitions between Queue and Detail on mobile collapse (< 1024px) with back breadcrumb', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Click a ticket card to select and enter detail pane
    await user.click(screen.getByTestId('ticket-row-ticket-1'))

    // The detail back breadcrumb button is present
    const backBtn = screen.getByTestId('detail-back-breadcrumb')
    expect(backBtn).toBeInTheDocument()

    // Click back to return to queue
    await user.click(backBtn)

    // Queue column is active
    expect(screen.getByTestId('ticket-cockpit-queue')).toBeInTheDocument()
  })

  it('renders TicketQueueView with composed TicketCockpit without prototype switcher or search params', () => {
    render(<TicketQueueView />)

    // Composed TicketCockpit is present
    expect(screen.getByTestId('tickets-queue-view')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-frame')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-subrail')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-queue')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-detail')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-inspector')).toBeInTheDocument()

    // Prototype switcher is completely absent
    expect(screen.queryByTestId('prototype-floating-switcher')).not.toBeInTheDocument()
  })

  it('focuses search input when pressing "/" key outside of inputs', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    const searchInput = screen.getByTestId('queue-search-input')
    expect(searchInput).not.toHaveFocus()

    // Press '/' key
    await user.keyboard('/')
    expect(searchInput).toHaveFocus()
  })

  it('allows custom children inside Queue and Detail components', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue>
            <div data-testid="custom-queue-child">Custom Queue Content</div>
          </TicketCockpit.Queue>
          <TicketCockpit.Detail>
            <div data-testid="custom-detail-child">Custom Detail Content</div>
          </TicketCockpit.Detail>
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    expect(screen.getByTestId('custom-queue-child')).toHaveTextContent('Custom Queue Content')
    expect(screen.getByTestId('custom-detail-child')).toHaveTextContent('Custom Detail Content')
  })

  it('submits composer in Detail pane and updates ticket timeline', async () => {
    const user = userEvent.setup()

    render(<TicketQueueView />)

    // Type in composer textarea
    const textarea = screen.getByTestId('composer-textarea')
    await user.type(textarea, 'Patch deployed to production verified.')

    // Submit composer
    const submitBtn = screen.getByTestId('composer-submit-btn')
    await user.click(submitBtn)

    // Verify new message appears in timeline
    expect(screen.getByText('Patch deployed to production verified.')).toBeInTheDocument()
  })

  it('queries GET /api/tickets with scoped preset parameters via TanStack Query when switching presets', async () => {
    const user = userEvent.setup()
    const fetchCalls: string[] = []

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url)
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'server-ticket-1',
              ticket_number: 9999,
              subject: 'Server Ticket from Query',
              status: 'open',
              priority: 'high',
              assigned_team_id: 1,
              assigned_member_id: 2,
              customer: { id: 'c1', name: 'Server Customer', email: 'srv@test.com' },
              tags: [],
              messages: [],
              assignments: [],
            },
          ],
        }),
      }
    })

    vi.stubGlobal('fetch', mockFetch)

    try {
      render(
        <TicketCockpit.Provider
          apiUrl="http://acme.localhost"
          token="secret-token"
          teams={MOCK_TEAMS}
          members={MOCK_MEMBERS}
          allTags={MOCK_TAGS_POOL}
          currentUserId={2}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.SubRail />
            <TicketCockpit.Queue />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      // Initial fetch should query all_open preset
      expect(fetchCalls.some((call) => call.includes('status=new%2Copen%2Cpending') || call.includes('status=new,open,pending'))).toBe(true)

      // 1. Switch to My Tickets
      await user.click(screen.getByTestId('preset-btn-my_tickets'))
      expect(fetchCalls.some((call) => call.includes('assigned_to=me'))).toBe(true)

      // 2. Switch to Unassigned
      await user.click(screen.getByTestId('preset-btn-unassigned'))
      expect(fetchCalls.some((call) => call.includes('unassigned=true'))).toBe(true)

      // 3. Switch to Team Queue
      await user.click(screen.getByTestId('preset-btn-team_queue'))
      expect(fetchCalls.some((call) => call.includes('team_queue=true'))).toBe(true)

      // 4. Switch to Resolved & Closed
      await user.click(screen.getByTestId('preset-btn-resolved_closed'))
      expect(fetchCalls.some((call) => call.includes('status=resolved%2Cclosed') || call.includes('status=resolved,closed'))).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('displays accurate preset count badges formatted with font-mono and tabular-nums', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        currentUserId={2}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    const expectedAllOpen = INITIAL_MOCK_TICKETS.filter((t) => ['new', 'open', 'pending'].includes(t.status)).length
    const expectedMyTickets = INITIAL_MOCK_TICKETS.filter((t) => t.assigned_member_id === 2).length
    const expectedUnassigned = INITIAL_MOCK_TICKETS.filter((t) => !t.assigned_member_id).length
    const expectedTeamQueue = INITIAL_MOCK_TICKETS.filter((t) => Boolean(t.assigned_team_id)).length
    const expectedResolvedClosed = INITIAL_MOCK_TICKETS.filter((t) => ['resolved', 'closed'].includes(t.status)).length

    // Check count badge presence and typography classes
    const allOpenBadge = screen.getByTestId('preset-count-all_open')
    expect(allOpenBadge).toHaveTextContent(String(expectedAllOpen))
    expect(allOpenBadge.className).toContain('font-mono')
    expect(allOpenBadge.className).toContain('tabular-nums')

    const myTicketsBadge = screen.getByTestId('preset-count-my_tickets')
    expect(myTicketsBadge).toHaveTextContent(String(expectedMyTickets))
    expect(myTicketsBadge.className).toContain('font-mono')
    expect(myTicketsBadge.className).toContain('tabular-nums')

    const unassignedBadge = screen.getByTestId('preset-count-unassigned')
    expect(unassignedBadge).toHaveTextContent(String(expectedUnassigned))
    expect(unassignedBadge.className).toContain('tabular-nums')

    const teamQueueBadge = screen.getByTestId('preset-count-team_queue')
    expect(teamQueueBadge).toHaveTextContent(String(expectedTeamQueue))
    expect(teamQueueBadge.className).toContain('tabular-nums')

    const resolvedClosedBadge = screen.getByTestId('preset-count-resolved_closed')
    expect(resolvedClosedBadge).toHaveTextContent(String(expectedResolvedClosed))
    expect(resolvedClosedBadge.className).toContain('tabular-nums')
  })

  it('derives filtered queues during render with compound filter dropdowns (status, priority, team, tag)', async () => {
    const user = userEvent.setup()

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        currentUserId={2}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Initially under all_open: ticket-1, ticket-2, ticket-3
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-3')).toBeInTheDocument()

    // 1. Filter by Priority: urgent (P0) -> only ticket-1
    const prioritySelect = screen.getByTestId('filter-priority-select')
    await user.selectOptions(prioritySelect, 'urgent')
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-ticket-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-ticket-3')).not.toBeInTheDocument()

    // Reset priority back to all
    await user.selectOptions(prioritySelect, 'all')
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()

    // 2. Filter by Status: open -> only ticket-2
    const statusSelect = screen.getByTestId('filter-status-select')
    await user.selectOptions(statusSelect, 'open')
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-ticket-1')).not.toBeInTheDocument()

    // Reset status back to all
    await user.selectOptions(statusSelect, 'all')

    // 3. Filter by Team: Team 1 (Support Tier 1)
    const teamSelect = screen.getByTestId('filter-team-select')
    await user.selectOptions(teamSelect, '1')
    // Ticket 1 is unassigned to team, so it should not appear
    expect(screen.queryByTestId('ticket-row-ticket-1')).not.toBeInTheDocument()
    // Ticket 2 and Ticket 3 are assigned to team 1
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-3')).toBeInTheDocument()

    // 4. Filter by Tag: tag 4 (database) -> only ticket-2
    const tagSelect = screen.getByTestId('filter-tag-select')
    await user.selectOptions(tagSelect, '4')
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-ticket-3')).not.toBeInTheDocument()

    // 5. Click Clear Filters button
    const clearBtn = screen.getByTestId('clear-filters-btn')
    expect(clearBtn).toBeInTheDocument()
    await user.click(clearBtn)

    // After reset, all open tickets return
    expect(screen.getByTestId('ticket-row-ticket-1')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-2')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-ticket-3')).toBeInTheDocument()
  })

  it('updates URL to /tickets/:ticketNumber via HTML5 History without full page reload when selecting a ticket', async () => {
    const user = userEvent.setup()
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Select ticket-2 (ticket_number 1002)
    await user.click(screen.getByTestId('ticket-row-ticket-2'))

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-2', ticketNumber: 1002 }),
      '',
      '/tickets/1002'
    )

    pushStateSpy.mockRestore()
  })

  it('hydrates targeted ticket directly when booting with /tickets/:ticketNumber', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        initialTicketNumber={1002}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Ticket 1002 should be the active detail
    expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[1].subject)
  })

  it('hydrates resolved ticket and automatically switches active preset to resolved_closed on boot', () => {
    render(
      <TicketCockpit.Provider
        tickets={INITIAL_MOCK_TICKETS}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        initialTicketNumber={1006}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Ticket 1006 is resolved, so detail should show it
    expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[5].subject)
    // Queue should show ticket-1006
    expect(screen.getByTestId('ticket-row-ticket-1006')).toBeInTheDocument()
  })

  it('throws an informative error if useTicketCockpit is consumed outside Provider', () => {
    function OrphanConsumer() {
      useTicketCockpit()
      return null
    }

    // Suppress console.error during expected throw
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<OrphanConsumer />)).toThrow(
      'useTicketCockpit must be used within a TicketCockpit.Provider'
    )

    consoleError.mockRestore()
  })
})
