import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  type PublicAccountantExpense,
  type PublicAccountantView,
  fetchPublicAccountantView,
} from '../lib/api'

type Tab = 'receipts' | 'invoices' | 'mileage'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCurrency(value: number | null | undefined, currency = 'CAD'): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
}

function isInvoice(e: PublicAccountantExpense): boolean {
  return String(e.doc_type || '').toLowerCase() === 'invoice'
}

function csvEscape(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, headers: string[]) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AccountantViewPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [data, setData] = useState<PublicAccountantView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tab, setTab] = useState<Tab>('receipts')

  async function load(from?: string, to?: string) {
    if (!token) {
      setError(t('accountant.err_missing_token', 'Missing access token in URL'))
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      setErrorStatus(null)
      const result = await fetchPublicAccountantView(token, from, to)
      setData(result)
      // Prefill the date filters from the share window on first load.
      if (!dateFrom && result.share.date_range.from) setDateFrom(result.share.date_range.from)
      if (!dateTo && result.share.date_range.to) setDateTo(result.share.date_range.to)
    } catch (e) {
      const err = e as Error & { status?: number }
      setError(err.message)
      setErrorStatus(err.status ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const receipts = useMemo(() => (data?.expenses ?? []).filter(e => !isInvoice(e)), [data])
  const invoices = useMemo(() => (data?.expenses ?? []).filter(e => isInvoice(e)), [data])

  const showReceipts = !!data?.share.include_receipts
  const showInvoices = !!data?.share.include_invoices
  const showMileage = !!data?.share.include_mileage

  // Ensure initial tab is visible.
  useEffect(() => {
    if (!data) return
    if (tab === 'receipts' && !showReceipts) setTab(showInvoices ? 'invoices' : 'mileage')
    if (tab === 'invoices' && !showInvoices) setTab(showReceipts ? 'receipts' : 'mileage')
    if (tab === 'mileage' && !showMileage) setTab(showReceipts ? 'receipts' : 'invoices')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function exportCurrentTabCsv() {
    if (!data) return
    if (tab === 'mileage' && data.mileage) {
      downloadCsv(
        `mileage_${dateFrom || 'all'}_${dateTo || 'all'}.csv`,
        data.mileage.trips as unknown as Array<Record<string, unknown>>,
        ['trip_date', 'start_address', 'end_address', 'distance_km', 'trip_tag', 'notes'],
      )
      return
    }
    const rows = (tab === 'invoices' ? invoices : receipts) as unknown as Array<Record<string, unknown>>
    downloadCsv(
      `${tab}_${dateFrom || 'all'}_${dateTo || 'all'}.csv`,
      rows,
      ['expense_date', 'merchant_name', 'category', 'amount_total', 'tax_total', 'province', 'doc_type'],
    )
  }

  if (!token) {
    return (
      <ErrorScreen
        title={t('accountant.err_missing_token_title', 'No access token')}
        message={t('accountant.err_missing_token', 'Missing access token in URL')}
      />
    )
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  if (error && !data) {
    const msg =
      errorStatus === 429
        ? t('accountant.err_rate_limit', 'Too many requests. Try again in a minute.')
        : errorStatus === 401
          ? t('accountant.err_invalid_or_expired', 'This link is invalid, expired, or has been revoked.')
          : error
    return <ErrorScreen title={t('accountant.err_cannot_load', 'Cannot load share')} message={msg} />
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-12">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-green-700 dark:text-green-400 font-semibold">
                {t('accountant.read_only_view', 'Read-only accountant view')}
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                {data.share.label || t('accountant.shared_expenses', 'Shared expenses')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('accountant.shared_by', 'Shared by')} {data.share.owner_email_masked}
                {data.share.expires_at && (
                  <>
                    {' · '}
                    {t('accountant.expires', 'expires')} {formatDate(data.share.expires_at)}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={exportCurrentTabCsv}
              className="hidden sm:inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('accountant.export_csv', 'Export CSV')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Date filter */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('accountant.date_from', 'Start date')}
            </label>
            <input
              type="date"
              value={dateFrom}
              min={data.share.date_range.from ?? undefined}
              max={data.share.date_range.to ?? undefined}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('accountant.date_to', 'End date')}
            </label>
            <input
              type="date"
              value={dateTo}
              min={data.share.date_range.from ?? undefined}
              max={data.share.date_range.to ?? undefined}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50"
            />
          </div>
          <button
            onClick={() => load(dateFrom || undefined, dateTo || undefined)}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            {t('accountant.apply', 'Apply')}
          </button>
          <div className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {t('accountant.window', 'Allowed window')}: {formatDate(data.share.date_range.from)} →{' '}
            {formatDate(data.share.date_range.to)}
          </div>
        </section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            label={t('accountant.total_expenses', 'Total expenses')}
            value={String(data.totals.count)}
          />
          <SummaryCard
            label={t('accountant.subtotal', 'Subtotal')}
            value={formatCurrency(data.totals.subtotal)}
          />
          <SummaryCard
            label={t('accountant.tax_total', 'GST/HST + PST')}
            value={formatCurrency(data.totals.tax_total)}
          />
          <SummaryCard
            label={t('accountant.grand_total', 'Grand total')}
            value={formatCurrency(data.totals.grand_total)}
          />
        </section>

        {/* Tabs */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {showReceipts && (
              <TabButton active={tab === 'receipts'} onClick={() => setTab('receipts')}>
                {t('accountant.tab_receipts', 'Receipts')} ({receipts.length})
              </TabButton>
            )}
            {showInvoices && (
              <TabButton active={tab === 'invoices'} onClick={() => setTab('invoices')}>
                {t('accountant.tab_invoices', 'Invoices')} ({invoices.length})
              </TabButton>
            )}
            {showMileage && (
              <TabButton active={tab === 'mileage'} onClick={() => setTab('mileage')}>
                {t('accountant.tab_mileage', 'Mileage')} ({data.mileage?.count ?? 0})
              </TabButton>
            )}
          </div>

          <div className="p-4">
            {tab === 'receipts' && <ExpenseTable rows={receipts} emptyText={t('accountant.no_receipts', 'No receipts in this range.')} />}
            {tab === 'invoices' && <ExpenseTable rows={invoices} emptyText={t('accountant.no_invoices', 'No invoices in this range.')} />}
            {tab === 'mileage' && <MileageTable data={data} />}
          </div>
        </section>

        <div className="sm:hidden">
          <button
            onClick={exportCurrentTabCsv}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900"
          >
            {t('accountant.export_csv', 'Export CSV')}
          </button>
        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{value}</div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
        active
          ? 'border-green-600 text-green-700 dark:text-green-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function ExpenseTable({ rows, emptyText }: { rows: PublicAccountantExpense[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{emptyText}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Merchant</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Province</th>
            <th className="py-2 pr-3 text-right">Tax</th>
            <th className="py-2 pr-0 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(e => (
            <tr key={e.id}>
              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{formatDate(e.expense_date)}</td>
              <td className="py-2 pr-3 text-gray-900 dark:text-gray-50 font-medium">
                {e.merchant_name || '—'}
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{e.category || '—'}</td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{e.province || '—'}</td>
              <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">
                {formatCurrency(
                  (e.tax_total as number | null | undefined) ?? (e.gst_hst as number | null | undefined) ?? 0,
                )}
              </td>
              <td className="py-2 pr-0 text-right text-gray-900 dark:text-gray-50 font-semibold">
                {formatCurrency(e.amount_total as number | null | undefined)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MileageTable({ data }: { data: PublicAccountantView }) {
  const trips = data.mileage?.trips ?? []
  if (trips.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No mileage in this range.</p>
  }
  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Total: {data.mileage?.total_km ?? 0} km across {data.mileage?.count ?? 0} trips
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">From</th>
            <th className="py-2 pr-3">To</th>
            <th className="py-2 pr-3 text-right">Distance (km)</th>
            <th className="py-2 pr-3">Tag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {trips.map(trip => (
            <tr key={trip.id}>
              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{formatDate(trip.trip_date)}</td>
              <td className="py-2 pr-3 text-gray-900 dark:text-gray-50">{trip.start_address || '—'}</td>
              <td className="py-2 pr-3 text-gray-900 dark:text-gray-50">{trip.end_address || '—'}</td>
              <td className="py-2 pr-3 text-right text-gray-900 dark:text-gray-50 font-semibold">
                {trip.distance_km ?? 0}
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{trip.trip_tag || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
        <div className="text-3xl">🔒</div>
        <h1 className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-50">{title}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  )
}
