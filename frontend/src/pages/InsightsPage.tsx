import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnomalies, getSpendingTrends, getTopVendors } from '../lib/api'

interface Props {
  session: Session
}

interface MonthData {
  month: string
  total: number
  business: number
  work: number
  personal: number
  count: number
}

interface VendorData {
  name: string
  total: number
  count: number
}

interface AnomalyAlert {
  category: string
  current_amount: number
  average_amount: number
  pct_change: number
  direction: 'up' | 'down'
  message: string
}

type TagFilter = 'all' | 'business' | 'work' | 'personal'

function formatMonth(ym: string) {
  const [year, month] = ym.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Skeleton block component
function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${className}`} />
}

export default function InsightsPage({ session }: Props) {
  const navigate = useNavigate()

  const [trendsLoading, setTrendsLoading] = useState(true)
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [anomaliesLoading, setAnomaliesLoading] = useState(true)

  const [months, setMonths] = useState<MonthData[]>([])
  const [vendors, setVendors] = useState<VendorData[]>([])
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([])

  const [tagFilter, setTagFilter] = useState<TagFilter>('all')

  useEffect(() => {
    const token = session.access_token

    getSpendingTrends(token, 6)
      .then((data) => setMonths(data.months ?? []))
      .catch(() => setMonths([]))
      .finally(() => setTrendsLoading(false))

    getTopVendors(token, 3)
      .then((data) => setVendors(data.vendors ?? []))
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoading(false))

    getAnomalies(token)
      .then((data) => setAlerts(data.alerts ?? []))
      .catch(() => setAlerts([]))
      .finally(() => setAnomaliesLoading(false))
  }, [session.access_token])

  // Compute bar widths relative to the maximum value for the active filter
  const getBarValue = (m: MonthData): number => {
    if (tagFilter === 'all') return m.total
    return m[tagFilter]
  }

  const maxBarValue = months.reduce((max, m) => Math.max(max, getBarValue(m)), 0)

  const tagColors: Record<TagFilter, string> = {
    all: 'bg-green-500',
    business: 'bg-green-500',
    work: 'bg-blue-500',
    personal: 'bg-gray-400',
  }

  const barColor = tagColors[tagFilter]

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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Spending Insights</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">

        {/* Monthly Trend */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Monthly Trend</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">Last 6 months</span>
          </div>

          {/* Tag filter buttons */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(['all', 'business', 'work', 'personal'] as TagFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  tagFilter === t
                    ? t === 'all' || t === 'business'
                      ? 'bg-green-500 text-white'
                      : t === 'work'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {trendsLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-10 rounded" />
                  <Skeleton className="h-6 flex-1" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              ))}
            </div>
          ) : months.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No expense data yet. Start uploading receipts to see trends.
            </p>
          ) : (
            <div className="space-y-3">
              {months.map((m) => {
                const value = getBarValue(m)
                const widthPct = maxBarValue > 0 ? (value / maxBarValue) * 100 : 0
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10 shrink-0 text-right">
                      {formatMonth(m.month)}
                    </span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-500`}
                        style={{ width: `${widthPct}%`, minWidth: value > 0 ? '4px' : '0' }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-16 text-right shrink-0">
                      {value > 0 ? formatCurrency(value) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          {!trendsLoading && months.length > 0 && tagFilter === 'all' && (
            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Business
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Work
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> Personal
              </span>
            </div>
          )}
        </section>

        {/* Anomaly Alerts */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Spending Alerts</h2>

          {anomaliesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-9 h-9 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No unusual spending patterns detected. Everything looks on track.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const isUp = alert.direction === 'up'
                return (
                  <div
                    key={alert.category}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${
                      isUp
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                        : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isUp ? 'bg-amber-100 dark:bg-amber-800/40' : 'bg-green-100 dark:bg-green-800/40'
                    }`}>
                      {isUp ? (
                        <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        isUp ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-300'
                      }`}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        This month: {formatCurrency(alert.current_amount)} · Avg: {formatCurrency(alert.average_amount)}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${
                      isUp ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'
                    }`}>
                      {isUp ? '+' : ''}{alert.pct_change}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Top Vendors */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Top Vendors</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">Last 3 months</span>
          </div>

          {vendorsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No vendor data for the last 3 months.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {vendors.map((vendor, index) => (
                <div
                  key={vendor.name}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {vendor.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {vendor.count} {vendor.count === 1 ? 'expense' : 'expenses'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                    {formatCurrency(vendor.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
