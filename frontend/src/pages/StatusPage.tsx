import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session
}

interface HealthData {
  status: string
  version: string
  checks: Record<string, string>
}

export default function StatusPage({ session }: Props) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('')

  const runCheck = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? ''}/api/health`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHealth(data)
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runCheck()
    // Auto-refresh every 30 seconds
    const interval = setInterval(runCheck, 30000)
    return () => clearInterval(interval)
  }, [])

  const statusColor = (val: string) => {
    if (val === 'ok') return 'bg-green-500'
    if (val.startsWith('error') || val === 'MISSING') return 'bg-red-500'
    return 'bg-yellow-500'
  }

  // Only admin can see this
  if (session.user.email !== 'thomastom92@gmail.com') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Access denied</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">System Status</h1>
          <div className="flex items-center gap-2">
            {health && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${
                health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {health.status === 'ok' ? 'All Systems OK' : 'Issues Detected'}
              </span>
            )}
            <button
              onClick={runCheck}
              disabled={loading}
              className="text-sm text-green-600 font-medium disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <p className="text-red-700 dark:text-red-300 font-medium">Backend Unreachable</p>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
          </div>
        )}

        {health && (
          <>
            {/* Overall status */}
            <div className={`rounded-xl p-6 text-white ${
              health.status === 'ok' ? 'bg-green-600' : 'bg-red-600'
            }`}>
              <p className="text-2xl font-bold">
                {health.status === 'ok' ? 'All Systems Operational' : 'Some Systems Need Attention'}
              </p>
              <p className="text-sm opacity-80 mt-1">
                Version {health.version} · Last checked {lastChecked}
              </p>
              <p className="text-xs opacity-60 mt-1">Auto-refreshes every 30 seconds</p>
            </div>

            {/* Individual checks */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {Object.entries(health.checks).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${statusColor(status)}`} />
                    <span className="text-sm text-gray-900 dark:text-white font-medium capitalize">
                      {name.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className={`text-xs font-mono ${
                    status === 'ok' ? 'text-green-600' : status === 'MISSING' ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {status}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase">Quick Links</p>
              <a href="https://snapexpense-production.up.railway.app/docs"
                target="_blank" rel="noopener noreferrer"
                className="block text-sm text-green-600 hover:underline">
                API Docs (Swagger)
              </a>
              <a href="https://railway.app/dashboard"
                target="_blank" rel="noopener noreferrer"
                className="block text-sm text-green-600 hover:underline">
                Railway Dashboard
              </a>
              <a href="https://supabase.com/dashboard"
                target="_blank" rel="noopener noreferrer"
                className="block text-sm text-green-600 hover:underline">
                Supabase Dashboard
              </a>
              <a href="https://vercel.com/dashboard"
                target="_blank" rel="noopener noreferrer"
                className="block text-sm text-green-600 hover:underline">
                Vercel Dashboard
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
