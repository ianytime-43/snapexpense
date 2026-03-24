import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getBankTransactions,
  getBankCoverage,
  importBankCsv,
  unmatchTransaction,
  type BankTransaction,
  type BankCoverage,
} from '../lib/api'
import { getExpenses } from '../lib/api'

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function confidenceBadge(score?: number) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const colour =
    pct >= 90
      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      : pct >= 70
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colour}`}>{pct}%</span>
  )
}

// ── skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />
}

function MatchedSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full self-center" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

// ── transaction card ───────────────────────────────────────────────────────

function TxCard({ tx }: { tx: BankTransaction }) {
  return (
    <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
      <p className="font-medium text-gray-900 dark:text-white">
        {tx.merchant_name || 'Unknown merchant'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{fmtDate(tx.transaction_date)}</p>
      <p className="mt-1 font-semibold text-blue-700 dark:text-blue-300">
        {fmt(tx.amount, tx.currency)}
      </p>
      {tx.account_name && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{tx.account_name}</p>
      )}
    </div>
  )
}

function ReceiptCard({ exp }: { exp: NonNullable<BankTransaction['expenses']> }) {
  return (
    <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
      <p className="font-medium text-gray-900 dark:text-white">
        {exp.merchant_name || 'Unknown merchant'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{fmtDate(exp.expense_date)}</p>
      <p className="mt-1 font-semibold text-green-700 dark:text-green-300">
        {exp.amount_total != null ? fmt(exp.amount_total) : '—'}
      </p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 capitalize">
        {exp.status || 'draft'}
      </p>
    </div>
  )
}

// ── IRS note ───────────────────────────────────────────────────────────────

function IrsNote() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
      <strong>IRS $75 rule (US users):</strong> Non-lodging business expenses under $75 do not
      require a receipt — only the date, amount, business purpose, and place.
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function BankMatchingPage({ session }: { session: Session }) {
  const token = session.access_token

  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [expenses, setExpenses] = useState<{ id: string; merchant_name?: string; amount_total?: number; expense_date?: string; status?: string }[]>([])
  const [coverage, setCoverage] = useState<BankCoverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; auto_matched: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [txs, exps, cov] = await Promise.all([
        getBankTransactions(token),
        getExpenses(token),
        getBankCoverage(token).catch(() => null),
      ])
      setTransactions(txs)
      setExpenses(exps)
      setCoverage(cov)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── CSV import ───────────────────────────────────────────────────────────

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await importBankCsv(file, token)
      setImportResult(result)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── unmatch ──────────────────────────────────────────────────────────────

  async function handleUnmatch(txId: string) {
    try {
      await unmatchTransaction(txId, token)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to unmatch')
    }
  }

  // ── confirm all ──────────────────────────────────────────────────────────

  async function confirmAll() {
    setConfirming(true)
    const matched = transactions.filter(t => t.matched_expense_id)
    setConfirmed(new Set(matched.map(t => t.id)))
    setConfirming(false)
  }

  // ── derived lists ────────────────────────────────────────────────────────

  const autoMatched = transactions.filter(
    t => t.matched_expense_id && t.match_confidence != null && t.match_confidence >= 0.9,
  )
  const suggested = transactions.filter(
    t => t.matched_expense_id && t.match_confidence != null && t.match_confidence < 0.9,
  )
  const unmatchedTx = transactions.filter(t => !t.matched_expense_id)

  const matchedExpenseIds = new Set(
    transactions.filter(t => t.matched_expense_id).map(t => t.matched_expense_id!),
  )
  const unmatchedReceipts = expenses.filter(e => !matchedExpenseIds.has(e.id))

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Matching</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Match bank transactions to scanned receipts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvImport}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            {(autoMatched.length > 0 || suggested.length > 0) && (
              <button
                onClick={confirmAll}
                disabled={confirming}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
              >
                {confirming ? 'Confirming…' : 'Confirm all matches'}
              </button>
            )}
          </div>
        </div>

        {/* Import result */}
        {importResult && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-300">
            Imported {importResult.imported} transactions — {importResult.auto_matched} auto-matched
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Coverage bar */}
        {coverage && coverage.total_transactions > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-gray-900 dark:text-white">
                {coverage.coverage_pct}% receipt coverage
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {coverage.matched} matched &middot; {coverage.unmatched_transactions} missing
                receipts &middot; {coverage.extra_receipts} extra receipts
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${coverage.coverage_pct}%` }}
              />
            </div>
          </div>
        )}

        {/* IRS note */}
        <div className="mb-6">
          <IrsNote />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <MatchedSkeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Auto-matched */}
            {(autoMatched.length > 0 || suggested.length > 0) && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  Auto-Matched
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({autoMatched.length + suggested.length})
                  </span>
                </h2>
                <div className="space-y-3">
                  {[...autoMatched, ...suggested].map(tx => (
                    <div
                      key={tx.id}
                      className={`rounded-xl border bg-white p-4 dark:bg-gray-900 ${
                        confirmed.has(tx.id)
                          ? 'border-green-400 dark:border-green-600'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <TxCard tx={tx} />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          {confidenceBadge(tx.match_confidence)}
                          <svg
                            className="h-5 w-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7h8M8 12h8M8 17h8"
                            />
                          </svg>
                        </div>
                        <div className="flex-1">
                          {tx.expenses ? (
                            <ReceiptCard exp={tx.expenses} />
                          ) : (
                            <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-400 dark:bg-gray-800">
                              Receipt not loaded
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleUnmatch(tx.id)}
                          title="Remove match"
                          className="ml-1 rounded p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Unmatched transactions */}
            {unmatchedTx.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  Unmatched Transactions
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    — need receipts ({unmatchedTx.length})
                  </span>
                </h2>
                <div className="space-y-2">
                  {unmatchedTx.map(tx => (
                    <div
                      key={tx.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <TxCard tx={tx} />
                      {tx.amount < 75 && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          Under $75 — receipt may not be required (IRS rule, US only)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Unmatched receipts */}
            {unmatchedReceipts.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  Unmatched Receipts
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    — extra receipts ({unmatchedReceipts.length})
                  </span>
                </h2>
                <div className="space-y-2">
                  {unmatchedReceipts.map(exp => (
                    <div
                      key={exp.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <ReceiptCard exp={exp} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {transactions.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-900">
                <p className="text-gray-500 dark:text-gray-400">
                  No bank transactions yet.
                </p>
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                  Import a CSV from your bank to get started.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Import CSV
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
