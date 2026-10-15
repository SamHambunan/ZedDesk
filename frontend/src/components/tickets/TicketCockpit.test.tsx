import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TicketCockpit } from './TicketCockpit'
import { useTicketCockpit, DEFAULT_COMPOUND_FILTERS } from './TicketCockpitContext'
import { TicketQueueView } from './TicketQueueView'
import { INITIAL_MOCK_TICKETS, MOCK_TEAMS, MOCK_MEMBERS, MOCK_TAGS_POOL } from './mockData'
import { createMockLiveClient } from '../../lib/live-client'
import { queryClient } from '../../lib/query-client'

describe('TicketCockpit Compound Component Baseline', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    queryClient.clear()
  })

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

    // Verify all 4 panels render in the DOM with data-theme="internal"
    expect(screen.getByTestId('ticket-cockpit-frame')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-cockpit-frame')).toHaveAttribute('data-theme', 'internal')
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

  it('preserves global sub-rail preset counts when switching between scoped preset queries', async () => {
    const user = userEvent.setup()

    const allTicketsList = [
      {
        id: 't-1',
        ticket_number: 1,
        subject: 'First Open Ticket',
        status: 'open',
        priority: 'high',
        assigned_team_id: 1,
        assigned_member_id: 2,
        customer: { id: 'c1', name: 'Alice', email: 'alice@test.com' },
        tags: [],
        messages: [],
        assignments: [],
      },
      {
        id: 't-2',
        ticket_number: 2,
        subject: 'Second Pending Ticket',
        status: 'pending',
        priority: 'medium',
        assigned_team_id: 1,
        assigned_member_id: null,
        customer: { id: 'c2', name: 'Bob', email: 'bob@test.com' },
        tags: [],
        messages: [],
        assignments: [],
      },
      {
        id: 't-3',
        ticket_number: 3,
        subject: 'Resolved Ticket',
        status: 'resolved',
        priority: 'low',
        assigned_team_id: null,
        assigned_member_id: null,
        customer: { id: 'c3', name: 'Charlie', email: 'charlie@test.com' },
        tags: [],
        messages: [],
        assignments: [],
      },
    ]

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('all=true')) {
        return {
          ok: true,
          json: async () => ({ data: allTicketsList }),
        }
      }
      if (url.includes('unassigned=true')) {
        // Scoped response returns only unassigned tickets (t-2, t-3)
        return {
          ok: true,
          json: async () => ({ data: [allTicketsList[1], allTicketsList[2]] }),
        }
      }
      return {
        ok: true,
        json: async () => ({ data: allTicketsList }),
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

      await waitFor(() => {
        expect(screen.getByTestId('preset-count-all_open')).toHaveTextContent('2')
        expect(screen.getByTestId('preset-count-my_tickets')).toHaveTextContent('1')
        expect(screen.getByTestId('preset-count-unassigned')).toHaveTextContent('2')
      })

      // Click Unassigned preset
      await user.click(screen.getByTestId('preset-btn-unassigned'))

      // Queue displays unassigned tickets
      await waitFor(() => {
        expect(screen.getByTestId('ticket-row-t-2')).toBeInTheDocument()
      })

      // Crucial assertion: Subrail preset counts MUST NOT drop to 0 or re-scope to unassigned only!
      expect(screen.getByTestId('preset-count-all_open')).toHaveTextContent('2')
      expect(screen.getByTestId('preset-count-my_tickets')).toHaveTextContent('1')
      expect(screen.getByTestId('preset-count-unassigned')).toHaveTextContent('2')
      expect(screen.getByTestId('preset-count-team_queue')).toHaveTextContent('2')
      expect(screen.getByTestId('preset-count-resolved_closed')).toHaveTextContent('1')
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

  it('supports keyboard navigation on queue cards and applies cadmium amber selection & focus tokens', async () => {
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

    // Initial state: ticket-1 is active
    const card1 = screen.getByTestId('ticket-row-ticket-1')
    expect(card1).toHaveAttribute('tabIndex', '0')
    expect(card1).toHaveAttribute('role', 'button')
    expect(card1).toHaveAttribute('aria-pressed', 'true')
    expect(card1.className).toContain('border-amber-action')
    expect(card1.className).toContain('bg-surface-container-high')

    // ticket-2 is inactive
    const card2 = screen.getByTestId('ticket-row-ticket-2')
    expect(card2).toHaveAttribute('tabIndex', '0')
    expect(card2).toHaveAttribute('role', 'button')
    expect(card2).toHaveAttribute('aria-pressed', 'false')
    expect(card2.className).toContain('border-transparent')
    expect(card2.className).not.toContain('border-amber-action')

    // Navigate to card2 via keyboard (focus and Enter)
    card2.focus()
    expect(card2).toHaveFocus()
    await user.keyboard('{Enter}')

    // Active ticket should now be ticket-2
    expect(card2).toHaveAttribute('aria-pressed', 'true')
    expect(card2.className).toContain('border-amber-action')
    expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[1].subject)

    // Select ticket-3 with Space key
    const card3 = screen.getByTestId('ticket-row-ticket-3')
    card3.focus()
    expect(card3).toHaveFocus()
    await user.keyboard(' ')
    expect(card3.className).toContain('border-amber-action')
    expect(screen.getByTestId('detail-subject')).toHaveTextContent(INITIAL_MOCK_TICKETS[2].subject)
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

describe('Ticket field conflict recovery', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    queryClient.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('keeps a stale Ticket Status choice, message draft, and attachment until an explicit retry', async () => {
    const user = userEvent.setup()
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    let serverStatus = 'new'
    let statusRevision = 3
    const ticket = { ...INITIAL_MOCK_TICKETS[0], status: 'new' as const, priority: 'medium' as const,
      revision: 8, status_revision: 3, priority_revision: 7, assignment_revision: 2 }

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      requests.push({ url, method, body })
      if (url.endsWith('/tickets/ticket-1/status') && method === 'PATCH') {
        if (statusRevision === 3) {
          serverStatus = 'open'
          statusRevision = 4
          return { ok: false, status: 409, json: async () => ({ message: 'Ticket status has changed since it was read.', current: { status: 'open', status_revision: 4, revision: 9 } }) }
        }
        serverStatus = body.status as string
        statusRevision = 5
        return { ok: true, json: async () => ({ data: { ...ticket, status: serverStatus, status_revision: 5 } }) }
      }
      if (url.endsWith('/tickets/ticket-1')) {
        return { ok: true, json: async () => ({ data: { ...ticket, status: serverStatus, status_revision: statusRevision } }) }
      }
      if (url.includes('/tickets?')) {
        return { ok: true, json: async () => ({ data: [{ ...ticket, status: serverStatus, status_revision: statusRevision }] }) }
      }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(
      <TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]}>
        <TicketCockpit.Inspector />
        <TicketCockpit.Detail />
      </TicketCockpit.Provider>
    )

    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/tickets/ticket-1'))).toBe(true))
    await user.type(screen.getByTestId('composer-textarea'), 'Please check the attached logs.')
    await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['log'], 'error.txt', { type: 'text/plain' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ticket Status' }), 'pending')

    await waitFor(() => expect(screen.getByText(/Current value: open/i)).toBeInTheDocument())
    const statusSelect = screen.getByRole('combobox', { name: 'Ticket Status' }) as HTMLSelectElement
    expect(statusSelect.value).toBe('pending')
    expect(statusSelect).toHaveFocus()
    await user.selectOptions(statusSelect, 'resolved')
    expect(statusSelect.value).toBe('resolved')
    await user.selectOptions(statusSelect, 'pending')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Use current value' })).toHaveFocus()
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Please check the attached logs.')
    expect(screen.getByText('error.txt')).toBeInTheDocument()
    expect(requests.filter((request) => request.url.endsWith('/status') && request.method === 'PATCH')).toHaveLength(1)
    expect(requests.find((request) => request.url.endsWith('/status'))?.body).toMatchObject({ status: 'pending', expected_status_revision: 3 })

    await user.click(screen.getByRole('button', { name: 'Retry my change' }))
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith('/status') && request.method === 'PATCH')).toHaveLength(2))
    expect(requests.filter((request) => request.url.endsWith('/status'))[1].body).toMatchObject({ status: 'pending', expected_status_revision: 4 })
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Please check the attached logs.')
    expect(screen.getByText('error.txt')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Current value: open/i)).not.toBeInTheDocument())
    expect(statusSelect).toHaveFocus()
  })

  it('uses the Priority revision despite an unrelated Ticket Status change and can accept a same-field conflict', async () => {
    const user = userEvent.setup()
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    let priority = 'medium'
    let priorityRevision = 7
    const ticket = { ...INITIAL_MOCK_TICKETS[0], status: 'new' as const, priority: 'medium' as const,
      revision: 8, status_revision: 3, priority_revision: 7, assignment_revision: 2 }

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      requests.push({ url, method, body })
      if (url.endsWith('/tickets/ticket-1/priority') && method === 'PATCH') {
        if (body.priority === 'urgent') {
          priority = 'high'
          priorityRevision = 9
          return { ok: false, status: 409, json: async () => ({ message: 'Ticket priority has changed since it was read.', current: { priority: 'high', priority_revision: 9, revision: 12 } }) }
        }
        priority = body.priority as string
        priorityRevision += 1
        return { ok: true, json: async () => ({ data: { ...ticket, status: 'open', priority, priority_revision: priorityRevision } }) }
      }
      if (url.endsWith('/tickets/ticket-1')) {
        return { ok: true, json: async () => ({ data: { ...ticket, status: 'open', status_revision: 4, priority, priority_revision: priorityRevision } }) }
      }
      if (url.includes('/tickets?')) {
        return { ok: true, json: async () => ({ data: [{ ...ticket, status: 'open', status_revision: 4, priority, priority_revision: priorityRevision }] }) }
      }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]}><TicketCockpit.Inspector /></TicketCockpit.Provider>)
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/tickets/ticket-1'))).toBe(true))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'low')
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/priority') && request.method === 'PATCH')).toBe(true))
    expect(requests.find((request) => request.url.endsWith('/priority'))?.body).toMatchObject({ priority: 'low', expected_priority_revision: 7 })
    expect(screen.queryByRole('button', { name: 'Retry my change' })).not.toBeInTheDocument()

    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement).value).toBe('low'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'urgent')
    await waitFor(() => expect(screen.getByText(/Current value: high/i)).toBeInTheDocument())
    expect((screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement).value).toBe('urgent')
    await user.click(screen.getByRole('button', { name: 'Use current value' }))
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement).value).toBe('high'))
    expect(screen.queryByText(/Current value: high/i)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveFocus()
  })

  it('keeps unresolved choices on their own Tickets while switching between them', async () => {
    const user = userEvent.setup()
    const first = { ...INITIAL_MOCK_TICKETS[0], status: 'new' as const, status_revision: 3 }
    const second = { ...INITIAL_MOCK_TICKETS[1], status: 'new' as const, status_revision: 5 }
    const tickets = [first, second]

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && url.endsWith('/status')) {
        const isFirst = url.includes('/ticket-1/')
        return { ok: false, status: 409, json: async () => ({
          message: 'Ticket status has changed since it was read.',
          current: { status: isFirst ? 'open' : 'pending', status_revision: isFirst ? 4 : 6 },
        }) }
      }
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: first }) }
      if (url.endsWith('/tickets/ticket-2')) return { ok: true, json: async () => ({ data: second }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: tickets }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(
      <TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={tickets}>
        <TicketCockpit.Queue />
        <TicketCockpit.Inspector />
      </TicketCockpit.Provider>
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ticket Status' }), 'resolved')
    await waitFor(() => expect(screen.getByText('Current value: open')).toBeInTheDocument())
    await user.click(screen.getByTestId('ticket-row-ticket-2'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ticket Status' }), 'open')
    await waitFor(() => expect(screen.getByText('Current value: pending')).toBeInTheDocument())

    await user.click(screen.getByTestId('ticket-row-ticket-1'))
    expect((screen.getByRole('combobox', { name: 'Ticket Status' }) as HTMLSelectElement).value).toBe('resolved')
    expect(screen.getByText('Current value: open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use current value' }))
    await waitFor(() => expect(screen.queryByText('Current value: open')).not.toBeInTheDocument())

    await user.click(screen.getByTestId('ticket-row-ticket-2'))
    expect((screen.getByRole('combobox', { name: 'Ticket Status' }) as HTMLSelectElement).value).toBe('open')
    expect(screen.getByText('Current value: pending')).toBeInTheDocument()
  })

  it('sends the Assignment revision for claim and Assignment without treating a lifecycle rejection as a conflict', async () => {
    const user = userEvent.setup()
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    let assignmentRevision = 2
    let assignedMemberId: number | null = null
    const ticket = { ...INITIAL_MOCK_TICKETS[0], status: 'new' as const, priority: 'medium' as const,
      revision: 8, status_revision: 3, priority_revision: 7, assignment_revision: 2 }

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      requests.push({ url, method, body })
      if (url.endsWith('/claim') && method === 'POST') {
        assignedMemberId = 2
        assignmentRevision = 3
        return { ok: true, json: async () => ({ data: { ...ticket, assigned_member_id: 2, assignment_revision: 3 } }) }
      }
      if (url.endsWith('/assign') && method === 'POST') {
        assignmentRevision = 4
        return { ok: true, json: async () => ({ data: { ...ticket, assigned_team_id: 1, assigned_member_id: 2, assignment_revision: 4 } }) }
      }
      if (url.endsWith('/status') && method === 'PATCH') {
        return { ok: false, status: 422, json: async () => ({ message: 'Ticket Status transition is not allowed.' }) }
      }
      const current = { ...ticket, assigned_member_id: assignedMemberId, assignment_revision: assignmentRevision }
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: current }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: [current] }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]} teams={MOCK_TEAMS} members={MOCK_MEMBERS}><TicketCockpit.Inspector /></TicketCockpit.Provider>)
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/tickets/ticket-1'))).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Claim Ticket' }))
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/claim') && request.method === 'POST')).toBe(true))
    expect(requests.find((request) => request.url.endsWith('/claim'))?.body).toEqual({ expected_assignment_revision: 2 })

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith('/tickets/ticket-1')).length).toBeGreaterThan(1))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assigned Team' }), '1')
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/assign') && request.method === 'POST')).toBe(true))
    expect(requests.find((request) => request.url.endsWith('/assign'))?.body).toMatchObject({ team_id: 1, expected_assignment_revision: 3 })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ticket Status' }), 'closed')
    await waitFor(() => expect(screen.getByText('Ticket Status transition is not allowed.')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Retry my change' })).not.toBeInTheDocument()
  })
})

describe('Assignment conflict recovery', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    queryClient.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('compares both Assignment values and retries the intended pair only after a click', async () => {
    const user = userEvent.setup()
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
    const ticket = { ...INITIAL_MOCK_TICKETS[0], assignment_revision: 2 }
    let currentTeamId: number | null = null
    let currentMemberId: number | null = null
    let assignmentRevision = 2

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({ url, body })
      if (url.endsWith('/assign') && init?.method === 'POST') {
        if (assignmentRevision === 2) {
          currentTeamId = 2
          currentMemberId = 4
          assignmentRevision = 3
          return { ok: false, status: 409, json: async () => ({
            message: 'Ticket assignment has changed since it was read.',
            current: { assigned_team_id: 2, assigned_member_id: 4, assignment_revision: 3 },
          }) }
        }
        currentTeamId = body.team_id
        currentMemberId = body.member_id
        assignmentRevision = 4
        return { ok: true, json: async () => ({ data: { ...ticket, assigned_team_id: currentTeamId, assigned_member_id: currentMemberId, assignment_revision: 4 } }) }
      }
      const current = { ...ticket, assigned_team_id: currentTeamId, assigned_member_id: currentMemberId, assignment_revision: assignmentRevision }
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: current }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: [current] }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]} teams={MOCK_TEAMS} members={MOCK_MEMBERS}>
      <TicketCockpit.Inspector />
      <TicketCockpit.Detail />
    </TicketCockpit.Provider>)
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/tickets/ticket-1'))).toBe(true))
    await user.type(screen.getByTestId('composer-textarea'), 'Keep this draft')
    await user.upload(screen.getByTestId('composer-hidden-file-input'), new File(['log'], 'error.txt', { type: 'text/plain' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assigned Team' }), '1')

    await waitFor(() => expect(screen.getByText('Current assignment: Team: Billing Support; Organization Member: Marcus Brody')).toBeInTheDocument())
    expect(screen.getByText('My choice: Team: Support Tier 1; Organization Member: Unassigned')).toBeInTheDocument()
    expect((screen.getByRole('combobox', { name: 'Assigned Team' }) as HTMLSelectElement).value).toBe('1')
    expect(requests.filter((request) => request.url.endsWith('/assign'))).toHaveLength(1)
    expect(requests.find((request) => request.url.endsWith('/assign'))?.body).toMatchObject({ team_id: 1, member_id: null, expected_assignment_revision: 2 })
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Keep this draft')
    expect(screen.getByText('error.txt')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry my change' }))
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith('/assign'))).toHaveLength(2))
    expect(requests.filter((request) => request.url.endsWith('/assign'))[1].body).toMatchObject({ team_id: 1, member_id: null, expected_assignment_revision: 3 })
    await waitFor(() => expect(screen.queryByText('Current assignment: Team: Billing Support; Organization Member: Marcus Brody')).not.toBeInTheDocument())
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Keep this draft')
    expect(screen.getByText('error.txt')).toBeInTheDocument()
  })

  it('keeps a stale Claim deliberate and accepts the current Assignment without another mutation', async () => {
    const user = userEvent.setup()
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
    const ticket = { ...INITIAL_MOCK_TICKETS[0], assignment_revision: 2 }
    let currentTeamId: number | null = null
    let assignmentRevision = 2

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({ url, body })
      if (url.endsWith('/claim') && init?.method === 'POST') {
        currentTeamId = 1
        assignmentRevision = 3
        return { ok: false, status: 409, json: async () => ({
          message: 'Ticket assignment has changed since it was read.',
          current: { assigned_team_id: 1, assigned_member_id: null, assignment_revision: 3 },
        }) }
      }
      const current = { ...ticket, assigned_team_id: currentTeamId, assignment_revision: assignmentRevision }
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: current }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: [current] }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]} teams={MOCK_TEAMS} members={MOCK_MEMBERS}>
      <TicketCockpit.Inspector />
      <TicketCockpit.Detail />
    </TicketCockpit.Provider>)
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/tickets/ticket-1'))).toBe(true))
    await user.type(screen.getByTestId('composer-textarea'), 'Claim draft')
    await user.click(screen.getByRole('button', { name: 'Claim Ticket' }))

    await waitFor(() => expect(screen.getByText('Current assignment: Team: Support Tier 1; Organization Member: Unassigned')).toBeInTheDocument())
    expect(screen.getByText('My choice: Team: Support Tier 1; Organization Member: Acme Agent')).toBeInTheDocument()
    expect(screen.getByText('Retrying Claim keeps the current Team.')).toBeInTheDocument()
    expect(requests.filter((request) => request.url.endsWith('/claim'))).toHaveLength(1)
    expect(requests.find((request) => request.url.endsWith('/claim'))?.body).toEqual({ expected_assignment_revision: 2 })
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Claim draft')
    expect(screen.queryByRole('button', { name: 'Claim Ticket' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use current value' }))
    await waitFor(() => expect(screen.queryByText('Current assignment: Team: Support Tier 1; Organization Member: Unassigned')).not.toBeInTheDocument())
    expect((screen.getByRole('combobox', { name: 'Assigned Team' }) as HTMLSelectElement).value).toBe('1')
    expect(requests.filter((request) => request.url.endsWith('/claim'))).toHaveLength(1)
    expect(screen.getByTestId('composer-textarea')).toHaveValue('Claim draft')
  })

  it('shows a second Assignment change before retrying Claim and requires another click', async () => {
    const user = userEvent.setup()
    const claimBodies: Array<Record<string, unknown>> = []
    const ticket = { ...INITIAL_MOCK_TICKETS[0], assignment_revision: 2 }
    let teamId: number | null = null
    let memberId: number | null = null
    let revision = 2
    let nextReadHasAnotherTeam = false

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim') && init?.method === 'POST') {
        claimBodies.push(JSON.parse(init.body as string))
        if (claimBodies.length === 1) {
          teamId = 1
          revision = 3
          nextReadHasAnotherTeam = true
          return { ok: false, status: 409, json: async () => ({
            message: 'Ticket assignment has changed since it was read.',
            current: { assigned_team_id: 1, assigned_member_id: null, assignment_revision: 3 },
          }) }
        }
        memberId = 1
        revision = 5
        return { ok: true, json: async () => ({ data: { ...ticket, assigned_team_id: teamId, assigned_member_id: memberId, assignment_revision: revision } }) }
      }
      if (url.endsWith('/tickets/ticket-1') && nextReadHasAnotherTeam) {
        teamId = 2
        revision = 4
        nextReadHasAnotherTeam = false
      }
      const current = { ...ticket, assigned_team_id: teamId, assigned_member_id: memberId, assignment_revision: revision }
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: current }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: [current] }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]} teams={MOCK_TEAMS} members={MOCK_MEMBERS} currentUserId={1}>
      <TicketCockpit.Inspector />
    </TicketCockpit.Provider>)
    await user.click(screen.getByRole('button', { name: 'Claim Ticket' }))
    await waitFor(() => expect(screen.getByText('Current assignment: Team: Support Tier 1; Organization Member: Unassigned')).toBeInTheDocument())
    expect(claimBodies).toEqual([{ expected_assignment_revision: 2 }])

    await user.click(screen.getByRole('button', { name: 'Retry my change' }))
    await waitFor(() => expect(screen.getByText('Current assignment: Team: Billing Support; Organization Member: Unassigned')).toBeInTheDocument())
    expect(screen.getByText('My choice: Team: Billing Support; Organization Member: Acme Admin')).toBeInTheDocument()
    expect(claimBodies).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Retry my change' }))
    await waitFor(() => expect(claimBodies).toHaveLength(2))
    expect(claimBodies[1]).toEqual({ expected_assignment_revision: 4 })
    await waitFor(() => expect(screen.queryByText('Current assignment: Team: Billing Support; Organization Member: Unassigned')).not.toBeInTheDocument())
  })

  it('does not send an unchecked Assignment or Claim when the Assignment revision is unavailable', async () => {
    const user = userEvent.setup()
    const mutations: string[] = []
    const ticket = { ...INITIAL_MOCK_TICKETS[0] }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') mutations.push(url)
      if (url.endsWith('/tickets/ticket-1')) return { ok: true, json: async () => ({ data: ticket }) }
      if (url.includes('/tickets?')) return { ok: true, json: async () => ({ data: [ticket] }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }))

    render(<TicketCockpit.Provider apiUrl="http://zeddesk.test/api" token="test-token" tickets={[ticket]} teams={MOCK_TEAMS} members={MOCK_MEMBERS}>
      <TicketCockpit.Inspector />
    </TicketCockpit.Provider>)
    await user.click(screen.getByRole('button', { name: 'Claim Ticket' }))
    await waitFor(() => expect(screen.getByText('Assignment revision unavailable. Refresh the Ticket and try again.')).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assigned Team' }), '1')
    expect(mutations).toEqual([])
  })
})

describe('Live Signals and Authorized REST Refresh (Issue #149)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.history.pushState({}, '', '/')
    global.fetch = originalFetch
    queryClient.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    queryClient.clear()
  })

  it('subscribes to Organization and selected Ticket channels and refetches authoritative REST data on relevant signal', async () => {
    const liveClient = createMockLiveClient('connected')
    let ticket1Subject = 'Initial Subject 1'

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'ticket-1',
                  ticket_number: 1001,
                  subject: ticket1Subject,
                  status: 'open',
                  priority: 'medium',
                  revision: 1,
                  customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                  created_at: '2026-10-10T10:00:00Z',
                  updated_at: '2026-10-10T10:00:00Z',
                },
                {
                  id: 'ticket-2',
                  ticket_number: 1002,
                  subject: 'Second Ticket',
                  status: 'open',
                  priority: 'low',
                  revision: 1,
                  customer: { id: 'c2', name: 'Bob Customer', email: 'bob@example.com' },
                  created_at: '2026-10-10T09:00:00Z',
                  updated_at: '2026-10-10T09:00:00Z',
                },
              ],
            }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: ticket1Subject,
                status: 'open',
                priority: 'medium',
                revision: ticket1Subject === 'Refreshed Authoritative Subject' ? 2 : 1,
                customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                messages: [
                  {
                    id: 'msg-1',
                    body: 'First message',
                    message_type: 'public_reply',
                    author_type: 'Customer',
                    author_name: 'Alice Customer',
                    created_at: '2026-10-10T10:00:00Z',
                  },
                ],
              },
            }),
        })
      }
      if (url.includes('/api/tags')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Initial render displays ticket 1001 with Initial Subject 1
    await waitFor(() => {
      expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('Initial Subject 1')
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Initial Subject 1')
    })

    // Now update server state and emit live signal
    ticket1Subject = 'Refreshed Authoritative Subject'
    liveClient.emitSignal({
      event_id: 'sig-1',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'status_changed',
      revision: 2,
    })

    // Assert that authoritative REST query was refetched and view displays updated subject
    await waitFor(() => {
      expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('Refreshed Authoritative Subject')
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Refreshed Authoritative Subject')
    })
  })

  it('ignores duplicate event IDs and older revisions without disturbing the view', async () => {
    const liveClient = createMockLiveClient('connected')
    let fetchCallCount = 0

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        fetchCallCount++
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'ticket-1',
                  ticket_number: 1001,
                  subject: 'Stable Ticket',
                  status: 'open',
                  priority: 'medium',
                  revision: 5,
                  customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                },
              ],
            }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'Stable Ticket',
                status: 'open',
                priority: 'medium',
                revision: 5,
                customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                messages: [],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
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

    await waitFor(() => {
      expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('Stable Ticket')
    })

    const initialFetchCount = fetchCallCount

    // Emit duplicate signal with already seen event_id
    liveClient.emitSignal({
      event_id: 'duplicate-evt-1',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'priority_changed',
      revision: 6,
    })

    await waitFor(() => {
      expect(fetchCallCount).toBeGreaterThan(initialFetchCount)
    })
    const countAfterFirst = fetchCallCount

    // Emit exact same event_id again -> must be ignored
    liveClient.emitSignal({
      event_id: 'duplicate-evt-1',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'priority_changed',
      revision: 6,
    })

    // Emit older revision signal (revision 3 <= 6) -> must be ignored
    liveClient.emitSignal({
      event_id: 'older-rev-evt',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'priority_changed',
      revision: 3,
    })

    // View remains completely stable with same fetch count
    expect(fetchCallCount).toBe(countAfterFirst)
    expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('Stable Ticket')
  })

  it('recovers current REST state on reconnect and channel rotation', async () => {
    const liveClient = createMockLiveClient('connected')
    let currentStatus = 'open'

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'ticket-1',
                  ticket_number: 1001,
                  subject: 'Reconnecting Ticket',
                  status: currentStatus,
                  priority: 'medium',
                  revision: 2,
                  customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                },
              ],
            }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'Reconnecting Ticket',
                status: currentStatus,
                priority: 'medium',
                revision: 2,
                customer: { id: 'c1', name: 'Alice Customer', email: 'alice@example.com' },
                messages: [],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
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

    await waitFor(() => {
      expect(screen.getByTestId('ticket-status-ticket-1')).toHaveTextContent(/open/i)
    })

    // Change server state during disconnect
    currentStatus = 'pending'
    liveClient.simulateDisconnect()
    await waitFor(() => {
      expect(screen.getByTestId('live-status-indicator')).toBeInTheDocument()
    })

    // Reconnect recovers current state
    liveClient.simulateReconnect()
    await waitFor(() => {
      expect(screen.getByTestId('ticket-status-ticket-1')).toHaveTextContent(/pending/i)
      expect(screen.queryByTestId('live-status-indicator')).not.toBeInTheDocument()
    })

    // Channel rotation also recovers current state
    currentStatus = 'new'
    await liveClient.rotateChannels?.()
    await waitFor(() => {
      expect(screen.getByTestId('ticket-status-ticket-1')).toHaveTextContent(/new/i)
    })
  })

  it('updates visible rows in place, keeps selection stable, and applies changed queue order deliberately via New activity', async () => {
    const user = userEvent.setup()
    const liveClient = createMockLiveClient('connected')
    let currentQueue = [
      {
        id: 'ticket-1',
        ticket_number: 1001,
        subject: 'First in Queue',
        status: 'open',
        priority: 'medium',
        revision: 1,
        customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
        updated_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'ticket-2',
        ticket_number: 1002,
        subject: 'Second in Queue',
        status: 'open',
        priority: 'low',
        revision: 1,
        customer: { id: 'c2', name: 'Bob', email: 'bob@example.com' },
        updated_at: '2026-10-10T09:00:00Z',
      },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: currentQueue }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'First in Queue',
                status: 'open',
                priority: 'medium',
                revision: 2,
                customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
                messages: [],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
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

    await waitFor(() => {
      expect(screen.getByTestId('ticket-row-ticket-1')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('ticket-subject-ticket-1')).toHaveTextContent('First in Queue')
    })

    // Now a new ticket arrives and ticket-2 has new activity making it newer than ticket-1
    currentQueue = [
      {
        id: 'ticket-3',
        ticket_number: 1003,
        subject: 'Newly Created Ticket',
        status: 'new',
        priority: 'urgent',
        revision: 1,
        customer: { id: 'c3', name: 'Charlie', email: 'charlie@example.com' },
        updated_at: '2026-10-10T11:00:00Z',
      },
      {
        id: 'ticket-2',
        ticket_number: 1002,
        subject: 'Second in Queue (Updated)',
        status: 'pending',
        priority: 'high',
        revision: 2,
        customer: { id: 'c2', name: 'Bob', email: 'bob@example.com' },
        updated_at: '2026-10-10T10:30:00Z',
      },
      {
        id: 'ticket-1',
        ticket_number: 1001,
        subject: 'First in Queue',
        status: 'open',
        priority: 'medium',
        revision: 1,
        customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
        updated_at: '2026-10-10T10:00:00Z',
      },
    ]

    // Emit live signal for ticket creation
    liveClient.emitSignal({
      event_id: 'signal-created-3',
      organization_id: 1,
      ticket_id: 'ticket-3',
      change_type: 'created',
      revision: 1,
    })

    // 1. Visible rows update in place: ticket-2's status changed to pending, but ticket-1 is STILL the first displayed card
    await waitFor(() => {
      expect(screen.getByTestId('ticket-status-ticket-2')).toHaveTextContent(/pending/i)
      expect(screen.getByTestId('new-activity-btn')).toBeInTheDocument()
    })

    // Assert that the order is HELD: ticket-1 is still the first card rendered, and remains selected
    const rows = screen.getAllByRole('button', { name: /#100/i })
    expect(rows[0]).toHaveAttribute('data-testid', 'ticket-row-ticket-1')
    expect(screen.getByTestId('ticket-row-ticket-1')).toHaveAttribute('aria-pressed', 'true')
    // ticket-3 is not yet displayed in the held order
    expect(screen.queryByTestId('ticket-row-ticket-3')).not.toBeInTheDocument()

    // 2. Click "New activity" to deliberately apply changed queue order
    await user.click(screen.getByTestId('new-activity-btn'))

    // Now ticket-3 is at the top of the queue and the "New activity" button is gone
    await waitFor(() => {
      expect(screen.queryByTestId('new-activity-btn')).not.toBeInTheDocument()
      expect(screen.getByTestId('ticket-row-ticket-3')).toBeInTheDocument()
    })

    const updatedRows = screen.getAllByRole('button', { name: /#100/i })
    expect(updatedRows[0]).toHaveAttribute('data-testid', 'ticket-row-ticket-3')
    // ticket-1 selection remains preserved
    expect(screen.getByTestId('ticket-row-ticket-1')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps selected ticket open with outside-queue-notice when ticket moves outside active preset', async () => {
    const liveClient = createMockLiveClient('connected')
    let ticket1Status = 'open'

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        const list = ticket1Status === 'resolved' ? [] : [
          {
            id: 'ticket-1',
            ticket_number: 1001,
            subject: 'Ticket to Resolve',
            status: ticket1Status,
            priority: 'medium',
            revision: 1,
            customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
          },
        ]
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: list }) })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'Ticket to Resolve',
                status: ticket1Status,
                priority: 'medium',
                revision: ticket1Status === 'resolved' ? 2 : 1,
                customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
                messages: [],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
        initialPreset="all_open"
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Ticket to Resolve')
      expect(screen.queryByTestId('outside-queue-notice')).not.toBeInTheDocument()
    })

    // Ticket is marked resolved on backend and signal arrives
    ticket1Status = 'resolved'
    liveClient.emitSignal({
      event_id: 'sig-resolved',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'status_changed',
      revision: 2,
    })

    // Selected ticket stays open in detail view and displays outside-queue-notice
    await waitFor(() => {
      expect(screen.getByTestId('outside-queue-notice')).toBeInTheDocument()
      expect(screen.getByTestId('outside-queue-notice')).toHaveTextContent('Outside this queue')
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Ticket to Resolve')
    })
  })

  it('replaces detail with unavailable state and clears protected content when ticket is deleted or inaccessible', async () => {
    const liveClient = createMockLiveClient('connected')
    let isDeleted = false

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: isDeleted
                ? []
                : [
                    {
                      id: 'ticket-1',
                      ticket_number: 1001,
                      subject: 'Top Secret Subject',
                      status: 'open',
                      priority: 'high',
                      revision: 1,
                      customer: { id: 'c1', name: 'Secret Customer', email: 'secret@example.com' },
                    },
                  ],
            }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        if (isDeleted) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'Ticket not found' }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'Top Secret Subject',
                status: 'open',
                priority: 'high',
                revision: 1,
                customer: { id: 'c1', name: 'Secret Customer', email: 'secret@example.com' },
                messages: [
                  {
                    id: 'msg-1',
                    body: 'Confidential conversation body',
                    message_type: 'public_reply',
                    author_type: 'Customer',
                    author_name: 'Secret Customer',
                    created_at: '2026-10-10T10:00:00Z',
                  },
                ],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Top Secret Subject')
      expect(screen.getByText('Confidential conversation body')).toBeInTheDocument()
      expect(screen.getByTestId('customer-name')).toHaveTextContent('Secret Customer')
    })

    // Now ticket is deleted
    isDeleted = true
    liveClient.emitSignal({
      event_id: 'sig-del',
      organization_id: 1,
      ticket_id: 'ticket-1',
      change_type: 'deleted',
      revision: 2,
    })

    // Detail replaces content with unavailable state
    await waitFor(() => {
      expect(screen.getByTestId('ticket-unavailable-state')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-unavailable-state')).toHaveTextContent('Ticket unavailable')
    })

    // Crucially: protected content MUST NOT be retained in view!
    expect(screen.queryByText('Top Secret Subject')).not.toBeInTheDocument()
    expect(screen.queryByText('Confidential conversation body')).not.toBeInTheDocument()
    expect(screen.queryByText('secret@example.com')).not.toBeInTheDocument()
    expect(screen.getByTestId('inspector-unavailable')).toHaveTextContent('Ticket unavailable')
    expect(screen.queryByTestId('customer-name')).not.toBeInTheDocument()
  })

  it('displays disconnected status while live delivery is paused and preserves usable REST actions', async () => {
    const user = userEvent.setup()
    const liveClient = createMockLiveClient('disconnected')
    let claimCalled = false

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tickets?')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'ticket-1',
                  ticket_number: 1001,
                  subject: 'Intake Ticket',
                  status: 'new',
                  priority: 'medium',
                  revision: 1,
                  assignment_revision: 1,
                  assigned_member_id: null,
                  customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
                },
              ],
            }),
        })
      }
      if (url.includes('/api/tickets/ticket-1/claim')) {
        claimCalled = true
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
      }
      if (url.includes('/api/tickets/ticket-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: 'ticket-1',
                ticket_number: 1001,
                subject: 'Intake Ticket',
                status: 'new',
                priority: 'medium',
                revision: 1,
                assignment_revision: 1,
                customer: { id: 'c1', name: 'Alice', email: 'alice@example.com' },
                messages: [],
              },
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    })

    render(
      <TicketCockpit.Provider
        apiUrl="http://localhost:8000"
        token="valid-bearer-token"
        liveClient={liveClient}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    )

    // Verify small disconnected status is visible and ticket is loaded
    await waitFor(() => {
      expect(screen.getByTestId('live-status-indicator')).toBeInTheDocument()
      expect(screen.getByTestId('live-status-indicator')).toHaveTextContent('Live delivery paused')
      expect(screen.getByTestId('subrail-disconnected-badge')).toHaveTextContent('Paused')
      expect(screen.getByTestId('claim-ticket-btn')).toBeInTheDocument()
    })

    // REST Ticket actions remain usable during paused live delivery
    const claimBtn = screen.getByTestId('claim-ticket-btn')
    expect(claimBtn).toBeEnabled()
    await user.click(claimBtn)

    await waitFor(() => {
      expect(claimCalled).toBe(true)
    })
  })

  describe('Ticket Viewing Presence (Issue #151)', () => {
    it('displays verified viewers beside selected Ticket header and updates dynamically', async () => {
      const liveClient = createMockLiveClient()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      // Initially no viewers
      expect(screen.queryByTestId('ticket-viewers')).not.toBeInTheDocument()

      // Emit viewers on selected ticket
      liveClient.emitTicketViewers('ticket-1', [
        { member_id: 10, name: 'Alice Agent' },
        { member_id: 11, name: 'Bob Admin' },
      ])

      await waitFor(() => {
        expect(screen.getByTestId('ticket-viewers')).toBeInTheDocument()
        expect(screen.getByTestId('ticket-viewer-10')).toHaveAttribute('title', 'Viewing: Alice Agent')
        expect(screen.getByTestId('ticket-viewer-11')).toHaveAttribute('title', 'Viewing: Bob Admin')
        expect(screen.getByTestId('ticket-viewers-count')).toHaveTextContent('2 viewers')
      })
    })

    it('unsubscribes viewing presence when tab is hidden and resubscribes when visible', async () => {
      const liveClient = createMockLiveClient()
      const subscribeSpy = vi.spyOn(liveClient, 'subscribeToTicketViewers')

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      expect(subscribeSpy).toHaveBeenCalledWith('ticket-1', expect.any(Function))

      // Simulate tab hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Viewers cleared while hidden
      await waitFor(() => {
        expect(screen.queryByTestId('ticket-viewers')).not.toBeInTheDocument()
      })

      // Simulate tab visible again
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(subscribeSpy).toHaveBeenCalledTimes(2)

      // Clean up visibilityState definition
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    })

    it('leaves viewing presence when navigating to another ticket', async () => {
      const liveClient = createMockLiveClient()
      const subscribeSpy = vi.spyOn(liveClient, 'subscribeToTicketViewers')
      const user = userEvent.setup()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          initialTicketNumber={1001}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Queue />
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      expect(subscribeSpy).toHaveBeenCalledWith('ticket-1', expect.any(Function))

      // Switch to ticket-2
      const ticket2Row = screen.getByTestId('ticket-row-ticket-2')
      await user.click(ticket2Row)

      await waitFor(() => {
        expect(subscribeSpy).toHaveBeenCalledWith('ticket-2', expect.any(Function))
      })
    })
  })

  describe('Transient Organization Member Typing Presence (Issue #152)', () => {
    it('displays other verified Organization Members typing cue near composer and clears on expiry or stop', async () => {
      const liveClient = createMockLiveClient()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          currentUserId={2}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      // Initially no typing indicator
      expect(screen.queryByTestId('ticket-typing-indicator')).not.toBeInTheDocument()

      // Other member 10 (Alice Agent) begins typing
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [{ member_id: 10, name: 'Alice Agent' }])
      })

      await waitFor(() => {
        expect(screen.getByTestId('ticket-typing-indicator')).toBeInTheDocument()
        expect(screen.getByTestId('ticket-typing-text')).toHaveTextContent('Alice Agent is typing...')
      })

      // Multiple other members typing
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [
          { member_id: 10, name: 'Alice Agent' },
          { member_id: 11, name: 'Bob Admin' },
        ])
      })

      await waitFor(() => {
        expect(screen.getByTestId('ticket-typing-text')).toHaveTextContent('Alice Agent and Bob Admin are typing...')
      })

      // Typing cleared / stopped
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [])
      })

      await waitFor(() => {
        expect(screen.queryByTestId('ticket-typing-indicator')).not.toBeInTheDocument()
      })
    })

    it('strictly omits current member own typing from their view', async () => {
      const liveClient = createMockLiveClient()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          currentUserId={2}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      // Current member (member_id 2) emitted as typing
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [{ member_id: 2, name: 'Acme Agent' }])
      })

      // Own typing must strictly NOT be shown
      expect(screen.queryByTestId('ticket-typing-indicator')).not.toBeInTheDocument()

      // If both current member and another member are typing, only the other member is shown
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [
          { member_id: 2, name: 'Acme Agent' },
          { member_id: 10, name: 'Alice Agent' },
        ])
      })

      await waitFor(() => {
        expect(screen.getByTestId('ticket-typing-indicator')).toBeInTheDocument()
        expect(screen.getByTestId('ticket-typing-text')).toHaveTextContent('Alice Agent is typing...')
      })
    })

    it('sends boolean typing state while typing and stops sending when departing ticket or tab is hidden', async () => {
      const liveClient = createMockLiveClient()
      const sendTypingSpy = vi.spyOn(liveClient, 'sendTicketTyping')
      const user = userEvent.setup()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          initialTicketNumber={1001}
          currentUserId={2}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Queue />
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      const textarea = screen.getByTestId('composer-textarea')
      await user.type(textarea, 'Working on this issue now')

      // Typing state true is sent
      expect(sendTypingSpy).toHaveBeenCalledWith('ticket-1', true)

      // Switch to ticket-2 (ticket departure)
      const ticket2Row = screen.getByTestId('ticket-row-ticket-2')
      await user.click(ticket2Row)

      await waitFor(() => {
        // Departed ticket sends typing false
        expect(sendTypingSpy).toHaveBeenCalledWith('ticket-1', false)
      })

      // Tab hidden stops sending typing
      await user.type(screen.getByTestId('composer-textarea'), 'Now typing on ticket 2')
      expect(sendTypingSpy).toHaveBeenCalledWith('ticket-2', true)

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))

      await waitFor(() => {
        expect(sendTypingSpy).toHaveBeenCalledWith('ticket-2', false)
      })

      // Restore visibilityState
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    it('stops sending typing state on composer submission', async () => {
      const liveClient = createMockLiveClient()
      const sendTypingSpy = vi.spyOn(liveClient, 'sendTicketTyping')
      const user = userEvent.setup()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          currentUserId={2}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      const textarea = screen.getByTestId('composer-textarea')
      await user.type(textarea, 'Ready for customer response')
      expect(sendTypingSpy).toHaveBeenCalledWith('ticket-1', true)

      // Submit composer
      const submitBtn = screen.getByTestId('composer-submit-btn')
      await user.click(submitBtn)

      await waitFor(() => {
        expect(sendTypingSpy).toHaveBeenCalledWith('ticket-1', false)
      })
    })

    it('maintains quiet focus and accessible screen-reader role when typing cue appears', async () => {
      const liveClient = createMockLiveClient()
      const user = userEvent.setup()

      render(
        <TicketCockpit.Provider
          tickets={INITIAL_MOCK_TICKETS}
          selectedTicketId="ticket-1"
          currentUserId={2}
          liveClient={liveClient}
        >
          <TicketCockpit.Frame>
            <TicketCockpit.Detail />
          </TicketCockpit.Frame>
        </TicketCockpit.Provider>
      )

      const textarea = screen.getByTestId('composer-textarea')
      await user.click(textarea)
      expect(document.activeElement).toBe(textarea)

      // Incoming typing from another member
      act(() => {
        liveClient.emitTicketTyping('ticket-1', [{ member_id: 10, name: 'Alice Agent' }])
      })

      await waitFor(() => {
        const indicator = screen.getByTestId('ticket-typing-indicator')
        expect(indicator).toBeInTheDocument()
        expect(indicator).toHaveAttribute('role', 'status')
        expect(indicator).toHaveAttribute('aria-live', 'polite')
      })

      // Focus was NOT stolen or interrupted; remains quietly on the textarea
      expect(document.activeElement).toBe(textarea)
    })
  })
})
