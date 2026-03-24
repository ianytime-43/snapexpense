import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type DetectedSubscription,
  type SavedSubscription,
  deleteSubscription,
  detectSubscriptions,
  listSubscriptions,
  saveSubscription,
} from '../lib/api'

interface Props {
  session: Session
}

const TAG_STYLES: Record<string, string> = {
  business: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  work: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

const FREQ_LABELS: Record<string, string> = {
  monthly: '/mo',
  annual: '/yr',
  weekly: '/wk',
}

function formatCurrency(amount: number | null, currency = 'CAD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-1/4" />
      </div>
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
    </div>
  )
}

function MonthlyTotals({ subscriptions }: { subscriptions: SavedSubscription[] }) {
  const totals: Record<string, number> = {}
  for (const sub of subscriptions) {
    const tag = sub.expense_tag || 'business'
    const monthlyAmount =
      sub.frequency === 'annual'
        ? (sub.amount ?? 0) / 12
        : sub.frequency === 'weekly'
          ? (sub.amount ?? 0) * 4.33
          : (sub.amount ?? 0)
    totals[tag] = (totals[tag] ?? 0) + monthlyAmount
  }

  const entries = Object.entries(totals)
  if (entries.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {entries.map(([tag, total]) => (
        <div
          key={tag}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize mb-1">{tag}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(total)}<span className="text-sm font-normal text-gray-400">/mo</span>
          </p>
        </div>
      ))}
      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</p>
        <p className="text-lg font-bold text-green-700 dark:text-green-400">
          {formatCurrency(entries.reduce((s, [, v]) => s + v, 0))}<span className="text-sm font-normal text-green-600 dark:text-green-500">/mo</span>
        </p>
      </div>
    </div>
  )
}

export default function SubscriptionsPage({ session }: Props) {
  const [saved, setSaved] = useState<SavedSubscription[]>([])
  const [detected, setDetected] = useState<DetectedSubscription[] | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const token = session.access_token

  useEffect(() => {
    listSubscriptions(token)
      .then(d => setSaved(d.subscriptions))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingSaved(false))
  }, [token])

  async function handleDetect() {
    setDetecting(true)
    setError(null)
    try {
      const res = await detectSubscriptions(token)
      setDetected(res.subscriptions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  async function handleSave(sub: DetectedSubscription) {
    setSavingId(sub.merchant_name)
    try {
      const created = await saveSubscription(token, sub)
      setSaved(prev => {
        const exists = prev.find(s => s.merchant_name === created.merchant_name)
        return exists
          ? prev.map(s => (s.merchant_name === created.merchant_name ? created : s))
          : [created, ...prev]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteSubscription(token, id)
      setSaved(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const savedMerchants = new Set(saved.map(s => s.merchant_name))
  const priceChanges = detected?.filter(d => d.price_change != null && d.price_change !== 0) ?? []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Subscriptions</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Recurring expense tracker</p>
            </div>
          </div>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {detecting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 14.65z" />
                </svg>
                Detect Subscriptions
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Monthly totals summary */}
        {saved.length > 0 && <MonthlyTotals subscriptions={saved} />}

        {/* Price change alerts */}
        {priceChanges.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Price Changes Detected
            </h2>
            {priceChanges.map(sub => (
              <div
                key={sub.merchant_name}
                className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
              >
                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{sub.merchant_name}</span>{' '}
                  {(sub.price_change ?? 0) > 0 ? 'up' : 'down'}{' '}
                  <span className="font-semibold">
                    {formatCurrency(Math.abs(sub.price_change ?? 0), sub.currency)}
                  </span>{' '}
                  from last charge
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Detected subscriptions (scan results) */}
        {detected !== null && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Detected ({detected.length})
            </h2>
            {detected.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-6 text-center">
                No recurring patterns found. Add more expenses to improve detection.
              </p>
            )}
            {detected.map(sub => {
              const alreadySaved = savedMerchants.has(sub.merchant_name)
              return (
                <div
                  key={sub.merchant_name}
                  className="flex items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {sub.merchant_name}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TAG_STYLES[sub.expense_tag] ?? TAG_STYLES.business}`}
                      >
                        {sub.expense_tag}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 capitalize">
                        {sub.frequency}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Next: {formatDate(sub.next_expected_date)} · seen {sub.times_seen}×
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(sub.amount, sub.currency)}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {FREQ_LABELS[sub.frequency] ?? '/mo'}
                      </p>
                    </div>
                    {alreadySaved ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>
                    ) : (
                      <button
                        onClick={() => handleSave(sub)}
                        disabled={savingId === sub.merchant_name}
                        className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
                      >
                        {savingId === sub.merchant_name ? '...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Saved subscriptions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Active Subscriptions
          </h2>
          {loadingSaved ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          ) : saved.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No subscriptions saved yet. Click "Detect Subscriptions" to scan your expense history.
              </p>
            </div>
          ) : (
            saved.map(sub => (
              <div
                key={sub.id}
                className="flex items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {sub.merchant_name}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TAG_STYLES[sub.expense_tag] ?? TAG_STYLES.business}`}
                    >
                      {sub.expense_tag}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 capitalize">
                      {sub.frequency}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Next: {formatDate(sub.next_expected_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(sub.amount, sub.currency)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {FREQ_LABELS[sub.frequency] ?? '/mo'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(sub.id)}
                    disabled={deletingId === sub.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                    aria-label="Remove subscription"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
