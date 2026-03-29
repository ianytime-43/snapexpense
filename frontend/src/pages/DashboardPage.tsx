import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BulkActions from '../components/BulkActions'
import ScanStreak from '../components/ScanStreak'
import { SkeletonCard, SkeletonStats } from '../components/Skeleton'
import SwipeableCard from '../components/SwipeableCard'
import UndoToast from '../components/UndoToast'
import { confirmExpense, deleteExpense, getExpenses, getGroups, naturalSearch } from '../lib/api'
import type { Expense, ExpenseGroup } from '../types'

interface Props {
  session: Session
}

const STATUS_STYLES: Record<string, string> = {
  draft:      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  submitted:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reimbursed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  draft:      'Pending Review',
  confirmed:  'Confirmed',
  submitted:  'Submitted',
  reimbursed: 'Reimbursed',
}

const STATUS_ORDER = ['draft', 'confirmed', 'submitted', 'reimbursed']

function formatCAD(amount: number | null, currency = 'CAD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

function thisMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(start), end: fmt(now) }
}

function ExpenseCard({ expense, preventNav }: { expense: Expense; preventNav?: boolean }) {
  return (
    <Link
      to={`/expenses/${expense.id}`}
      onClick={preventNav ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-green-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {expense.merchant_name ?? 'Unknown merchant'}
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[expense.status] ?? ''}`}
            >
              {STATUS_LABELS[expense.status] ?? expense.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
            <span>
              {expense.expense_date ??
                new Date(expense.created_at).toLocaleDateString('en-CA')}
            </span>
            {expense.client_name && (
              <>
                <span>·</span>
                <span className="truncate">{expense.client_name}</span>
              </>
            )}
            {expense.category && (
              <>
                <span>·</span>
                <span className="truncate">{expense.category}</span>
              </>
            )}
            {expense.location_jurisdiction && (
              <>
                <span>·</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                  {expense.location_jurisdiction}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-900 dark:text-white">
            {expense.amount_total != null
              ? formatCAD(expense.amount_total, expense.currency)
              : '—'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{expense.currency}</p>
        </div>
      </div>
    </Link>
  )
}

export default function DashboardPage({ session }: Props) {
  const { t } = useTranslation()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [groupByTrip, setGroupByTrip] = useState(false)
  const [tripGroups, setTripGroups] = useState<ExpenseGroup[]>([])
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [undoAction, setUndoAction] = useState<{
    message: string
    undo: () => void
    onExpire: () => void
  } | null>(null)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Expense[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const navigate = useNavigate()
  const exportRef = useRef<HTMLDivElement>(null)

  const { start: defaultStart, end: defaultEnd } = thisMonthRange()
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  useEffect(() => {
    getExpenses(session.access_token)
      .then(setExpenses)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    if (groupByTrip) {
      getGroups(session.access_token).then(setTripGroups).catch(() => {})
    }
  }, [groupByTrip, session])

  // Close export panel on outside click
  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'docx') => {
    setExporting(true)
    setExportError(null)
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
      const apiUrl = import.meta.env.VITE_API_URL ?? ''
      const response = await fetch(`${apiUrl}/api/export/${format}?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Export failed' }))
        throw new Error(err.detail ?? `HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = format === 'excel' ? 'xlsx' : format
      a.download = `expenses_${startDate}_to_${endDate}.${ext}`
      a.style.display = 'none'
      document.body.appendChild(a)
      setTimeout(() => {
        a.click()
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 1000)
      }, 100)
      setShowExport(false)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleSwipeConfirm = async (expense: Expense) => {
    try {
      await confirmExpense(expense.id, session.access_token)
      setExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, status: 'confirmed' } : e))
      if (navigator.vibrate) navigator.vibrate(50)
    } catch { /* ignore */ }
  }

  const handleSwipeDelete = (expense: Expense) => {
    const original = expenses
    setExpenses(prev => prev.filter(e => e.id !== expense.id))

    setUndoAction({
      message: `Deleted ${expense.merchant_name || 'expense'}`,
      undo: () => {
        setExpenses(original)
        setUndoAction(null)
      },
      onExpire: async () => {
        try {
          await deleteExpense(expense.id, session.access_token)
        } catch {
          setExpenses(original)
        }
        setUndoAction(null)
      },
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkConfirm = async () => {
    setBulkProcessing(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => confirmExpense(id, session.access_token))
      )
      setExpenses(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, status: 'confirmed' } : e))
      setBulkMode(false)
      setSelectedIds(new Set())
    } catch { /* ignore */ }
    finally { setBulkProcessing(false) }
  }

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} expenses?`)) return
    const original = expenses
    const idsToDelete = Array.from(selectedIds)
    setExpenses(prev => prev.filter(e => !selectedIds.has(e.id)))
    setBulkMode(false)
    setSelectedIds(new Set())

    setUndoAction({
      message: `Deleted ${idsToDelete.length} expenses`,
      undo: () => {
        setExpenses(original)
        setUndoAction(null)
      },
      onExpire: async () => {
        try {
          await Promise.all(idsToDelete.map(id => deleteExpense(id, session.access_token)))
        } catch {
          setExpenses(original)
        }
        setUndoAction(null)
      },
    })
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    try {
      const res = await naturalSearch(searchQuery, session.access_token)
      setSearchResults(res.results)
    } catch { setSearchResults([]) }
    finally { setSearchLoading(false) }
  }

  // Stats
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().split('T')[0]
  const thisMonth = expenses.filter(
    (e) => e.expense_date && e.expense_date >= monthStart && e.expense_date <= today,
  )
  const thisMonthTotal = thisMonth.reduce((s, e) => s + (e.amount_total ?? 0), 0)
  const pending = expenses.filter((e) => e.status === 'draft')
  const pendingTotal = pending.reduce((s, e) => s + (e.amount_total ?? 0), 0)
  const confirmed = expenses.filter((e) => e.status === 'confirmed')
  const confirmedTotal = confirmed.reduce((s, e) => s + (e.amount_total ?? 0), 0)

  // Group by status
  const groups = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    items: expenses.filter((e) => e.status === status),
  })).filter((g) => g.items.length > 0)

  // Available jurisdictions
  const availableJurisdictions = Array.from(
    new Set(expenses.map(e => e.location_jurisdiction).filter(Boolean) as string[])
  ).sort()

  // Filtered expenses
  const filteredExpenses = jurisdictionFilter
    ? expenses.filter(e => e.location_jurisdiction === jurisdictionFilter)
    : expenses

  const filteredGroups = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    items: filteredExpenses.filter((e) => e.status === status),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-cream-50 dark:bg-forest-900">
      <header className="bg-white dark:bg-forest-800 border-b border-cream-300 dark:border-forest-600 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-forest-100">{t('app_name')}</h1>

          <div className="flex items-center gap-1.5">
            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => { setShowExport(!showExport); setExportError(null) }}
                className="p-2 text-gray-400 dark:text-forest-300 hover:text-gray-600 dark:hover:text-forest-100 transition-colors"
                aria-label="Export"
                title="Export"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              {showExport && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-gray-200 shadow-lg p-4 z-20">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Date Range
                  </p>
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 block mb-1">From</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 block mb-1">To</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  {exportError && (
                    <p className="text-xs text-red-600 mb-2">{exportError}</p>
                  )}
                  <div className="flex gap-2">
                    {(['pdf', 'excel', 'csv', 'docx'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        disabled={exporting}
                        className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 uppercase tracking-wide"
                      >
                        {exporting ? '…' : fmt === 'docx' ? 'Word' : fmt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bulk select */}
            <button
              onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()) }}
              className={`p-2 rounded-lg transition-colors ${bulkMode ? 'bg-green-100 dark:bg-forest-500 text-green-700 dark:text-forest-100' : 'text-gray-400 dark:text-forest-300 hover:text-gray-600'}`}
              aria-label="Bulk select">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          </div>
        </div>
      </header>


      <main className="max-w-2xl mx-auto px-4 py-6 pb-20">
        {/* Stats bar */}
        {!loading && expenses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('dashboard.this_month')}</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {formatCAD(thisMonthTotal)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {thisMonth.length} {t('dashboard.expenses')}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-900 p-3">
              <p className="text-xs text-yellow-600 mb-1">{t('dashboard.pending')}</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {formatCAD(pendingTotal)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{pending.length} {t('dashboard.to_review')}</p>
              {pending.length > 0 && (
                <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-0.5">New imports need review</p>
              )}
            </div>
            <button
              onClick={() => confirmed.length > 0 && navigate('/submit-session')}
              className={`bg-white dark:bg-gray-800 rounded-xl border border-green-200 dark:border-green-900 p-3 text-left w-full transition-colors ${confirmed.length > 0 ? 'hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer' : 'cursor-default'}`}
            >
              <p className="text-xs text-green-600 mb-1">{t('dashboard.confirmed')}</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {formatCAD(confirmedTotal)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {confirmed.length > 0
                  ? `${confirmed.length} ${t('dashboard.ready_to_submit')} →`
                  : `0 ${t('dashboard.expenses')}`}
              </p>
            </button>
          </div>
        )}

        {/* Scan streak */}
        {!loading && expenses.length > 0 && (
          <ScanStreak expenses={expenses} />
        )}

        {/* Natural language search */}
        {!loading && expenses.length > 0 && (
          <div className="mb-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.search_placeholder')}
                className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button type="submit" disabled={searchLoading} className="bg-green-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                {searchLoading ? '...' : 'Search'}
              </button>
              {searchResults !== null && (
                <button type="button" onClick={() => { setSearchResults(null); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-2">
                  Clear
                </button>
              )}
            </form>
            {searchResults !== null && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <SkeletonStats />
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        ) : expenses.length === 0 ? (
          /* Onboarding empty state */
          <div className="py-8">
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">📸</div>
              <p className="font-semibold text-gray-800 dark:text-white text-lg">{t('dashboard.welcome')}</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Capture and track your business expenses in seconds
              </p>
            </div>
            <div className="space-y-3">
              {[
                {
                  step: '1',
                  title: 'Upload a receipt',
                  desc: 'Photo, PDF, or forward an email — we extract the details automatically.',
                  action: () => navigate('/upload'),
                  cta: 'Upload receipt',
                },
                {
                  step: '2',
                  title: 'Connect Google Calendar',
                  desc: 'Auto-fill client and purpose from your meeting history.',
                  action: () => navigate('/settings'),
                  cta: 'Open Settings',
                },
                {
                  step: '3',
                  title: 'Export your report',
                  desc: "Download PDF, Excel, or CSV when you're ready to submit.",
                  action: null,
                  cta: null,
                },
              ].map(({ step, title, desc, action, cta }) => (
                <div
                  key={step}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-4"
                >
                  <span className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold shrink-0">
                    {step}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{title}</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                  {action && cta && (
                    <button
                      onClick={action}
                      className="shrink-0 text-xs text-green-600 font-medium hover:text-green-700"
                    >
                      {cta} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : searchResults !== null ? (
          /* Search results view */
          <div className="space-y-4">
            {searchResults.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">No results found</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map(expense => (
                  <ExpenseCard key={expense.id} expense={expense} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Jurisdiction filter */}
            {availableJurisdictions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 dark:text-gray-500">Filter by location:</span>
                <button
                  onClick={() => setJurisdictionFilter(null)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${!jurisdictionFilter ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  All
                </button>
                {availableJurisdictions.map(j => (
                  <button
                    key={j}
                    onClick={() => setJurisdictionFilter(j === jurisdictionFilter ? null : j)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${jurisdictionFilter === j ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    {j}
                  </button>
                ))}
              </div>
            )}

            {groupByTrip ? (
              /* Trip-grouped view */
              <div className="space-y-6">
                {tripGroups.map(tg => {
                  const groupExpenses = filteredExpenses.filter(e => e.group_id === tg.id)
                  if (groupExpenses.length === 0) return null
                  const subtotal = groupExpenses.reduce((s, e) => s + (e.amount_total ?? 0), 0)
                  return (
                    <div key={tg.id}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{tg.title}</h2>
                          {(tg.trip_date_start || tg.trip_date_end) && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {tg.trip_date_start ?? ''}{tg.trip_date_start && tg.trip_date_end ? ' – ' : ''}{tg.trip_date_end ?? ''}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCAD(subtotal)}</span>
                          <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">{groupExpenses.length}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {groupExpenses.map(expense => (
                          <div
                            key={expense.id}
                            className={`flex items-center gap-2 ${bulkMode ? 'cursor-pointer' : ''}`}
                            onClick={bulkMode ? () => toggleSelect(expense.id) : undefined}
                          >
                            {bulkMode && (
                              <div className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                selectedIds.has(expense.id)
                                  ? 'bg-green-600 border-green-600'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {selectedIds.has(expense.id) && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            )}
                            <div className="flex-1">
                              <SwipeableCard
                                onSwipeRight={expense.status === 'draft' ? () => handleSwipeConfirm(expense) : undefined}
                                onSwipeLeft={() => handleSwipeDelete(expense)}
                                disabled={bulkMode}
                              >
                                <ExpenseCard expense={expense} preventNav={bulkMode} />
                              </SwipeableCard>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* Ungrouped */}
                {(() => {
                  const ungrouped = filteredExpenses.filter(e => !e.group_id)
                  if (ungrouped.length === 0) return null
                  const subtotal = ungrouped.reduce((s, e) => s + (e.amount_total ?? 0), 0)
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Ungrouped</h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{ungrouped.length} · {formatCAD(subtotal)}</span>
                      </div>
                      <div className="space-y-2">
                        {ungrouped.map(expense => (
                          <div
                            key={expense.id}
                            className={`flex items-center gap-2 ${bulkMode ? 'cursor-pointer' : ''}`}
                            onClick={bulkMode ? () => toggleSelect(expense.id) : undefined}
                          >
                            {bulkMode && (
                              <div className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                selectedIds.has(expense.id)
                                  ? 'bg-green-600 border-green-600'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {selectedIds.has(expense.id) && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            )}
                            <div className="flex-1">
                              <SwipeableCard
                                onSwipeRight={expense.status === 'draft' ? () => handleSwipeConfirm(expense) : undefined}
                                onSwipeLeft={() => handleSwipeDelete(expense)}
                                disabled={bulkMode}
                              >
                                <ExpenseCard expense={expense} preventNav={bulkMode} />
                              </SwipeableCard>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              /* Normal status-grouped view */
              <div className="space-y-6">
                {filteredGroups.map(({ status, label, items }) => {
                  const groupTotal = items.reduce((s, e) => s + (e.amount_total ?? 0), 0)
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          {label}
                        </h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {items.length} · {formatCAD(groupTotal)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {items.map((expense) => (
                          <div
                            key={expense.id}
                            className={`flex items-center gap-2 ${bulkMode ? 'cursor-pointer' : ''}`}
                            onClick={bulkMode ? () => toggleSelect(expense.id) : undefined}
                          >
                            {bulkMode && (
                              <div className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                selectedIds.has(expense.id)
                                  ? 'bg-green-600 border-green-600'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {selectedIds.has(expense.id) && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            )}
                            <div className="flex-1">
                              <SwipeableCard
                                onSwipeRight={expense.status === 'draft' ? () => handleSwipeConfirm(expense) : undefined}
                                onSwipeLeft={() => handleSwipeDelete(expense)}
                                disabled={bulkMode}
                              >
                                <ExpenseCard expense={expense} preventNav={bulkMode} />
                              </SwipeableCard>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {bulkMode && (
        <BulkActions
          selectedCount={selectedIds.size}
          onConfirmAll={handleBulkConfirm}
          onDeleteAll={handleBulkDelete}
          onCancel={() => { setBulkMode(false); setSelectedIds(new Set()) }}
          processing={bulkProcessing}
        />
      )}

      {undoAction && (
        <UndoToast
          message={undoAction.message}
          onUndo={() => { undoAction.undo() }}
          onExpire={() => { undoAction.onExpire() }}
        />
      )}
    </div>
  )
}
