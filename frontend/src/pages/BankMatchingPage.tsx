import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { usePlaidLink } from 'react-plaid-link'
import {
  getBankTransactions,
  getBankCoverage,
  getPlaidStatus,
  createPlaidLinkToken,
  exchangePlaidToken,
  syncBank,
  removePlaidItem,
  getMatchCandidates,
  matchTransactionToExpense,
  convertTransactionToExpense,
  dismissTransaction,
  importBankCsv,
  type BankTransaction,
  type BankCoverage,
  type PlaidItem,
  type MatchCandidate,
} from '../lib/api'

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'CAD') {
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type Tab = 'unmatched' | 'matched' | 'dismissed'

// ── Plaid connect button (uses usePlaidLink hook) ──────────────────────────

function PlaidConnectButton({
  token,
  onConnected,
  disabled,
}: {
  token: string
  onConnected: () => void
  disabled?: boolean
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function startLink() {
    setLoading(true)
    setError(null)
    try {
      const r = await createPlaidLinkToken(token)
      setLinkToken(r.link_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Plaid Link')
    } finally {
      setLoading(false)
    }
  }

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } | null }) => {
      try {
        await exchangePlaidToken(
          token,
          publicToken,
          metadata?.institution?.name,
          metadata?.institution?.institution_id,
        )
        setLinkToken(null)
        onConnected()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to link bank')
      }
    },
    [token, onConnected],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  })

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={startLink}
        disabled={disabled || loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Connecting…' : 'Connect bank'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// ── Match modal ────────────────────────────────────────────────────────────

function MatchModal({
  token,
  tx,
  onClose,
  onMatched,
}: {
  token: string
  tx: BankTransaction
  onClose: () => void
  onMatched: () => void
}) {
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    getMatchCandidates(token, tx.id)
      .then(r => setCandidates(r.candidates))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }, [token, tx.id])

  async function pick(expenseId: string) {
    setWorking(true)
    try {
      await matchTransactionToExpense(token, tx.id, expenseId)
      onMatched()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Match to expense</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {tx.merchant_name || 'Unknown'} · {fmt(tx.amount, tx.currency)} · {fmtDate(tx.transaction_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">Finding candidates…</p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No likely matches in your existing expenses.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  disabled={working}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {c.merchant_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fmtDate(c.expense_date)} · {c.amount_total != null ? fmt(c.amount_total) : '—'}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {Math.round(c.score * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── transaction row ───────────────────────────────────────────────────────

function TxRow({
  tx,
  onMatch,
  onConvert,
  onDismiss,
}: {
  tx: BankTransaction
  onMatch?: () => void
  onConvert?: () => void
  onDismiss?: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-white">
            {tx.merchant_name || 'Unknown merchant'}
            {tx.pending && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Pending
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {fmtDate(tx.transaction_date)}
            {tx.category && <span className="ml-2">· {tx.category}</span>}
          </p>
          <p className="mt-1 font-semibold text-blue-700 dark:text-blue-300">
            {fmt(tx.amount, tx.currency)}
          </p>
        </div>
        {(onMatch || onConvert || onDismiss) && (
          <div className="flex flex-wrap gap-2">
            {onMatch && (
              <button
                onClick={onMatch}
                className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                Match
              </button>
            )}
            {onConvert && (
              <button
                onClick={onConvert}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
              >
                Convert
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function BankMatchingPage({ session }: { session: Session }) {
  const token = session.access_token

  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [coverage, setCoverage] = useState<BankCoverage | null>(null)
  const [items, setItems] = useState<PlaidItem[]>([])
  const [plaidConfigured, setPlaidConfigured] = useState(false)
  const [tab, setTab] = useState<Tab>('unmatched')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [matchingTx, setMatchingTx] = useState<BankTransaction | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [txs, cov, status] = await Promise.all([
        getBankTransactions(token),
        getBankCoverage(token).catch(() => null),
        getPlaidStatus(token).catch(() => ({ configured: false, items: [] as PlaidItem[] })),
      ])
      setTransactions(txs)
      setCoverage(cov)
      setItems(status.items)
      setPlaidConfigured(status.configured)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSync(itemId?: string) {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await syncBank(token, itemId)
      setSyncResult(`Added ${r.added} · auto-matched ${r.auto_matched}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleRemove(itemRowId: string) {
    if (!confirm('Disconnect this bank? Existing transactions stay but no new ones will sync.')) return
    try {
      await removePlaidItem(token, itemRowId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    }
  }

  async function handleConvert(txId: string) {
    try {
      await convertTransactionToExpense(token, txId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Convert failed')
    }
  }

  async function handleDismiss(txId: string) {
    try {
      await dismissTransaction(token, txId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed')
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      await importBankCsv(file, token)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── derived lists ────────────────────────────────────────────────────────

  const filtered = transactions.filter(t => {
    const status = t.status || (t.matched_expense_id ? 'matched' : 'unmatched')
    return status === tab
  })

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Matching</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Connect your bank and auto-match transactions to receipts
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
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            {plaidConfigured && (
              <PlaidConnectButton token={token} onConnected={load} />
            )}
          </div>
        </div>

        {!plaidConfigured && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
            Plaid is not configured on this server. Bank linking is unavailable —
            CSV import still works. Set <code>PLAID_CLIENT_ID</code> and{' '}
            <code>PLAID_SECRET</code> on the backend to enable.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {syncResult && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-300">
            {syncResult}
          </div>
        )}

        {/* Coverage */}
        {coverage && coverage.total_transactions > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-gray-900 dark:text-white">
                {coverage.coverage_pct}% receipt coverage
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {coverage.matched} matched · {coverage.unmatched_transactions} missing receipts ·{' '}
                {coverage.extra_receipts} extra
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

        {/* Connected banks */}
        {items.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              Connected banks
            </h2>
            <div className="space-y-2">
              {items.map(it => (
                <div
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {it.institution_name || 'Bank'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {it.status === 'active' ? 'Active' : it.status} ·{' '}
                      {it.last_sync_at
                        ? `last synced ${new Date(it.last_sync_at).toLocaleString()}`
                        : 'never synced'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSync(it.id)}
                      disabled={syncing}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                    <button
                      onClick={() => handleRemove(it.id)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {(['unmatched', 'matched', 'dismissed'] as Tab[]).map(t => {
            const count = transactions.filter(tx => {
              const s = tx.status || (tx.matched_expense_id ? 'matched' : 'unmatched')
              return s === t
            }).length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                  tab === t
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t} ({count})
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
            <div className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-gray-500 dark:text-gray-400">
              {tab === 'unmatched'
                ? items.length === 0
                  ? 'Connect a bank or import a CSV to get started.'
                  : 'No unmatched transactions — nice work!'
                : `No ${tab} transactions.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(tx => (
              <TxRow
                key={tx.id}
                tx={tx}
                onMatch={tab === 'unmatched' ? () => setMatchingTx(tx) : undefined}
                onConvert={tab === 'unmatched' ? () => handleConvert(tx.id) : undefined}
                onDismiss={tab === 'unmatched' ? () => handleDismiss(tx.id) : undefined}
              />
            ))}
          </div>
        )}

        {matchingTx && (
          <MatchModal
            token={token}
            tx={matchingTx}
            onClose={() => setMatchingTx(null)}
            onMatched={() => {
              setMatchingTx(null)
              load()
            }}
          />
        )}
      </div>
    </div>
  )
}
