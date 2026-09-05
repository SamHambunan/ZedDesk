import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

describe('Central Hub Authentication and Organization Flow', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('allows a visitor to register a new account and transitions to organization view', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/register') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            user: { id: 1, name: 'Alice Admin', email: 'alice@example.com' },
            token: 'mock-token-alice',
          }),
        } as Response)
      }

      if (url.endsWith('/api/organizations') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App />)

    // Switch to Register tab
    const registerTab = screen.getByRole('tab', { name: /register/i })
    await user.click(registerTab)

    // Fill form
    await user.type(screen.getByLabelText(/name/i), 'Alice Admin')
    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'Password123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123!')

    // Submit
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/logged in as/i)).toHaveTextContent(/alice admin/i)
      expect(screen.getByRole('heading', { name: /create organization/i })).toBeInTheDocument()
    })
  })

  it('allows a registered user to log in, view organizations, and log out', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/login') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 2, name: 'Bob Agent', email: 'bob@example.com' },
            token: 'mock-token-bob',
          }),
        } as Response)
      }

      if (url.endsWith('/api/organizations') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 10, name: 'Acme Corp', slug: 'acme-corp', role: 'admin' },
            { id: 11, name: 'Support Squad', slug: 'support-squad', role: 'agent' },
          ],
        } as Response)
      }

      if (url.endsWith('/api/logout') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: 'Logged out successfully' }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App />)

    // Login Form
    await user.type(screen.getByLabelText(/^email/i), 'bob@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'Password123!')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))

    // Organizations listed
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText(/support-squad/)).toBeInTheDocument()
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('agent')).toBeInTheDocument()
    })

    // Log out
    await user.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^log in$/i })).toBeInTheDocument()
    })
  })

  it('allows an authenticated user to create a new organization and see it listed', async () => {
    const user = userEvent.setup()

    let orgs = [{ id: 10, name: 'Initial Org', slug: 'initial-org', role: 'admin' }]

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', services: { database: 'connected', redis: 'connected' } }),
        } as Response)
      }

      if (url.endsWith('/api/login') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 3, name: 'Charlie Founder', email: 'charlie@example.com' },
            token: 'mock-token-charlie',
          }),
        } as Response)
      }

      if (url.endsWith('/api/organizations') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => orgs,
        } as Response)
      }

      if (url.endsWith('/api/organizations') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        const newOrg = { id: 20, name: body.name, slug: body.slug, role: 'admin' }
        orgs = [...orgs, newOrg]
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            organization: newOrg,
            role: 'admin',
          }),
        } as Response)
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<App />)

    // Log in
    await user.type(screen.getByLabelText(/^email/i), 'charlie@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'Password123!')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))

    await waitFor(() => {
      expect(screen.getByText('Initial Org')).toBeInTheDocument()
    })

    // Create organization
    await user.type(screen.getByLabelText(/organization name/i), 'Zed Helpdesk')
    await user.type(screen.getByLabelText(/subdomain slug/i), 'zed-help')
    await user.click(screen.getByRole('button', { name: /create organization/i }))

    await waitFor(() => {
      expect(screen.getByText('Zed Helpdesk')).toBeInTheDocument()
      expect(screen.getByText(/zed-help/)).toBeInTheDocument()
    })
  })
})
