import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

export const AUTH_TOKEN_KEY = 'zeddesk_token'
export const AUTH_USER_KEY = 'zeddesk_user'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('token')
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem('token')
  localStorage.removeItem(AUTH_USER_KEY)
  localStorage.removeItem('user')
}

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || '',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
})

// Request Interceptor: Attach Sanctum Bearer token if present
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Automatically intercept 401 responses to clear credentials and redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthToken()
      if (unauthorizedHandler) {
        unauthorizedHandler()
      } else if (typeof window !== 'undefined') {
        const path = window.location.pathname
        if (path !== '/login' && path !== '/register') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
