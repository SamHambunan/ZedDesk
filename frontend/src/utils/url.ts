export function getSubdomain(hostname?: string): string | null {
  const host = hostname ?? (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '')
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  const parts = host.split('.')
  if (parts.length >= 2) {
    const candidate = parts[0].toLowerCase()
    if (['api', 'admin', 'www', 'central', 'hub', 'mail', 'static', 'cdn'].includes(candidate)) {
      return null
    }
    return candidate
  }

  return null
}

export function getApiBaseUrl(slug?: string | null): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (slug) {
    if (envUrl) {
      try {
        const parsed = new URL(envUrl)
        return `${parsed.protocol}//${slug}.${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? 443 : 80)}`
      } catch {
        return `http://${slug}.localhost:8000`
      }
    }
    return `http://${slug}.localhost:8000`
  }
  return envUrl || 'http://localhost:8000'
}

export function getCentralHubUrl(): string {
  if (typeof window === 'undefined' || !window.location) return 'http://localhost:5173'
  const protocol = window.location.protocol || 'http:'
  const port = window.location.port ? `:${window.location.port}` : ''
  return `${protocol}//localhost${port}`
}

export function getOrganizationUrl(slug: string): string {
  const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost'
  const port = typeof window !== 'undefined' && window.location?.port ? `:${window.location.port}` : ''
  const protocol = typeof window !== 'undefined' && window.location?.protocol ? window.location.protocol : 'http:'
  return `${protocol}//${slug}.${host}${port}`
}
