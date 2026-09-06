import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  apiClient,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  AUTH_TOKEN_KEY,
  setUnauthorizedHandler,
} from './api-client'

describe('API Client Shell', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('manages auth tokens and credentials in localStorage', () => {
    expect(getAuthToken()).toBeNull()
    setAuthToken('test-sanctum-token-123')
    localStorage.setItem('zeddesk_user', JSON.stringify({ id: 1, name: 'Agent' }))
    expect(getAuthToken()).toBe('test-sanctum-token-123')
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('test-sanctum-token-123')
    clearAuthToken()
    expect(getAuthToken()).toBeNull()
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem('zeddesk_user')).toBeNull()
  })

  it('attaches Authorization Bearer header when token is present', async () => {
    setAuthToken('bearer-token-xyz')

    // Create a mock adapter or spy on axios request handler
    const requestInterceptor = apiClient.interceptors.request as any
    // Get the registered fulfilled handler
    const handler = requestInterceptor.handlers[0]?.fulfilled

    expect(handler).toBeDefined()
    const config = await handler({ headers: {} as any })
    expect(config.headers.Authorization).toBe('Bearer bearer-token-xyz')
  })

  it('does not attach Authorization header when token is not present', async () => {
    clearAuthToken()

    const requestInterceptor = apiClient.interceptors.request as any
    const handler = requestInterceptor.handlers[0]?.fulfilled

    expect(handler).toBeDefined()
    const config = await handler({ headers: {} as any })
    expect(config.headers.Authorization).toBeUndefined()
  })

  it('intercepts 401 responses, clears stale credentials, and triggers redirect/unauthorized handler', async () => {
    setAuthToken('expired-token')
    const mockHandler = vi.fn()
    setUnauthorizedHandler(mockHandler)

    const responseInterceptor = apiClient.interceptors.response as any
    const rejectedHandler = responseInterceptor.handlers[0]?.rejected

    expect(rejectedHandler).toBeDefined()

    const error401 = {
      response: {
        status: 401,
        data: { message: 'Unauthenticated.' },
      },
    }

    await expect(rejectedHandler(error401)).rejects.toEqual(error401)
    expect(getAuthToken()).toBeNull()
    expect(mockHandler).toHaveBeenCalledTimes(1)
  })

  it('does not clear tokens on non-401 errors', async () => {
    setAuthToken('valid-token')
    const mockHandler = vi.fn()
    setUnauthorizedHandler(mockHandler)

    const responseInterceptor = apiClient.interceptors.response as any
    const rejectedHandler = responseInterceptor.handlers[0]?.rejected

    const error500 = {
      response: {
        status: 500,
        data: { message: 'Server error' },
      },
    }

    await expect(rejectedHandler(error500)).rejects.toEqual(error500)
    expect(getAuthToken()).toBe('valid-token')
    expect(mockHandler).not.toHaveBeenCalled()
  })
})
