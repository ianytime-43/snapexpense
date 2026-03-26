import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminHealth,
  adminTestEndpoints,
  adminListExpenses,
  adminReprocessAll,
  adminReprocessOne,
  adminUpdateExpense,
} from '../lib/api'

const ADMIN_EMAIL = 'thomastom92@gmail.com'

interface Props {
  session: Session
}

interface HealthCheck {
  database?: { status: string; expense_count?: number; message?: string }
  tax_rates?: { status: string; count?: number; message?: string }
  merchant_aliases?: { status: string; count?: number; message?: string }
  vendor_memory?: { status: string; count?: number; message?: string }
  api_keys?: Record<string, string>
  version?: string
  timestamp?: string
}

interface Expense {
  id: string
  merchant_name?: string
  amount_total?: number
  expense_date?: string
  category?: string
  document_type?: string
  alcohol_total?: number
  currency?: string
  status?: string
  [key: string]: unknown
}

export default function AdminPage({ session }: Props) {
  const navigate = useNavigate()
  const token = session.access_token

  // Access guard
  if (session.user.email !== ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 pb-20">
        <p className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Access denied</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-green-600 dark:text-green-400 hover:underline"
        >
          Back to dashboard
        </button>
      </div>
    )
  }

  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState('')

  const [endpointResults, setEndpointResults] = useState<Record<string, string> | null>(null)
  const [endpointLoading, setEndpointLoading] = useState(false)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  const [reprocessAllResult, setReprocessAllResult] = useState<{ processed?: number; errors?: number; total?: number } | null>(null)
  const [reprocessAllLoading, setReprocessAllLoading] = useState(false)
  const [selectedExpenseId, setSelectedExpenseId] = useState('')
  const [reprocessOneResult, setReprocessOneResult] = useState<{ status?: string; updated_fields?: string[]; message?: string } | null>(null)
  const [reprocessOneLoading, setReprocessOneLoading] = useState(false)

  // Load health on mount
  useEffect(() => {
    handleLoadHealth()
    handleLoadExpenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLoadHealth() {
    setHealthLoading(true)
    setHealthError('')
    try {
      const data = await adminHealth(token)
      setHealth(data)
    } catch (e) {
      setHealthError(String(e))
    } finally {
      setHealthLoading(false)
    }
  }

  async function handleTestEndpoints() {
    setEndpointLoading(true)
    try {
      const data = await adminTestEndpoints(token)
      setEndpointResults(data)
    } catch (e) {
      setEndpointResults({ error: String(e) })
    } finally {
      setEndpointLoading(false)
    }
  }

  async function handleLoadExpenses() {
    setExpensesLoading(true)
    try {
      const data = await adminListExpenses(token)
      setExpenses(data.expenses || [])
    } catch {
      setExpenses([])
    } finally {
      setExpensesLoading(false)
    }
  }

  async function handleReprocessAll() {
    setReprocessAllLoading(true)
    setReprocessAllResult(null)
    try {
      const data = await adminReprocessAll(token)
      setReprocessAllResult(data)
      await handleLoadExpenses()
    } catch (e) {
      setReprocessAllResult({ processed: 0, errors: 0, total: 0 })
    } finally {
      setReprocessAllLoading(false)
    }
  }

  async function handleReprocessOne() {
    if (!selectedExpenseId) return
    setReprocessOneLoading(true)
    setReprocessOneResult(null)
    try {
      const data = await adminReprocessOne(token, selectedExpenseId)
      setReprocessOneResult(data)
      await handleLoadExpenses()
    } catch (e) {
      setReprocessOneResult({ status: 'error', message: String(e) })
    } finally {
      setReprocessOneLoading(false)
    }
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id)
    setEditMsg('')
    setEditFields({
      merchant_name: String(expense.merchant_name ?? ''),
      amount_total: String(expense.amount_total ?? ''),
      category: String(expense.category ?? ''),
      document_type: String(expense.document_type ?? ''),
      expense_date: String(expense.expense_date ?? ''),
      currency: String(expense.currency ?? ''),
      status: String(expense.status ?? ''),
    })
  }

  async function handleSaveEdit(expenseId: string) {
    setEditSaving(true)
    setEditMsg('')
    try {
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(editFields)) {
        if (v !== '') updates[k] = v
      }
      await adminUpdateExpense(token, expenseId, updates)
      setEditMsg('Saved.')
      setEditingId(null)
      await handleLoadExpenses()
    } catch (e) {
      setEditMsg(`Error: ${String(e)}`)
    } finally {
      setEditSaving(false)
    }
  }

  function StatusDot({ ok }: { ok: boolean }) {
    return (
      <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">thomastom92@gmail.com</span>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20">

        {/* 1. System Health */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">System Health</h2>
            <button
              onClick={handleLoadHealth}
              disabled={healthLoading}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {healthLoading ? 'Checking…' : 'Refresh'}
            </button>
          </div>

          {healthError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{healthError}</p>
          )}

          {health ? (
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <StatusDot ok={health.database?.status === 'ok'} />
                <span className="font-medium">Database</span>
                {health.database?.status === 'ok'
                  ? <span className="ml-auto text-gray-400 dark:text-gray-500">{health.database.expense_count} expenses</span>
                  : <span className="ml-auto text-red-500 text-xs truncate max-w-xs">{health.database?.message}</span>
                }
              </div>
              <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <StatusDot ok={health.tax_rates?.status === 'ok'} />
                <span className="font-medium">Tax Rates</span>
                <span className="ml-auto text-gray-400 dark:text-gray-500">{health.tax_rates?.count ?? '—'} rows</span>
              </div>
              <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <StatusDot ok={health.merchant_aliases?.status === 'ok'} />
                <span className="font-medium">Merchant Aliases</span>
                <span className="ml-auto text-gray-400 dark:text-gray-500">{health.merchant_aliases?.count ?? '—'} rows</span>
              </div>
              <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <StatusDot ok={health.vendor_memory?.status === 'ok'} />
                <span className="font-medium">Vendor Memory</span>
                <span className="ml-auto text-gray-400 dark:text-gray-500">{health.vendor_memory?.count ?? '—'} rows</span>
              </div>

              {health.api_keys && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">API Keys</p>
                  <div className="space-y-1">
                    {Object.entries(health.api_keys).map(([key, val]) => (
                      <div key={key} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                        <StatusDot ok={val === 'set'} />
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className={`ml-auto font-medium ${val === 'set' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-400 dark:text-gray-500">
                <span>Version {health.version}</span>
                <span>{health.timestamp ? new Date(health.timestamp).toLocaleString() : ''}</span>
              </div>
            </div>
          ) : (
            !healthLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Click Refresh to load.</p>
          )}
        </div>

        {/* 2. Endpoint Tests */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Endpoint Tests</h2>
            <button
              onClick={handleTestEndpoints}
              disabled={endpointLoading}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {endpointLoading ? 'Testing…' : 'Test All Endpoints'}
            </button>
          </div>

          {endpointResults && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Endpoint</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {Object.entries(endpointResults).map(([name, status]) => (
                    <tr key={name}>
                      <td className="py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">{name}</td>
                      <td className="py-2 text-right">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          <span className={`w-2 h-2 rounded-full ${status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                          {status === 'ok' ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!endpointResults && !endpointLoading && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Click the button to run tests.</p>
          )}
        </div>

        {/* 3. Re-process Receipts */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Re-process Receipts</h2>

          <div className="space-y-4">
            {/* Re-process all */}
            <div>
              <button
                onClick={handleReprocessAll}
                disabled={reprocessAllLoading}
                className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {reprocessAllLoading ? 'Processing…' : 'Re-process ALL receipts'}
              </button>
              {reprocessAllResult && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Processed <strong className="text-gray-900 dark:text-white">{reprocessAllResult.processed}</strong> of{' '}
                  <strong className="text-gray-900 dark:text-white">{reprocessAllResult.total}</strong>,{' '}
                  <span className={reprocessAllResult.errors ? 'text-red-600 dark:text-red-400' : ''}>{reprocessAllResult.errors} errors</span>
                </p>
              )}
            </div>

            {/* Re-process individual */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Re-process individual expense</p>
              <div className="flex gap-2">
                <select
                  value={selectedExpenseId}
                  onChange={e => setSelectedExpenseId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select expense…</option>
                  {expenses.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.merchant_name || 'Unknown'} — {e.expense_date || '—'} — ${e.amount_total ?? '?'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleReprocessOne}
                  disabled={!selectedExpenseId || reprocessOneLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {reprocessOneLoading ? '…' : 'Re-process'}
                </button>
              </div>
              {reprocessOneResult && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  {reprocessOneResult.status === 'ok'
                    ? <span className="text-green-600 dark:text-green-400">Updated: {reprocessOneResult.updated_fields?.join(', ')}</span>
                    : <span className="text-amber-600 dark:text-amber-400">{reprocessOneResult.status}: {reprocessOneResult.message}</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Expenses Viewer */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Expenses Viewer <span className="text-sm font-normal text-gray-400 dark:text-gray-500">({expenses.length})</span>
            </h2>
            <button
              onClick={handleLoadExpenses}
              disabled={expensesLoading}
              className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {expensesLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {editMsg && (
            <p className="text-sm text-green-600 dark:text-green-400 mb-3">{editMsg}</p>
          )}

          {expenses.length === 0 && !expensesLoading && (
            <p className="text-sm text-gray-400 dark:text-gray-500">No expenses found.</p>
          )}

          <div className="space-y-2">
            {expenses.map(expense => (
              <div key={expense.id} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Summary row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                  onClick={() => setExpandedId(expandedId === expense.id ? null : expense.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {expense.merchant_name || 'Unknown merchant'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {expense.expense_date || '—'} · {expense.category || '—'} · {expense.document_type || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {expense.currency || '$'}{expense.amount_total ?? '?'}
                    </p>
                    {expense.alcohol_total ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">alc: {expense.alcohol_total}</p>
                    ) : null}
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${expandedId === expense.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded: all fields */}
                {expandedId === expense.id && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-750">
                    {editingId === expense.id ? (
                      /* Edit form */
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Edit fields</p>
                        {Object.entries(editFields).map(([field, val]) => (
                          <div key={field} className="flex items-center gap-3">
                            <label className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">{field}</label>
                            <input
                              value={val}
                              onChange={e => setEditFields(prev => ({ ...prev, [field]: e.target.value }))}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleSaveEdit(expense.id)}
                            disabled={editSaving}
                            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* All fields view */
                      <div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                          {Object.entries(expense).filter(([k]) => k !== 'id').map(([k, v]) => (
                            <div key={k} className="flex gap-1">
                              <span className="text-gray-400 dark:text-gray-500 shrink-0">{k}:</span>
                              <span className="text-gray-700 dark:text-gray-300 truncate">{String(v ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">id: {expense.id}</p>
                        <button
                          onClick={() => startEdit(expense)}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 5. Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reload Schema Cache</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Run this in the Supabase Dashboard SQL Editor to reload the PostgREST schema cache:
              </p>
              <pre className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-2 overflow-x-auto">
                NOTIFY pgrst, 'reload schema';
              </pre>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check Railway Version</p>
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 inline-block bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Open /api/health in new tab
              </a>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
