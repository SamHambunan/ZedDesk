import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SystemHealthPill } from './SystemHealthPill'
import { PendingInvitesBanner } from './PendingInvitesBanner'
import { OrganizationCard } from './OrganizationCard'
import { OrganizationGrid } from './OrganizationGrid'
import { CentralHubHeader } from './CentralHubHeader'
import { UserProfileCard } from './UserProfileCard'

describe('Hub Components (Seam 1)', () => {
  describe('SystemHealthPill', () => {
    it('renders default operational health indicator with pulse beacon', () => {
      render(<SystemHealthPill />)
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument()
      expect(screen.getByTestId('health-beacon')).toHaveClass('bg-sentiment-positive')
    })

    it('renders degraded status when specified', () => {
      render(<SystemHealthPill status="degraded" label="Systems Degraded" />)
      expect(screen.getByText('Systems Degraded')).toBeInTheDocument()
      expect(screen.getByTestId('health-beacon')).toHaveClass('bg-sentiment-warning')
    })
  })

  describe('PendingInvitesBanner', () => {
    it('renders nothing when invitations list is empty', () => {
      const { container } = render(<PendingInvitesBanner invitations={[]} />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders invitation alert banner and responds to accept and decline actions', async () => {
      const user = userEvent.setup()
      const handleAccept = vi.fn()
      const handleDecline = vi.fn()
      const invitations = [
        {
          id: 1,
          organizationName: 'Globex Corp',
          role: 'agent',
          token: 'inv-tok-123',
        },
      ]

      render(
        <PendingInvitesBanner
          invitations={invitations}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      )

      expect(screen.getByText(/1 Invitation Pending/i)).toBeInTheDocument()
      expect(screen.getByText(/Globex Corp/i)).toBeInTheDocument()

      const acceptBtn = screen.getByRole('button', { name: /^accept$/i })
      const declineBtn = screen.getByRole('button', { name: /^decline$/i })

      await user.click(acceptBtn)
      expect(handleAccept).toHaveBeenCalledWith(invitations[0])

      await user.click(declineBtn)
      expect(handleDecline).toHaveBeenCalledWith(invitations[0])
    })

    it('renders dismissible Cadmium Amber alert banner and calls onDismiss when dismissed', async () => {
      const user = userEvent.setup()
      const handleDismiss = vi.fn()
      const invitations = [
        {
          id: 1,
          organizationName: 'Globex Corp',
          role: 'agent',
          token: 'inv-tok-123',
        },
      ]

      render(
        <PendingInvitesBanner
          invitations={invitations}
          onDismiss={handleDismiss}
        />
      )

      const banner = screen.getByRole('region', { name: /pending invitations/i })
      expect(banner.className).toMatch(/sentiment-warning|F59E0B/)

      const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
      await user.click(dismissBtn)
      expect(handleDismiss).toHaveBeenCalledTimes(1)
    })
  })

  describe('OrganizationCard', () => {
    it('renders admin organization card with Amethyst Violet role badge and tabular figures', async () => {
      const user = userEvent.setup()
      const handleLaunch = vi.fn()
      const org = {
        id: 1,
        name: 'Acme Support',
        slug: 'acme',
        role: 'admin',
        agentsCount: 14,
      }

      render(<OrganizationCard organization={org} onLaunch={handleLaunch} />)

      expect(screen.getByText('Acme Support')).toBeInTheDocument()
      expect(screen.getByText('acme.zeddesk.app')).toBeInTheDocument()
      
      const countEl = screen.getByText('14')
      expect(countEl).toBeInTheDocument()
      expect(countEl.className).toContain('tabular-nums')

      // Admin role badge in Amethyst Violet
      const roleBadge = screen.getByText(/admin/i)
      expect(roleBadge).toBeInTheDocument()
      expect(roleBadge.className).toContain('8B5CF6')

      // Launch Workspace button
      const launchBtn = screen.getByRole('button', { name: /launch workspace/i })
      await user.click(launchBtn)
      expect(handleLaunch).toHaveBeenCalledWith(org)
    })

    it('renders agent organization card with Tactical Graphite badge', () => {
      const org = {
        id: 2,
        name: 'Cyberdyne Systems',
        slug: 'cyberdyne',
        role: 'agent',
        agentsCount: 8,
      }

      render(<OrganizationCard organization={org} />)
      expect(screen.getByText('Cyberdyne Systems')).toBeInTheDocument()
      expect(screen.getByText('cyberdyne.zeddesk.app')).toBeInTheDocument()
      const roleBadge = screen.getByText(/^agent$/i)
      expect(roleBadge).toBeInTheDocument()
      // Tactical Graphite styling
      expect(roleBadge.className).toMatch(/282A33|1E2026|border|neutral/)
    })

    it('navigates cleanly to http://{slug}.localhost:5173/overview on Launch Workspace click when onLaunch is not provided', async () => {
      const user = userEvent.setup()
      const originalLocation = window.location
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          href: 'http://localhost:5173',
          hostname: 'localhost',
          port: '5173',
          protocol: 'http:',
        },
        writable: true,
        configurable: true,
      })

      try {
        const org = {
          id: 1,
          name: 'Acme Support',
          slug: 'acme',
          role: 'admin',
          agentsCount: 14,
        }

        render(<OrganizationCard organization={org} />)

        const launchBtn = screen.getByRole('button', { name: /launch workspace/i })
        await user.click(launchBtn)

        expect(window.location.href).toBe('http://acme.localhost:5173/overview')
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        })
      }
    })
  })

  describe('OrganizationGrid', () => {
    it('renders empty state when organizations list is empty', () => {
      render(<OrganizationGrid organizations={[]} />)
      expect(screen.getByText(/no workspaces found/i)).toBeInTheDocument()
    })

    it('renders responsive grid with organization cards and create new organization trigger', async () => {
      const user = userEvent.setup()
      const handleCreateNew = vi.fn()
      const orgs = [
        { id: 1, name: 'Org One', slug: 'org-one', role: 'admin', agentsCount: 5 },
        { id: 2, name: 'Org Two', slug: 'org-two', role: 'agent', agentsCount: 3 },
      ]

      const { container } = render(
        <OrganizationGrid
          organizations={orgs}
          onCreateNew={handleCreateNew}
        />
      )

      expect(screen.getByText('Org One')).toBeInTheDocument()
      expect(screen.getByText('Org Two')).toBeInTheDocument()

      const gridContainer = container.querySelector('[data-testid="org-grid-list"]')
      if (gridContainer) {
        expect(gridContainer.className).toMatch(/grid/)
      }

      const createBtn = screen.getByRole('button', { name: /create new organization/i })
      await user.click(createBtn)
      expect(handleCreateNew).toHaveBeenCalled()
    })
  })

  describe('CentralHubHeader', () => {
    it('renders branding with AI indicator and system health pill', () => {
      render(<CentralHubHeader />)
      expect(screen.getByText('ZedDesk')).toBeInTheDocument()
      expect(screen.getByText('AI')).toBeInTheDocument()
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument()
    })
  })

  describe('UserProfileCard', () => {
    it('renders user details and triggers onLogout', async () => {
      const user = userEvent.setup()
      const handleLogout = vi.fn()
      const currentUser = {
        name: 'Alex Vance',
        email: 'alex.vance@example.com',
        roleTitle: 'System Administrator',
      }

      render(<UserProfileCard user={currentUser} onLogout={handleLogout} />)

      expect(screen.getByText('Alex Vance')).toBeInTheDocument()
      expect(screen.getByText('alex.vance@example.com')).toBeInTheDocument()
      expect(screen.getByText('System Administrator')).toBeInTheDocument()

      const logoutBtn = screen.getByRole('button', { name: /log out/i })
      await user.click(logoutBtn)
      expect(handleLogout).toHaveBeenCalled()
    })
  })
})
