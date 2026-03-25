import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTrip, deleteTrip, getMileageSummary, getTrips, updateTrip } from '../lib/api'

interface Props {
  session: Session
}

type TripTag = 'business' | 'work' | 'personal' | 'commute'

interface Trip {
  id: string
  start_address: string | null
  end_address: string | null
  distance_km: number | null
  distance_miles: number | null
  trip_date: string
  trip_tag: TripTag
  notes: string | null
}

interface MileageSummary {
  year: number
  total_trips: number
  business_trips: number
  total_km: number
  total_miles: number
  deduction: {
    method: string
    deduction: number
    country: string
    total_km?: number
    total_miles?: number
    rate_first_5000?: number
    rate_after_5000?: number
    rate_per_mile?: number
  }
}

const TAG_CONFIG: Record<TripTag, { label: string; className: string }> = {
  business: { label: 'Business', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  work: { label: 'Work', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  personal: { label: 'Personal', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  commute: { label: 'Commute', className: 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 line-through' },
}

function TagBadge({ tag }: { tag: TripTag }) {
  const cfg = TAG_CONFIG[tag]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
    </div>
  )
}

// Swipeable trip card
function SwipeableTripCard({
  trip,
  onTagBusiness,
  onTagPersonal,
  onDelete,
}: {
  trip: Trip
  onTagBusiness: () => void
  onTagPersonal: () => void
  onDelete: () => void
}) {
  const startXRef = useRef<number>(0)
  const [offset, setOffset] = useState(0)
  const [swiped, setSwiped] = useState<'business' | 'personal' | null>(null)

  const THRESHOLD = 80

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startXRef.current
    setOffset(Math.max(-THRESHOLD * 1.5, Math.min(THRESHOLD * 1.5, dx)))
  }

  const handleTouchEnd = () => {
    if (offset > THRESHOLD) {
      setSwiped('business')
      setTimeout(() => {
        onTagBusiness()
        setSwiped(null)
        setOffset(0)
      }, 300)
    } else if (offset < -THRESHOLD) {
      setSwiped('personal')
      setTimeout(() => {
        onTagPersonal()
        setSwiped(null)
        setOffset(0)
      }, 300)
    } else {
      setOffset(0)
    }
  }

  const distLabel = trip.distance_km != null
    ? `${trip.distance_km} km (${trip.distance_miles ?? (trip.distance_km * 0.621371).toFixed(1)} mi)`
    : '—'

  const dateLabel = new Date(trip.trip_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const route = [trip.start_address, trip.end_address].filter(Boolean).join(' → ') || 'No address'

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe hint backgrounds */}
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-green-500 flex items-center pl-4">
          <span className="text-white text-sm font-semibold">Business</span>
        </div>
        <div className="flex-1 bg-gray-400 flex items-center justify-end pr-4">
          <span className="text-white text-sm font-semibold">Personal</span>
        </div>
      </div>

      {/* Card */}
      <div
        className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 transition-transform select-none"
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiped ? 'transform 0.3s ease' : offset === 0 ? 'transform 0.2s ease' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{route}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{distLabel} · {dateLabel}</p>
            {trip.notes && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{trip.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TagBadge tag={trip.trip_tag} />
            <button
              onClick={onDelete}
              className="text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 p-1 -mr-1"
              aria-label="Delete trip"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MileagePage({ session }: Props) {
  const navigate = useNavigate()
  const token = session.access_token

  const [trips, setTrips] = useState<Trip[]>([])
  const [summary, setSummary] = useState<MileageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [tripDate, setTripDate] = useState(new Date().toISOString().slice(0, 10))
  const [tripTag, setTripTag] = useState<TripTag>('business')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [tripsRes, summaryRes] = await Promise.all([
        getTrips(token, 3),
        getMileageSummary(token),
      ])
      setTrips(tripsRes.trips || [])
      setSummary(summaryRes)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
      setSummaryLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleLogTrip = async () => {
    if (!distanceKm || parseFloat(distanceKm) <= 0) return
    setSubmitting(true)
    try {
      await createTrip(token, {
        start_address: startAddress || undefined,
        end_address: endAddress || undefined,
        distance_km: parseFloat(distanceKm),
        trip_date: tripDate,
        trip_tag: tripTag,
        notes: notes || undefined,
      })
      setStartAddress('')
      setEndAddress('')
      setDistanceKm('')
      setNotes('')
      setLogSuccess(true)
      setTimeout(() => setLogSuccess(false), 2500)
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to log trip')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTagUpdate = async (id: string, tag: TripTag) => {
    setTrips(prev => prev.map(t => t.id === id ? { ...t, trip_tag: tag } : t))
    try {
      await updateTrip(token, id, { trip_tag: tag })
      await loadData()
    } catch {
      await loadData()
    }
  }

  const handleDelete = async (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id))
    try {
      await deleteTrip(token, id)
    } catch {
      await loadData()
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const deductionLabel = summary
    ? summary.deduction.country === 'CA'
      ? `$0.70/km (first 5,000 km) · $0.64/km after`
      : `$0.725/mile (IRS 2026)`
    : ''

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Mileage Tracker</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Summary card */}
        {summaryLoading ? (
          <SkeletonCard />
        ) : summary ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  {summary.year} Summary
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.total_km.toLocaleString()} km business
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {summary.business_trips} of {summary.total_trips} trips
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Est. deduction</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${fmt(summary.deduction.deduction)}
                </p>
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Rate: {deductionLabel}
              </p>
            </div>
          </div>
        ) : null}

        {/* Log trip form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Log a Trip</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start address
                </label>
                <input
                  type="text"
                  value={startAddress}
                  onChange={e => setStartAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End address
                </label>
                <input
                  type="text"
                  value={endAddress}
                  onChange={e => setEndAddress(e.target.value)}
                  placeholder="456 Office Blvd"
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Distance (km) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={distanceKm}
                  onChange={e => setDistanceKm(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                {distanceKm && parseFloat(distanceKm) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {(parseFloat(distanceKm) * 0.621371).toFixed(1)} mi
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={tripDate}
                  onChange={e => setTripDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Tag selector */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Purpose
              </label>
              <div className="flex gap-2 flex-wrap">
                {(['business', 'work', 'personal', 'commute'] as TripTag[]).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTripTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      tripTag === tag
                        ? tag === 'business'
                          ? 'bg-green-600 text-white'
                          : tag === 'work'
                          ? 'bg-blue-600 text-white'
                          : tag === 'commute'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {TAG_CONFIG[tag].label}
                  </button>
                ))}
              </div>
              {(tripTag === 'personal' || tripTag === 'commute') && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  {tripTag === 'commute'
                    ? 'Commute trips are not deductible.'
                    : 'Personal trips are not deductible.'}
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Client meeting, site visit…"
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleLogTrip}
              disabled={submitting || !distanceKm || parseFloat(distanceKm) <= 0}
              className={`w-full py-3 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                logSuccess
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
              }`}
            >
              {logSuccess ? 'Trip logged!' : submitting ? 'Saving…' : 'Log Trip'}
            </button>
          </div>
        </div>

        {/* Recent trips */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Recent Trips</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">Swipe to retag</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : trips.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-10 text-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm">No trips yet. Log your first trip above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => (
                <SwipeableTripCard
                  key={trip.id}
                  trip={trip}
                  onTagBusiness={() => handleTagUpdate(trip.id, 'business')}
                  onTagPersonal={() => handleTagUpdate(trip.id, 'personal')}
                  onDelete={() => handleDelete(trip.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rate info */}
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-4">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Deduction rates used</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            <strong className="text-gray-600 dark:text-gray-300">Canada (CRA):</strong> $0.70/km for the first 5,000 km, $0.64/km after. Business and work trips qualify; commute and personal do not.
            {' '}
            <strong className="text-gray-600 dark:text-gray-300">United States (IRS):</strong> $0.725/mile (2026 rate). Rates updated annually.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
            Tax disclaimer: These are estimates for informational purposes only. Consult a qualified tax professional before filing.
          </p>
        </div>

      </main>
    </div>
  )
}
