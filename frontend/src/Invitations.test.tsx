import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('Organization Member Invitations Flow', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.location.hostname = 'localhost'
    window.location.pathname = '/'
  })

  describe('Admin Invitation Management in Workspace Shell', () => {
    it('allows admin to view, create, and revoke invitations', async () => {
      const user = userEvent.setup()
      window.location.hostname = 'acme.localhost'
      localStorage.setItem('zeddesk_token', 'mock-admin-token')

      let invitations = [
        {
          id: 1,
          email: 'pending1@acme.test',
          role: 'agent',
          token: 'token-123',
          expires_at: '2026-09-12T12:00:00.000000Z',
          created_at: '2026-09-05T12:00:00.000000Z',
          invited_by: { id: 10, name: 'Alice Admin', email: 'admin@acme.test' },
        },
      ]

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/workspace')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
              user: { id: 10, name: 'Alice Admin', email: 'admin@acme.test' },
              role: 'admin',
            }),
          } as Response)
        }

        if (url.includes('/api/invitations') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string)
          const newInvitation = {
            id: 2,
            email: body.email,
            role: body.role,
            token: 'new-token-456',
            expires_at: '2026-09-12T12:00:00.000000Z',
            created_at: '2026-09-05T12:05:00.000000Z',
            invited_by: { id: 10, name: 'Alice Admin', email: 'admin@acme.test' },
          }
          invitations.push(newInvitation)
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              message: 'Invitation created successfully.',
              invitation: newInvitation,
            }),
          } as Response)
        }

        if (url.includes('/api/invitations/1') && init?.method === 'DELETE') {
          invitations = invitations.filter((inv) => inv.id !== 1)
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ message: 'Invitation revoked successfully.' }),
          } as Response)
        }

        if (url.includes('/api/invitations') && (!init?.method || init.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ invitations }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      render(<App hostname="acme.localhost" />)

      await waitFor(() => {
        expect(screen.getByTestId('workspace-org-name')).toHaveTextContent('Acme Corporation')
      })

      // Click on Member Invitations navigation
      await user.click(screen.getByTestId('nav-invitations'))

      // View pending invitations
      await waitFor(() => {
        expect(screen.getByTestId('invitations-manager')).toBeInTheDocument()
        expect(screen.getByText('pending1@acme.test')).toBeInTheDocument()
        expect(screen.getByTestId('invitation-token-1')).toHaveTextContent('token-123')
        expect(screen.getByTestId('copy-invitation-link-1')).toBeInTheDocument()
      })

      // Create new invitation
      await user.type(screen.getByTestId('invite-email-input'), 'bob@example.test')
      await user.selectOptions(screen.getByTestId('invite-role-select'), 'admin')
      await user.click(screen.getByTestId('invite-submit-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('invite-success')).toHaveTextContent(/invitation created successfully/i)
        expect(screen.getByText('bob@example.test')).toBeInTheDocument()
      })

      // Revoke an invitation
      const revokeBtn = screen.getByTestId('revoke-invitation-btn-1')
      await user.click(revokeBtn)

      await waitFor(() => {
        expect(screen.queryByText('pending1@acme.test')).not.toBeInTheDocument()
      })
    })
  })

  describe('Public Invitation Acceptance Screen', () => {
    it('displays invitation details and allows a new user to register and accept', async () => {
      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/invitations/test-token-xyz') && (!init || init.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              invitation: {
                email: 'newhire@acme.test',
                role: 'agent',
                organization_name: 'Acme Corporation',
                organization_slug: 'acme',
                expires_at: '2026-09-12T12:00:00.000000Z',
              },
            }),
          } as Response)
        }

        if (url.includes('/api/invitations/test-token-xyz/accept') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              message: 'Invitation accepted successfully.',
              token: 'newly-created-user-token',
              user: { id: 25, name: 'Charlie New', email: 'newhire@acme.test' },
              organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
              role: 'agent',
            }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      render(<App hostname="localhost" pathname="/invitations/test-token-xyz" />)

      await waitFor(() => {
        expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Corporation')
        expect(screen.getByTestId('invitation-email')).toHaveTextContent('newhire@acme.test')
        expect(screen.getByTestId('invitation-role')).toHaveTextContent(/agent/i)
      })

      // Fill out new user registration form
      fireEvent.change(screen.getByTestId('accept-name-input'), {
        target: { value: 'Charlie New' },
      })
      fireEvent.change(screen.getByTestId('accept-password-input'), {
        target: { value: 'Password123!' },
      })
      fireEvent.change(screen.getByTestId('accept-password-confirm-input'), {
        target: { value: 'Password123!' },
      })

      fireEvent.click(screen.getByTestId('accept-new-user-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('invitation-accepted-success')).toBeInTheDocument()
        expect(screen.getByText(/you are now an Organization Member of Acme Corporation/i)).toBeInTheDocument()
        expect(screen.getByTestId('go-to-workspace-btn')).toBeInTheDocument()
      })
    })

    it('displays error message when token is expired or revoked', async () => {
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

      render(<App hostname="localhost" pathname="/invitations/expired-token" />)

      await waitFor(() => {
        expect(screen.getByTestId('invitation-error')).toHaveTextContent('This invitation has expired.')
      })
    })

    it('allows an existing logged-in user to accept invitation', async () => {
      localStorage.setItem('zeddesk_token', 'existing-user-token')
      localStorage.setItem(
        'zeddesk_user',
        JSON.stringify({ id: 5, name: 'Existing User', email: 'existing@acme.test' }),
      )

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/invitations/existing-token') && (!init || init.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              invitation: {
                email: 'existing@acme.test',
                role: 'admin',
                organization_name: 'Acme Corporation',
                organization_slug: 'acme',
                expires_at: '2026-09-12T12:00:00.000000Z',
              },
            }),
          } as Response)
        }

        if (url.includes('/api/invitations/existing-token/accept') && init?.method === 'POST') {
          expect(init?.headers).toMatchObject({
            Authorization: 'Bearer existing-user-token',
          })

          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message: 'Invitation accepted successfully.',
              user: { id: 5, name: 'Existing User', email: 'existing@acme.test' },
              organization: { id: 1, name: 'Acme Corporation', slug: 'acme' },
              role: 'admin',
            }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      render(<App hostname="localhost" pathname="/invitations/existing-token" />)

      await waitFor(() => {
        expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Corporation')
        expect(screen.getByTestId('accept-logged-in-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('accept-logged-in-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('invitation-accepted-success')).toBeInTheDocument()
        expect(screen.getByTestId('go-to-workspace-btn')).toBeInTheDocument()
      })
    })

    it('allows an authenticated user to sign out or switch user from the invitation screen', async () => {
      localStorage.setItem('zeddesk_token', 'mismatched-user-token')
      localStorage.setItem(
        'zeddesk_user',
        JSON.stringify({ id: 99, name: 'Other User', email: 'other@example.test' }),
      )

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/invitations/switch-token') && (!init || init.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              invitation: {
                email: 'invited@acme.test',
                role: 'agent',
                organization_name: 'Acme Corporation',
                organization_slug: 'acme',
                expires_at: '2026-09-12T12:00:00.000000Z',
              },
            }),
          } as Response)
        }

        if (url.includes('/api/logout') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ message: 'Logged out successfully' }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      render(<App hostname="localhost" pathname="/invitations/switch-token" />)

      await waitFor(() => {
        expect(screen.getByText(/other@example.test/i)).toBeInTheDocument()
        expect(screen.getByTestId('invitation-logout-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('invitation-logout-btn'))

      await waitFor(() => {
        expect(screen.queryByTestId('invitation-logout-btn')).not.toBeInTheDocument()
        expect(screen.getByTestId('accept-name-input')).toBeInTheDocument()
        expect(localStorage.getItem('zeddesk_token')).toBeNull()
      })
    })

    it('renders public invitation acceptance screen on tenant subdomain without demanding workspace auth', async () => {
      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/invitations/subdomain-token') && (!init || init.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              invitation: {
                email: 'subdomain@acme.test',
                role: 'agent',
                organization_name: 'Acme Corporation',
                organization_slug: 'acme',
                expires_at: '2026-09-12T12:00:00.000000Z',
              },
            }),
          } as Response)
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`))
      })

      render(<App hostname="acme.localhost" pathname="/invitations/subdomain-token" />)

      await waitFor(() => {
        expect(screen.getByTestId('invitation-org-name')).toHaveTextContent('Acme Corporation')
        expect(screen.getByTestId('invitation-email')).toHaveTextContent('subdomain@acme.test')
        // Should NOT render Workspace unauthenticated screen
        expect(screen.queryByTestId('workspace-login-email')).not.toBeInTheDocument()
      })
    })
  })
})
