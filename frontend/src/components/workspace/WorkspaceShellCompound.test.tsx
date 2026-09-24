import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell, useWorkspaceShell } from './WorkspaceShell'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function ConsumerComponent() {
  const context = useWorkspaceShell()
  return (
    <div data-testid="consumer-info">
      <span data-testid="consumer-org">{context.organization.name}</span>
      <span data-testid="consumer-role">{context.role}</span>
      <span data-testid="consumer-collapsed">{context.isSidebarCollapsed ? 'collapsed' : 'expanded'}</span>
      <button data-testid="consumer-toggle" onClick={context.toggleSidebar}>
        Toggle
      </button>
    </div>
  )
}

describe('WorkspaceShell Compound Components', () => {
  const originalFetch = global.fetch
  let testQueryClient: QueryClient

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    testQueryClient = createTestQueryClient()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('exposes compound component sub-parts (Provider, Root, Header, Sidebar, Main)', () => {
    expect(WorkspaceShell.Provider).toBeDefined()
    expect(WorkspaceShell.Root).toBeDefined()
    expect(WorkspaceShell.Header).toBeDefined()
    expect(WorkspaceShell.Sidebar).toBeDefined()
    expect(WorkspaceShell.Main).toBeDefined()
  })

  it('shares sidebar collapse state and active tenant context via useWorkspaceShell hook', () => {
    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceShell.Provider
          subdomain="acme"
          token="test-token"
          organization={{ id: 1, name: 'Acme Corp', slug: 'acme' }}
          user={{ id: 42, name: 'Alice Admin', email: 'alice@acme.test' }}
          role="admin"
        >
          <ConsumerComponent />
        </WorkspaceShell.Provider>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('consumer-org')).toHaveTextContent('Acme Corp')
    expect(screen.getByTestId('consumer-role')).toHaveTextContent('admin')
    expect(screen.getByTestId('consumer-collapsed')).toHaveTextContent('expanded')

    fireEvent.click(screen.getByTestId('consumer-toggle'))
    expect(screen.getByTestId('consumer-collapsed')).toHaveTextContent('collapsed')
  })

  it('renders complete compound structure with custom slotted children and responds to sidebar toggling', () => {
    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceShell.Provider
          subdomain="acme"
          token="test-token"
          organization={{ id: 1, name: 'Acme Corp', slug: 'acme' }}
          user={{ id: 42, name: 'Alice Admin', email: 'alice@acme.test' }}
          role="admin"
        >
          <WorkspaceShell.Root>
            <WorkspaceShell.Header />
            <div className="flex flex-1 pt-[64px]">
              <WorkspaceShell.Sidebar />
              <WorkspaceShell.Main>
                <div data-testid="slotted-content">Slotted Main Content</div>
              </WorkspaceShell.Main>
            </div>
          </WorkspaceShell.Root>
        </WorkspaceShell.Provider>
      </QueryClientProvider>
    )

    expect(screen.getByText('Slotted Main Content')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corp')

    // Sidebar collapse button toggles collapsed mode
    const collapseBtn = screen.getByTestId('sidebar-collapse-btn')
    const sidebar = screen.getByTestId('workspace-nav')
    const main = screen.getByRole('main')

    expect(sidebar).toHaveClass('w-[240px]')
    expect(main).toHaveClass('md:ml-[240px]')

    fireEvent.click(collapseBtn)

    expect(sidebar).toHaveClass('w-[60px]')
    expect(main).toHaveClass('md:ml-[60px]')
  })
})

describe('WorkspaceSidebar Cadmium Amber active indicator', () => {
  it('prominently displays a 2px solid Cadmium Amber (#F59E0B) left indicator bar and subpanel background', () => {
    const handleNavigate = vi.fn()

    render(
      <WorkspaceSidebar
        organizationName="Acme Corp"
        organizationSlug="acme"
        activeRoute="overview"
        role="admin"
        onNavigate={handleNavigate}
      />
    )

    const overviewBtn = screen.getByTestId('nav-overview')
    const ticketsBtn = screen.getByTestId('nav-tickets')

    expect(overviewBtn).toHaveClass('border-[#F59E0B]')
    expect(overviewBtn).toHaveClass('border-l-2')
    expect(overviewBtn).toHaveClass('bg-surface-subpanel')
    expect(ticketsBtn).toHaveClass('border-transparent')
  })
})

describe('In-Header Tenant Switcher Dropdown', () => {
  const originalFetch = global.fetch
  let testQueryClient: QueryClient

  beforeEach(() => {
    vi.restoreAllMocks()
    testQueryClient = createTestQueryClient()
    delete (window as any).location
    ;(window as any).location = {
      href: 'http://acme.localhost:5173/overview',
      hostname: 'acme.localhost',
      port: '5173',
      protocol: 'http:',
      search: '',
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders interactive dropdown listing user organizations with role badges and active checkmark', async () => {
    const mockOrgs = [
      { id: 1, name: 'Acme Corp', slug: 'acme', role: 'admin' },
      { id: 2, name: 'Stark Industries', slug: 'stark', role: 'agent' },
      { id: 3, name: 'Wayne Enterprises', slug: 'wayne', role: 'agent' },
    ]

    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceHeader
          organizationName="Acme Corp"
          organizationSlug="acme"
          user={{ name: 'Alice Admin', email: 'alice@acme.test' }}
          role="admin"
          organizations={mockOrgs}
        />
      </QueryClientProvider>
    )

    // Trigger button shows active org name
    const switcherTrigger = screen.getByTestId('tenant-switcher-trigger')
    expect(switcherTrigger).toBeInTheDocument()
    expect(switcherTrigger).toHaveTextContent('Acme Corp')

    // Open dropdown
    fireEvent.click(switcherTrigger)

    expect(screen.getByTestId('tenant-switcher-dropdown')).toBeInTheDocument()
    expect(screen.getByText('Stark Industries')).toBeInTheDocument()
    expect(screen.getByText('Wayne Enterprises')).toBeInTheDocument()

    // Role badges: admin vs agent
    const adminBadges = screen.getAllByText(/admin/i)
    expect(adminBadges.length).toBeGreaterThanOrEqual(1)
    const agentBadges = screen.getAllByText(/agent/i)
    expect(agentBadges.length).toBeGreaterThanOrEqual(2)

    // Active checkmark for current tenant (acme)
    expect(screen.getByTestId('active-org-check-acme')).toBeInTheDocument()
    expect(screen.queryByTestId('active-org-check-stark')).not.toBeInTheDocument()
  })

  it('selecting a different organization immediately redirects preserving auth token', async () => {
    const mockOrgs = [
      { id: 1, name: 'Acme Corp', slug: 'acme', role: 'admin' },
      { id: 2, name: 'Stark Industries', slug: 'stark', role: 'agent' },
    ]

    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceHeader
          organizationName="Acme Corp"
          organizationSlug="acme"
          user={{ name: 'Alice Admin', email: 'alice@acme.test' }}
          role="admin"
          organizations={mockOrgs}
          token="secret-auth-token"
        />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByTestId('tenant-switcher-trigger'))

    const starkOption = screen.getByTestId('tenant-option-stark')
    fireEvent.click(starkOption)

    expect(window.location.href).toBe('http://stark.localhost:5173/overview?token=secret-auth-token')
  })

  it('includes + New Organization trigger that opens creation modal and creates new org', async () => {
    const mockOrgs = [{ id: 1, name: 'Acme Corp', slug: 'acme', role: 'admin' }]

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            organization: { id: 1, name: 'Acme Corp', slug: 'acme' },
            user: { id: 1, name: 'Alice Admin', email: 'alice@acme.test' },
            role: 'admin',
          }),
        } as Response)
      }
      if (url.includes('/api/organizations/check-slug')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available: true, message: 'Subdomain is available' }),
        } as Response)
      }
      if (url.includes('/api/organizations') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            organization: {
              id: 99,
              name: body.name,
              slug: body.slug,
            },
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceShell
          subdomain="acme"
          token="test-token"
          organizations={mockOrgs}
        />
      </QueryClientProvider>
    )

    // Wait for workspace shell to render
    await waitFor(() => {
      expect(screen.getByTestId('tenant-switcher-trigger')).toBeInTheDocument()
    })

    // Open switcher
    fireEvent.click(screen.getByTestId('tenant-switcher-trigger'))

    // Click "+ New Organization" trigger
    const newOrgTrigger = screen.getByTestId('new-org-trigger')
    expect(newOrgTrigger).toBeInTheDocument()
    fireEvent.click(newOrgTrigger)

    // Modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
    })

    // Type name
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: 'Cyberdyne Systems' },
    })

    // Submit modal
    const submitBtn = screen.getByRole('button', { name: /create organization/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(window.location.href).toContain('cyberdyne-systems.localhost:5173/overview')
    })
  })
})

describe('User Profile Popover and Sanctum Logout', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.setItem('zeddesk_token', 'active-sanctum-token')
    localStorage.setItem('zeddesk_user', JSON.stringify({ id: 1, name: 'Alice Admin', email: 'alice@acme.test' }))
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('displays user profile popover with user details and destroys Sanctum session on Sign Out', async () => {
    const handleLogout = vi.fn()
    let logoutCalled = false

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/logout') && init?.method === 'POST') {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer active-sanctum-token',
        })
        logoutCalled = true
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Logged out successfully' }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(
      <WorkspaceHeader
        organizationName="Acme Corp"
        organizationSlug="acme"
        user={{ name: 'Alice Admin', email: 'alice@acme.test' }}
        role="admin"
        token="active-sanctum-token"
        onLogout={handleLogout}
      />
    )

    // Avatar button
    const avatarBtn = screen.getByLabelText(/user profile menu/i)
    fireEvent.click(avatarBtn)

    // Popover menu visible with user details
    const profileMenu = screen.getByTestId('user-profile-menu')
    expect(profileMenu).toBeInTheDocument()
    expect(within(profileMenu).getByText('Alice Admin')).toBeInTheDocument()
    expect(within(profileMenu).getByText('alice@acme.test')).toBeInTheDocument()

    // Click Log Out
    const logoutBtn = screen.getByTestId('workspace-logout-btn')
    fireEvent.click(logoutBtn)

    await waitFor(() => {
      expect(logoutCalled).toBe(true)
      expect(handleLogout).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('zeddesk_token')).toBeNull()
      expect(localStorage.getItem('zeddesk_user')).toBeNull()
    })
  })
})
