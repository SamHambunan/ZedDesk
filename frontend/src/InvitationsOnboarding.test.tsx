import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('Segmented Invitation Onboarding View (/invitations/:token)', () => {
  const originalFetch = global.fetch
  let originalLocation: Location

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()

    originalLocation = window.location
    delete (window as any).location
    ;(window as any).location = {
      href: 'http://localhost:5173/invitations/valid-invite-token',
      hostname: 'localhost',
      port: '5173',
      protocol: 'http:',
      pathname: '/invitations/valid-invite-token',
      search: '',
      hash: '',
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
    ;(window as any).location = originalLocation
  })

  it('renders centered 440px branded card on Industrial Graphite canvas with organization summary, inviting member, and designated role badge', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/invitations/valid-invite-token') && !url.includes('/accept')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            invitation: {
              email: 'newagent@initech.corp',
              role: 'agent',
              organization_name: 'Initech Systems',
              organization_slug: 'initech',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              invited_by: {
                id: 1,
                name: 'Bill Lumbergh',
                email: 'bill@initech.corp',
              },
              inviter_name: 'Bill Lumbergh',
            },
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App pathname="/invitations/valid-invite-token" />)

    // Industrial Graphite canvas background
    const canvas = screen.getByTestId('public-invitation-view')
    expect(canvas).toHaveClass('bg-canvas-base')

    // Wait for invitation details to load
    await waitFor(() => {
      expect(screen.getByTestId('invitation-card')).toBeInTheDocument()
    })

    // Centered 440px card
    const card = screen.getByTestId('invitation-card')
    expect(card).toHaveClass('max-w-[440px]')

    // Card header displays Organization name
    expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Initech Systems')

    // Card header displays inviting member
    expect(screen.getByTestId('inviting-member')).toHaveTextContent('Bill Lumbergh')

    // Card header displays designated Role badge
    const roleBadge = screen.getByTestId('invitation-role')
    expect(roleBadge).toHaveTextContent('agent')

    // Locked email pill
    expect(screen.getByTestId('invitation-email')).toHaveTextContent('newagent@initech.corp')
  })

  it('smoothly switches between Create Account and Sign In tabs without page reload', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/invitations/valid-invite-token') && !url.includes('/accept')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            invitation: {
              email: 'candidate@initech.corp',
              role: 'admin',
              organization_name: 'Initech Systems',
              organization_slug: 'initech',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              inviter_name: 'Bill Lumbergh',
            },
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App pathname="/invitations/valid-invite-token" />)

    await waitFor(() => {
      expect(screen.getByTestId('tab-register')).toBeInTheDocument()
    })

    const registerTab = screen.getByTestId('tab-register')
    const loginTab = screen.getByTestId('tab-login')

    // Default tab is Create Account
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
    expect(loginTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-login-form')).not.toBeInTheDocument()

    // Switch to Sign In tab
    fireEvent.click(loginTab)
    expect(loginTab).toHaveAttribute('aria-selected', 'true')
    expect(registerTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('invitation-login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-register-form')).not.toBeInTheDocument()

    // Switch back to Create Account tab
    fireEvent.click(registerTab)
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('invitation-register-form')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-login-form')).not.toBeInTheDocument()
  })

  it('unregistered user registration form captures name and password, validates, creates session, and redirects to tenant overview', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/invitations/valid-invite-token/accept') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        expect(body.name).toBe('Peter Gibbons')
        expect(body.password).toBe('InitechSecret123!')
        expect(body.password_confirmation).toBe('InitechSecret123!')

        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            message: 'Invitation accepted successfully.',
            token: 'sanctum-new-user-token',
            user: {
              id: 99,
              name: 'Peter Gibbons',
              email: 'candidate@initech.corp',
            },
            organization: {
              id: 1,
              name: 'Initech Systems',
              slug: 'initech',
            },
            role: 'agent',
          }),
        } as Response)
      }

      if (url.includes('/api/invitations/valid-invite-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            invitation: {
              email: 'candidate@initech.corp',
              role: 'agent',
              organization_name: 'Initech Systems',
              organization_slug: 'initech',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              inviter_name: 'Bill Lumbergh',
            },
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App pathname="/invitations/valid-invite-token" />)

    await waitFor(() => {
      expect(screen.getByTestId('accept-name-input')).toBeInTheDocument()
    })

    // Fill form
    await user.type(screen.getByTestId('accept-name-input'), 'Peter Gibbons')
    await user.type(screen.getByTestId('accept-password-input'), 'InitechSecret123!')
    await user.type(screen.getByTestId('accept-password-confirm-input'), 'InitechSecret123!')

    // Submit form
    const submitBtn = screen.getByTestId('accept-new-user-btn')
    await user.click(submitBtn)

    // Assert session persisted in localStorage
    await waitFor(() => {
      expect(localStorage.getItem('zeddesk_token')).toBe('sanctum-new-user-token')
      expect(JSON.parse(localStorage.getItem('zeddesk_user')!)).toMatchObject({
        id: 99,
        name: 'Peter Gibbons',
        email: 'candidate@initech.corp',
      })
    })

    // Assert redirection to {slug}.localhost:5173/overview
    await waitFor(() => {
      expect(window.location.href).toContain('initech.localhost:5173/overview')
    })
  })

  it('existing user sign-in form authenticates credentials, attaches identity, and redirects to tenant workspace', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/login') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        expect(body.email).toBe('candidate@initech.corp')
        expect(body.password).toBe('ExistingPassword123!')

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            token: 'sanctum-existing-user-token',
            user: {
              id: 77,
              name: 'Milton Waddams',
              email: 'candidate@initech.corp',
            },
          }),
        } as Response)
      }

      if (url.includes('/api/invitations/valid-invite-token/accept') && init?.method === 'POST') {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer sanctum-existing-user-token',
        })

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Invitation accepted successfully.',
            user: {
              id: 77,
              name: 'Milton Waddams',
              email: 'candidate@initech.corp',
            },
            organization: {
              id: 1,
              name: 'Initech Systems',
              slug: 'initech',
            },
            role: 'agent',
          }),
        } as Response)
      }

      if (url.includes('/api/invitations/valid-invite-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            invitation: {
              email: 'candidate@initech.corp',
              role: 'agent',
              organization_name: 'Initech Systems',
              organization_slug: 'initech',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              inviter_name: 'Bill Lumbergh',
            },
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App pathname="/invitations/valid-invite-token" />)

    await waitFor(() => {
      expect(screen.getByTestId('tab-login')).toBeInTheDocument()
    })

    // Switch to Sign In tab
    fireEvent.click(screen.getByTestId('tab-login'))

    // Form inputs
    expect(screen.getByTestId('accept-login-email-input')).toHaveValue('candidate@initech.corp')
    await user.type(screen.getByTestId('accept-login-password-input'), 'ExistingPassword123!')

    // Submit sign in
    const signInBtn = screen.getByTestId('accept-existing-user-btn')
    await user.click(signInBtn)

    // Assert session persisted
    await waitFor(() => {
      expect(localStorage.getItem('zeddesk_token')).toBe('sanctum-existing-user-token')
      expect(JSON.parse(localStorage.getItem('zeddesk_user')!)).toMatchObject({
        id: 77,
        name: 'Milton Waddams',
      })
    })

    // Assert redirection to tenant workspace overview
    await waitFor(() => {
      expect(window.location.href).toContain('initech.localhost:5173/overview')
    })
  })

  it('displays unmistakable error state for invalid or expired tokens with clear return link to Central Hub', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/invitations/expired-token')) {
        return Promise.resolve({
          ok: false,
          status: 410,
          json: async () => ({
            message: 'This invitation has expired.',
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    ;(window as any).location.pathname = '/invitations/expired-token'

    render(<App pathname="/invitations/expired-token" />)

    // Unmistakable error state card
    await waitFor(() => {
      expect(screen.getByTestId('invitation-error-card')).toBeInTheDocument()
    })

    expect(screen.getByText('Invalid or Expired Invitation')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-error')).toHaveTextContent('This invitation has expired.')

    // Link/button back to Central Hub
    const returnBtn = screen.getByTestId('go-to-central-hub-btn')
    expect(returnBtn).toBeInTheDocument()

    fireEvent.click(returnBtn)
    expect(window.location.href).toBe('http://localhost:5173')
  })
})
