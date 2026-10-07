import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceOverview } from './components/overview/WorkspaceOverview'
import { TicketQueueView } from './components/tickets/TicketQueueView'
import { CustomerPortalReplyComposer } from './components/portal/CustomerPortalReplyComposer'
import { PortalTicketClosedBanner } from './components/portal/PortalTicketClosedBanner'
import App from './App'
import apiClient from './lib/api-client'
import { queryClient } from './lib/query-client'
import type { OverviewTicket } from './components/overview/types'
import type { TicketItem } from './components/tickets/types'

describe('Stage 2 Rollup Verification Gate (Ticket #107)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    queryClient.clear()
  })

  describe('Triage Queue Bridge -> Tickets Routing & Claim Mutation', () => {
    const mockOverviewTickets: OverviewTicket[] = [
      {
        id: 'uuid-101',
        ticket_number: 101,
        subject: 'Database connection pool exhausted during peak',
        priority: 'urgent',
        status: 'open',
        customer: { name: 'Acme Payments', email: 'billing@acme.com' },
        wait_time: '8m wait',
        assigned_member_id: null,
      },
      {
        id: 'uuid-102',
        ticket_number: 102,
        subject: 'SAML SSO certificate expiration warning',
        priority: 'high',
        status: 'open',
        customer: { name: 'Enterprise Corp', email: 'sso@enterprise.com' },
        wait_time: '24m wait',
        assigned_member_id: null,
      },
      {
        id: 'uuid-103',
        ticket_number: 103,
        subject: 'Typo in customer receipt email template',
        priority: 'low',
        status: 'open',
        customer: { name: 'Retail Store', email: 'support@retail.com' },
        wait_time: '1h wait',
        assigned_member_id: null,
      },
    ]

    it('clicking "View Full Triage Queue" on /overview navigates to /tickets with "Unassigned" preset active', () => {
      const handleNavigate = vi.fn()

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Ops', slug: 'acme' }}
          subdomain="acme"
          role="agent"
          teams={[{ id: 1, name: 'Tier 1 Support', capacity_percentage: 50, members: [{ id: 1 }] }]}
          members={[{ id: 1 }]}
          tickets={mockOverviewTickets}
          onNavigate={handleNavigate}
        />
      )

      // Bridge renders counters
      expect(screen.getByTestId('counter-unassigned')).toHaveTextContent('3')

      // View full triage queue button
      const viewAllLink = screen.getByTestId('view-all-tickets-link')
      expect(viewAllLink).toBeInTheDocument()

      fireEvent.click(viewAllLink)

      expect(handleNavigate).toHaveBeenCalledWith('tickets?preset=unassigned')
    })

    it('clicking "Claim & Route" dispatches claim, decrements unassigned counter, and navigates directly to /tickets/:ticketNumber', async () => {
      const handleClaim = vi.fn().mockResolvedValue(undefined)
      const handleNavigate = vi.fn()

      render(
        <WorkspaceOverview
          organization={{ id: 1, name: 'Acme Ops', slug: 'acme' }}
          subdomain="acme"
          role="agent"
          teams={[{ id: 1, name: 'Tier 1 Support', capacity_percentage: 50, members: [{ id: 1 }] }]}
          members={[{ id: 1 }]}
          tickets={mockOverviewTickets}
          onClaimTicket={handleClaim}
          onNavigate={handleNavigate}
        />
      )

      // Initial unassigned count
      expect(screen.getByTestId('counter-unassigned')).toHaveTextContent('3')

      // Click Claim & Route on ticket #101
      const claimButton = screen.getByTestId('claim-button-uuid-101')
      expect(claimButton).toBeInTheDocument()

      fireEvent.click(claimButton)

      await waitFor(() => {
        expect(handleClaim).toHaveBeenCalledWith('uuid-101')
      })

      // Unassigned counter immediately decrements from 3 to 2
      expect(screen.getByTestId('counter-unassigned')).toHaveTextContent('2')

      // Navigates directly into /tickets/101
      expect(handleNavigate).toHaveBeenCalledWith('tickets/101')
    })
  })

  describe('TicketCockpit Compound Sub-Rail Preset & Hydration', () => {
    const mockCockpitTickets: TicketItem[] = [
      {
        id: 't-101',
        organization_id: 1,
        ticket_number: 101,
        subject: 'Production Outage: Payment Gateway Down',
        status: 'open',
        priority: 'urgent',
        customer: { id: 'cust-1', name: 'Acme Corp', email: 'acme@example.com' },
        assigned_team_id: null,
        assigned_member_id: null,
        tags: [],
        messages: [],
        assignments: [],
        created_at: '2026-10-01T08:00:00Z',
        updated_at: '2026-10-01T08:00:00Z',
      },
      {
        id: 't-102',
        organization_id: 1,
        ticket_number: 102,
        subject: 'Billing question about annual invoice',
        status: 'open',
        priority: 'low',
        customer: { id: 'cust-2', name: 'Globex', email: 'globex@example.com' },
        assigned_team_id: 1,
        assigned_member_id: 2,
        tags: [],
        messages: [],
        assignments: [],
        created_at: '2026-10-01T09:00:00Z',
        updated_at: '2026-10-01T09:00:00Z',
      },
    ]

    it('activates "Unassigned" preset tab when initialPreset="unassigned" is supplied', () => {
      render(
        <TicketQueueView
          tickets={mockCockpitTickets}
          initialPreset="unassigned"
          userRole="agent"
          currentUserId={2}
        />
      )

      // Unassigned tab button should have active styling
      const unassignedBtn = screen.getByTestId('preset-btn-unassigned')
      expect(unassignedBtn).toBeInTheDocument()
      expect(unassignedBtn.className).toContain('border-[#F59E0B]')
    })

    it('hydrates and selects targeted ticket in detail pane when initialTicketNumber is passed', () => {
      render(
        <TicketQueueView
          tickets={mockCockpitTickets}
          initialTicketNumber={101}
          userRole="agent"
          currentUserId={2}
        />
      )

      // Detail pane renders subject of ticket #101
      expect(screen.getByTestId('detail-subject')).toHaveTextContent('Production Outage: Payment Gateway Down')
    })
  })

  describe('Customer Portal Public Thread & Closed Lockout Verification', () => {
    it('renders dedicated CustomerPortalReplyComposer variant for active tickets', () => {
      const onSubmit = vi.fn()
      render(
        <CustomerPortalReplyComposer
          ticketUuid="uuid-101"
          onSubmitReply={onSubmit}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('customer-portal-reply-composer')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Send Reply/i })).toBeInTheDocument()
      // Agent-only next-status dropdown is strictly omitted from customer portal composer
      expect(screen.queryByTestId('next-status-select')).not.toBeInTheDocument()
    })

    it('renders explicit PortalTicketClosedBanner variant when ticket is closed', () => {
      render(<PortalTicketClosedBanner ticketNumber={2002} />)

      expect(screen.getByTestId('portal-ticket-closed-banner')).toBeInTheDocument()
      expect(screen.getByText('This ticket is closed')).toBeInTheDocument()
      // Reply composer is omitted
      expect(screen.queryByTestId('customer-portal-reply-composer')).not.toBeInTheDocument()
    })
  })

  describe('App.tsx Workspace Routing Integration', () => {
    it('renders WorkspaceOverview on /overview route and switches to TicketQueueView on /tickets?preset=unassigned', async () => {
      // Mock workspace endpoint
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/workspace')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              organization: { id: 1, name: 'Acme Test Corp', slug: 'acme' },
              role: 'admin',
              user: { id: 1, name: 'Admin User', email: 'admin@acme.com' },
            }),
          } as Response)
        }
        if (url.includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ teams: [{ id: 1, name: 'Support', members: [{ id: 1 }] }] }),
          } as Response)
        }
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: [] }),
          } as Response)
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ members: [{ id: 1, user_id: 1, role: 'admin' }] }),
          } as Response)
        }
        if (url.includes('/api/invitations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ invitations: [] }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response)
      })

      // Seed authenticated session in localStorage
      localStorage.setItem('zeddesk_token', 'test-valid-bearer-token')
      localStorage.setItem(
        'zeddesk_user',
        JSON.stringify({ id: 1, name: 'Admin User', email: 'admin@acme.com' })
      )

      // Render App on acme.localhost:5173/overview
      render(
        <App
          hostname="acme.localhost:5173"
          pathname="/overview"
        />
      )

      // WorkspaceOverview console should render
      await waitFor(() => {
        expect(screen.getByTestId('workspace-overview')).toBeInTheDocument()
      })

      // View Full Triage Queue button is present
      const triageLink = screen.getByTestId('view-all-tickets-link')
      expect(triageLink).toBeInTheDocument()

      // Click to route into tickets
      fireEvent.click(triageLink)

      // TicketQueueView becomes active
      await waitFor(() => {
        expect(screen.getByTestId('tickets-queue-view')).toBeInTheDocument()
      })
    })

    it('clicking "Claim & Route" on overview navigates to /tickets/:ticketNumber and renders ticket detail in App', async () => {
      // Mock endpoints with an unassigned ticket
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/workspace')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              organization: { id: 1, name: 'Acme Test Corp', slug: 'acme' },
              role: 'admin',
              user: { id: 1, name: 'Admin User', email: 'admin@acme.com' },
            }),
          } as Response)
        }
        if (url.includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ teams: [{ id: 1, name: 'Support', members: [{ id: 1 }] }] }),
          } as Response)
        }
        if (url.includes('/api/tickets/claim') || (url.includes('/claim') && options?.method === 'POST')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: 'Ticket claimed successfully.',
              data: { id: 'uuid-101', ticket_number: 101, subject: 'Payment Gateway Issue' },
            }),
          } as Response)
        }
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  id: 'uuid-101',
                  ticket_number: 101,
                  subject: 'Payment Gateway Issue',
                  status: 'open',
                  priority: 'urgent',
                  assigned_member_id: null,
                },
              ],
            }),
          } as Response)
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ members: [{ id: 1, user_id: 1, role: 'admin' }] }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response)
      })

      vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'uuid-101',
                  ticket_number: 101,
                  subject: 'Payment Gateway Issue',
                  status: 'open',
                  priority: 'urgent',
                  assigned_member_id: null,
                },
              ],
            },
          } as any)
        }
        return Promise.resolve({ data: {} } as any)
      })

      vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
        if (url.includes('/claim')) {
          return Promise.resolve({
            data: {
              message: 'Ticket claimed successfully.',
              data: { id: 'uuid-101', ticket_number: 101, subject: 'Payment Gateway Issue' },
            },
          } as any)
        }
        return Promise.resolve({ data: {} } as any)
      })

      localStorage.setItem('zeddesk_token', 'test-valid-bearer-token')
      localStorage.setItem(
        'zeddesk_user',
        JSON.stringify({ id: 1, name: 'Admin User', email: 'admin@acme.com' })
      )

      render(
        <App
          hostname="acme.localhost:5173"
          pathname="/overview"
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('workspace-overview')).toBeInTheDocument()
      })

      // Claim button for ticket 101
      await waitFor(() => {
        expect(screen.getByTestId('claim-button-uuid-101')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('claim-button-uuid-101'))

      // Navigates into tickets view
      await waitFor(() => {
        expect(screen.getByTestId('tickets-queue-view')).toBeInTheDocument()
      })
    })
  })
})
