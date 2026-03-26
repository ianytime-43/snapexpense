import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  session: Session
}

interface Warranty {
  id: string
  product_name: string | null
  store: string | null
  purchase_date: string | null
  warranty_expires: string | null
  notes: string | null
}

function daysRemaining(expiresDate: string | null): number | null {
  if (!expiresDate) return null
  const expires = new Date(expiresDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  expires.setHours(0, 0, 0, 0)
  return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function DaysChip({ days }: { days: number | null }) {
  if (days === null) return null
  if (days < 0) {
    return (
      <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
        Expired
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
        {days}d left
      </span>
    )
  }
  return (
    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
      {days}d left
    </span>
  )
}

export default function WarrantyPage({ session }: Props) {
  const navigate = useNavigate()
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/warranties`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => setWarranties(data.warranties ?? []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 -ml-1"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Warranties</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && warranties.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">No warranties found.</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              Warranties are added automatically when a product purchase is detected.
            </p>
          </div>
        )}

        {!loading && warranties.length > 0 && (
          <div className="space-y-3">
            {warranties.map((w) => {
              const days = daysRemaining(w.warranty_expires)
              return (
                <div
                  key={w.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {w.product_name ?? 'Unknown product'}
                      </p>
                      {w.store && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{w.store}</p>
                      )}
                    </div>
                    <DaysChip days={days} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {w.purchase_date && (
                      <>
                        <span className="font-medium text-gray-600 dark:text-gray-300">Purchased</span>
                        <span>{new Date(w.purchase_date).toLocaleDateString()}</span>
                      </>
                    )}
                    {w.warranty_expires && (
                      <>
                        <span className="font-medium text-gray-600 dark:text-gray-300">Expires</span>
                        <span>{new Date(w.warranty_expires).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>

                  {w.notes && (
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{w.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
