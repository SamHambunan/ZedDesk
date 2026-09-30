import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CentralHubSwitchboard } from './components/hub/CentralHubSwitchboard'
import App from './App'

describe('CentralHubSwitchboard (Ticket #93)', () => {
  const mockOrgs = [
    { id: 1, name: 'Acme Support', slug: 'acme', role: 'admin', agentsCount: 14 },
    { id: 2, name: 'Cyberdyne Systems', slug: 'cyberdyne', role: 'agent', agentsCount: 8 },
    { id: 3, name: 'Stark Industries', slug: 'stark', role: 'agent', agentsCount: 22 },
  ]

  const mockInvitations = [
    {
      id: 101,
      organizationName: 'Wayne Enterprises',
      role: 'agent',
      token: 'inv-tok-101',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('40px Flush Table Geometry & Column Alignment', () => {
    it('renders 40px flush table displaying user organizations with status beacon, org name, mono slug badge, tabular member count, and role pill', () => {
      const onLaunch = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={onLaunch}
        />
      )

      expect(screen.getByTestId('central-hub-switchboard')).toBeInTheDocument()

      // Assert table headers
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Organization')).toBeInTheDocument()
      expect(screen.getByText('Subdomain Slug')).toBeInTheDocument()
      expect(screen.getByText('Members')).toBeInTheDocument()
      expect(screen.getByText('Role')).toBeInTheDocument()
      expect(screen.getByText('Dispatch')).toBeInTheDocument()

      // Row 1: Acme Support (admin)
      const acmeRow = screen.getByTestId('workspace-row-acme')
      expect(acmeRow).toBeInTheDocument()
      expect(acmeRow.className).toContain('h-10')

      // Status Beacon
      const acmeBeacon = within(acmeRow).getByTestId('status-beacon')
      expect(acmeBeacon).toBeInTheDocument()
      expect(within(acmeRow).getByText(/active/i)).toBeInTheDocument()

      // Org Name
      expect(within(acmeRow).getByText('Acme Support')).toBeInTheDocument()

      // JetBrains Mono Subdomain Badge
      const acmeSlugBadge = within(acmeRow).getByText('acme.zeddesk.app')
      expect(acmeSlugBadge).toBeInTheDocument()
      expect(acmeSlugBadge.className).toContain('font-[')

      // Tabular Member Count
      const acmeMembers = within(acmeRow).getByText('14 members')
      expect(acmeMembers).toBeInTheDocument()
      expect(acmeMembers.className).toContain('tabular-nums')

      // Role Pill (admin in Amethyst Violet)
      const adminPill = within(acmeRow).getByText('admin')
      expect(adminPill).toBeInTheDocument()
      expect(adminPill.className).toMatch(/8B5CF6|admin/)

      // Row 2: Cyberdyne Systems (agent in Tactical Graphite)
      const cyberdyneRow = screen.getByTestId('workspace-row-cyberdyne')
      expect(cyberdyneRow.className).toContain('h-10')
      expect(within(cyberdyneRow).getByText('Cyberdyne Systems')).toBeInTheDocument()
      expect(within(cyberdyneRow).getByText('cyberdyne.zeddesk.app')).toBeInTheDocument()
      expect(within(cyberdyneRow).getByText('8 members')).toBeInTheDocument()

      const agentPill = within(cyberdyneRow).getByText('agent')
      expect(agentPill).toBeInTheDocument()
      expect(agentPill.className).toMatch(/border|agent/)

      // Dispatch button
      expect(within(acmeRow).getByRole('button', { name: /launch workspace for acme support/i })).toBeInTheDocument()
    })

    it('clicking on a row or dispatch button triggers onLaunch with target organization', async () => {
      const user = userEvent.setup()
      const onLaunch = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={onLaunch}
        />
      )

      // Click row
      await user.click(screen.getByTestId('workspace-row-cyberdyne'))
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[1])

      // Click dispatch button directly
      const acmeLaunchBtn = screen.getByRole('button', { name: /launch workspace for acme support/i })
      await user.click(acmeLaunchBtn)
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[0])
    })
  })

  describe('Instant Search Input & Keyboard Focus Shortcut (/)', () => {
    it('focuses search input when pressing "/" anywhere on the page', async () => {
      const user = userEvent.setup()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={vi.fn()}
        />
      )

      const searchInput = screen.getByPlaceholderText(/press \/ to filter/i)
      expect(searchInput).not.toHaveFocus()

      // Press "/" key globally
      await user.keyboard('/')
      expect(searchInput).toHaveFocus()
    })

    it('does not hijack focus or prevent default when "/" is typed in another input field', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <input data-testid="other-input" type="text" />
          <CentralHubSwitchboard
            organizations={mockOrgs}
            onLaunch={vi.fn()}
          />
        </div>
      )

      const otherInput = screen.getByTestId('other-input')
      const searchInput = screen.getByPlaceholderText(/press \/ to filter/i)

      otherInput.focus()
      expect(otherInput).toHaveFocus()

      await user.keyboard('/hello')
      expect(otherInput).toHaveValue('/hello')
      expect(otherInput).toHaveFocus()
      expect(searchInput).not.toHaveFocus()
    })

    it('filters organizations dynamically by name or subdomain slug', async () => {
      const user = userEvent.setup()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={vi.fn()}
        />
      )

      expect(screen.getByTestId('workspace-row-acme')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-cyberdyne')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-stark')).toBeInTheDocument()

      const searchInput = screen.getByPlaceholderText(/press \/ to filter/i)

      // Filter by name
      await user.type(searchInput, 'Cyber')
      expect(screen.queryByTestId('workspace-row-acme')).not.toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-cyberdyne')).toBeInTheDocument()
      expect(screen.queryByTestId('workspace-row-stark')).not.toBeInTheDocument()

      // Filter by slug
      await user.clear(searchInput)
      await user.type(searchInput, 'stark')
      expect(screen.queryByTestId('workspace-row-acme')).not.toBeInTheDocument()
      expect(screen.queryByTestId('workspace-row-cyberdyne')).not.toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-stark')).toBeInTheDocument()

      // Empty query shows all
      await user.clear(searchInput)
      expect(screen.getByTestId('workspace-row-acme')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-cyberdyne')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-row-stark')).toBeInTheDocument()

      // No match shows empty message
      await user.type(searchInput, 'nonexistent')
      expect(screen.getByText(/no workspaces matched your query/i)).toBeInTheDocument()
    })
  })

  describe('Enter Key Launch in Search Input', () => {
    it('pressing Enter in the search input directly launches the top filtered workspace', async () => {
      const user = userEvent.setup()
      const onLaunch = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={onLaunch}
        />
      )

      const searchInput = screen.getByPlaceholderText(/press \/ to filter/i)
      await user.click(searchInput)

      // Filter to Stark
      await user.type(searchInput, 'Stark')
      expect(screen.getByTestId('workspace-row-stark')).toBeInTheDocument()

      // Press Enter in search input
      await user.keyboard('{Enter}')
      expect(onLaunch).toHaveBeenCalledTimes(1)
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[2]) // Stark Industries
    })

    it('pressing Enter launches the highlighted workspace when navigated with arrow keys', async () => {
      const user = userEvent.setup()
      const onLaunch = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onLaunch={onLaunch}
        />
      )

      const searchInput = screen.getByPlaceholderText(/press \/ to filter/i)
      await user.click(searchInput)

      // Press ArrowDown to select index 1 (Cyberdyne)
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      expect(onLaunch).toHaveBeenCalledTimes(1)
      expect(onLaunch).toHaveBeenCalledWith(mockOrgs[1]) // Cyberdyne
    })
  })

  describe('Persistent Cadmium Amber Alert Banner', () => {
    it('renders persistent Cadmium Amber alert banner at the top displaying pending invitations awaiting user acceptance', async () => {
      const user = userEvent.setup()
      const onAcceptInvite = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          invitations={mockInvitations}
          onLaunch={vi.fn()}
          onAcceptInvite={onAcceptInvite}
        />
      )

      const banner = screen.getByTestId('switchboard-pending-invites-banner')
      expect(banner).toBeInTheDocument()
      expect(banner.className).toMatch(/F59E0B/)
      expect(within(banner).getByText(/1 workspace invitation awaiting acceptance/i)).toBeInTheDocument()
      expect(within(banner).getByText('Wayne Enterprises')).toBeInTheDocument()

      // Accept invite
      const acceptBtn = within(banner).getByRole('button', { name: /accept/i })
      await user.click(acceptBtn)
      expect(onAcceptInvite).toHaveBeenCalledWith(mockInvitations[0])
    })

    it('does not render banner when invitations list is empty', () => {
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          invitations={[]}
          onLaunch={vi.fn()}
        />
      )

      expect(screen.queryByTestId('switchboard-pending-invites-banner')).not.toBeInTheDocument()
    })
  })

  describe('+ New Workspace Tactile Compound Modal with Live Kebab-Slug Generation', () => {
    it('opens tactile compound modal on "+ New Workspace" click with live kebab-slug generation', async () => {
      const user = userEvent.setup()
      const onCreateWorkspace = vi.fn()
      render(
        <CentralHubSwitchboard
          organizations={mockOrgs}
          onCreateWorkspace={onCreateWorkspace}
          onLaunch={vi.fn()}
        />
      )

      // Modal closed initially
      expect(screen.queryByRole('dialog', { name: /create new organization/i })).not.toBeInTheDocument()

      // Click + New Workspace button
      const newWorkspaceBtn = screen.getByRole('button', { name: /\+ new workspace/i })
      await user.click(newWorkspaceBtn)

      // Modal open
      const modal = screen.getByRole('dialog', { name: /create new organization/i })
      expect(modal).toBeInTheDocument()

      const orgNameInput = within(modal).getByLabelText(/organization name/i)
      const slugInput = within(modal).getByLabelText(/workspace subdomain url/i)

      // Live kebab-slug generation
      await user.type(orgNameInput, 'Gotham City Police')
      expect(slugInput).toHaveValue('gotham-city-police')
      expect(within(modal).getByText('https://gotham-city-police.zeddesk.app')).toBeInTheDocument()

      // Submit modal
      const submitBtn = within(modal).getByRole('button', { name: /create organization & launch/i })
      await user.click(submitBtn)

      expect(onCreateWorkspace).toHaveBeenCalledWith({
        name: 'Gotham City Police',
        slug: 'gotham-city-police',
      })
    })
  })

  describe('Live Wiring in App.tsx & Deprecated Harness Purge', () => {
    it('wires into App.tsx apex domain view and permanently purges floating cards and legacy sr-only select box', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
          } as Response)
        }
        if (url.endsWith('/api/organizations')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 1, name: 'Acme Support', slug: 'acme', role: 'admin', agents_count: 14 },
            ],
          } as Response)
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      localStorage.setItem('zeddesk_token', 'valid-test-token')
      localStorage.setItem(
        'zeddesk_user',
        JSON.stringify({ id: 1, name: 'Alex Vance', email: 'alex@example.com' })
      )

      render(<App />)

      // Switchboard is rendered
      await waitFor(() => {
        expect(screen.getByTestId('central-hub-switchboard')).toBeInTheDocument()
        expect(screen.getByTestId('workspace-row-acme')).toBeInTheDocument()
      })

      // Deprecated elements are PERMANENTLY PURGED from the DOM
      expect(screen.queryByTestId('org-grid-list')).not.toBeInTheDocument()
      expect(document.getElementById('org-select')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /select organization/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /navigate to subdomain/i })).not.toBeInTheDocument()
    })
  })
})
