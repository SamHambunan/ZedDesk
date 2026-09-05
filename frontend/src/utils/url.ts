export function getSubdomain(hostname?: string): string | null {
  const host = hostname ?? (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '')
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  // Handle .localhost domains (e.g. acme.localhost, acme.zeddesk.localhost)
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length)
    const parts = sub.split('.')
    const candidate = parts[0].toLowerCase()
    if (['api', 'admin', 'www', 'central', 'hub', 'mail', 'static', 'cdn'].includes(candidate)) {
      return null
    }
    return candidate
  }

  // Handle production/staging domains with base domain (e.g. acme.zeddesk.com)
  const parts = host.split('.')
  if (parts.length >= 3) {
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
  const host = window.location.hostname || 'localhost'

  let baseHost = 'localhost'
  if (!host.endsWith('.localhost') && host !== 'localhost' && host !== '127.0.0.1') {
    const parts = host.split('.')
    if (parts.length >= 3) {
      baseHost = parts.slice(1).join('.')
    }
  }

  return `${protocol}//${baseHost}${port}`
}

export function getOrganizationUrl(slug: string): string {
  const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost'
  const port = typeof window !== 'undefined' && window.location?.port ? `:${window.location.port}` : ''
  const protocol = typeof window !== 'undefined' && window.location?.protocol ? window.location.protocol : 'http:'

  // Strip existing subdomains to prevent nested subdomains (e.g. beta.acme.localhost)
  let baseHost = host
  if (host.endsWith('.localhost')) {
    baseHost = 'localhost'
  } else {
    const parts = host.split('.')
    if (parts.length >= 3) {
      baseHost = parts.slice(1).join('.')
    }
  }

  return `${protocol}//${slug}.${baseHost}${port}`
}
