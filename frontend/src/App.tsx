import { useEffect, useState, type ReactNode } from 'react'

interface HealthStatus {
  status: string
  services: {
    database: string
    redis: string
  }
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#cbd5e1' }}>{label}:</span>
      {children}
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (data && data.services) {
          setHealth(data)
        } else if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [apiUrl])

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ZedDesk
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginTop: '0.5rem' }}>
          Multi-tenant AI-Powered Helpdesk
        </p>
      </header>

      <main style={{ backgroundColor: '#1e293b', borderRadius: '0.75rem', padding: '2rem', maxWidth: '32rem', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 0, marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
          System Baseline Status
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <StatusRow label="Frontend">
            <span style={{ backgroundColor: '#064e3b', color: '#34d399', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="frontend-status">
              Operational
            </span>
          </StatusRow>

          <StatusRow label="Backend API">
            {loading ? (
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Checking...</span>
            ) : error ? (
              <span style={{ backgroundColor: '#7f1d1d', color: '#f87171', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="backend-status">
                Unavailable ({error})
              </span>
            ) : (
              <span style={{ backgroundColor: health?.status === 'ok' ? '#064e3b' : '#78350f', color: health?.status === 'ok' ? '#34d399' : '#fbbf24', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }} data-testid="backend-status">
                {health?.status.toUpperCase()}
              </span>
            )}
          </StatusRow>

          <StatusRow label="Database">
            <span style={{ color: health?.services.database === 'connected' ? '#34d399' : '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }} data-testid="db-status">
              {health ? health.services.database : 'Waiting for API'}
            </span>
          </StatusRow>

          <StatusRow label="Redis Cache">
            <span style={{ color: health?.services.redis === 'connected' ? '#34d399' : '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }} data-testid="redis-status">
              {health ? health.services.redis : 'Waiting for API'}
            </span>
          </StatusRow>
        </div>
      </main>
    </div>
  )
}
