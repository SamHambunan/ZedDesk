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
  })

  describe('OrganizationCard', () => {
    it('renders admin organization card with violet pill and [slug].zeddesk.app', async () => {
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
      expect(screen.getByText('14')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()

      // Admin role badge
      const rolePill = screen.getByText(/admin/i)
      expect(rolePill).toBeInTheDocument()

      // Launch Workspace button
      const launchBtn = screen.getByRole('button', { name: /launch workspace/i })
      await user.click(launchBtn)
      expect(handleLaunch).toHaveBeenCalledWith(org)
    })

    it('renders agent organization card with indigo pill', () => {
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
      expect(screen.getByText(/^agent$/i)).toBeInTheDocument()
    })
  })

  describe('OrganizationGrid', () => {
    it('renders organization cards and create new organization trigger', async () => {
      const user = userEvent.setup()
      const handleCreateNew = vi.fn()
      const orgs = [
        { id: 1, name: 'Org One', slug: 'org-one', role: 'admin', agentsCount: 5 },
        { id: 2, name: 'Org Two', slug: 'org-two', role: 'agent', agentsCount: 3 },
      ]

      render(
        <OrganizationGrid
          organizations={orgs}
          onCreateNew={handleCreateNew}
        />
      )

      expect(screen.getByText('Org One')).toBeInTheDocument()
      expect(screen.getByText('Org Two')).toBeInTheDocument()

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
