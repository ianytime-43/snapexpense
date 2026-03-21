import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExpenses, getExpense, getGroup, updateExpense } from '../lib/api'
import type { Expense, ExpenseGroup } from '../types'

interface Props {
  session: Session
}

const PAYMENT_METHODS = [
  { value: 'personal_card', label: 'Personal card' },
  { value: 'corporate_card', label: 'Corporate card' },
  { value: 'cash', label: 'Cash' },
]

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const el = document.createElement('textarea')
      el.value = value
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition-colors"
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

function Row({
  label,
  value,
  copyValue,
}: {
  label: string
  value: React.ReactNode
  copyValue?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0 text-sm text-gray-900">{value ?? <span className="text-gray-400">—</span>}</div>
      {copyValue != null && copyValue.trim() !== '' && (
        <CopyButton value={copyValue} />
      )}
    </div>
  )
}

export default function SubmitSessionPage({ session }: Props) {
  const navigate = useNavigate()
  const [pending, setPending] = useState<Expense[]>([])
  const [submittedCount, setSubmittedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Expense | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [detailGroup, setDetailGroup] = useState<ExpenseGroup | null>(null)

  // Load confirmed expenses
  useEffect(() => {
    getExpenses(session.access_token)
      .then((all: Expense[]) => {
        const confirmed = all.filter(e => e.status === 'confirmed')
        setPending(confirmed)
        setTotalCount(confirmed.length)
        if (confirmed.length > 0) setSelectedId(confirmed[0].id)
      })
      .finally(() => setLoadingList(false))
  }, [session])

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailGroup(null)
      return
    }
    setLoadingDetail(true)
    setDetailGroup(null)
    getExpense(selectedId, session.access_token)
      .then((exp: Expense) => {
        setDetail(exp)
        // Lazily fetch group info
        if (exp.group_id) {
          getGroup(exp.group_id, session.access_token).then(setDetailGroup).catch(() => {})
        }
      })
      .finally(() => setLoadingDetail(false))
  }, [selectedId, session])

  const handleMarkSubmitted = async () => {
    if (!selectedId || !detail) return
    setSubmitting(true)
    try {
      await updateExpense(selectedId, { status: 'submitted' }, session.access_token)
      const remaining = pending.filter(e => e.id !== selectedId)
      setPending(remaining)
      setSubmittedCount(c => c + 1)
      setDetail(null)
      setSelectedId(remaining[0]?.id ?? null)
    } finally {
      setSubmitting(false)
    }
  }

  const allDone = !loadingList && totalCount > 0 && pending.length === 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-500 hover:text-gray-700 p-1 -ml-1"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Submit expenses</h1>
              <p className="text-xs text-gray-400">Copy fields into your expense tool, then mark each as submitted</p>
            </div>
          </div>
          {!loadingList && totalCount > 0 && (
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">
                {submittedCount} / {totalCount}
              </p>
              <p className="text-xs text-gray-400">submitted</p>
            </div>
          )}
        </div>
        {/* Progress bar */}
        {!loadingList && totalCount > 0 && (
          <div className="h-1 bg-gray-100">
            <div
              className="h-1 bg-green-500 transition-all duration-500"
              style={{ width: `${(submittedCount / totalCount) * 100}%` }}
            />
          </div>
        )}
      </header>

      {loadingList ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : totalCount === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-900 font-medium">No confirmed expenses</p>
            <p className="text-sm text-gray-500 mt-1">
              Confirm your draft expenses on the dashboard first.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 text-green-600 text-sm font-medium hover:underline"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      ) : allDone ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-gray-900 font-medium">All expenses submitted!</p>
            <p className="text-sm text-gray-500 mt-1">
              {submittedCount} expense{submittedCount !== 1 ? 's' : ''} marked as submitted.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 text-green-600 text-sm font-medium hover:underline"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-6xl mx-auto w-full px-4 py-4 gap-4">
          {/* Sidebar */}
          <aside className="w-full lg:w-72 shrink-0 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden lg:max-h-none max-h-40">
            <div className="px-3 py-2.5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {pending.length} remaining
              </p>
            </div>
            <ul className="overflow-y-auto flex-1">
              {pending.map(exp => (
                <li key={exp.id}>
                  <button
                    onClick={() => setSelectedId(exp.id)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                      selectedId === exp.id ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {exp.merchant_name ?? 'Unknown merchant'}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-gray-400">{exp.expense_date ?? '—'}</span>
                      <span className="text-xs font-semibold text-gray-700">
                        {exp.amount_total != null ? `$${exp.amount_total.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    {exp.client_name && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{exp.client_name}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Detail panel */}
          <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
              </div>
            ) : detail ? (
              <>
                {/* Group info banner */}
                {detailGroup && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <p className="text-sm text-blue-800 font-medium">
                      Part of: {detailGroup.title}
                      <span className="font-normal text-blue-600 ml-2">
                        · {detailGroup.expense_count} expenses · ${detailGroup.total_amount.toFixed(2)}
                      </span>
                    </p>
                  </div>
                )}

                {/* Receipt image */}
                {detail.receipts?.[0]?.image_url && (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <img
                      src={detail.receipts[0].image_url}
                      alt={`Receipt from ${detail.merchant_name ?? 'merchant'}`}
                      className="w-full max-h-48 object-contain"
                    />
                  </div>
                )}

                {/* Fields */}
                <div className="bg-white rounded-2xl border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Receipt data
                    </p>
                    <Row
                      label="Merchant"
                      value={<span className="font-medium">{detail.merchant_name}</span>}
                      copyValue={detail.merchant_name ?? undefined}
                    />
                    <Row
                      label="Date"
                      value={detail.expense_date}
                      copyValue={detail.expense_date ?? undefined}
                    />
                    <Row
                      label="Total"
                      value={detail.amount_total != null ? <span className="font-semibold">${detail.amount_total.toFixed(2)} {detail.currency}</span> : null}
                      copyValue={detail.amount_total != null ? detail.amount_total.toFixed(2) : undefined}
                    />
                    {detail.amount_tax != null && (
                      <Row
                        label="Tax"
                        value={`$${detail.amount_tax.toFixed(2)}`}
                        copyValue={detail.amount_tax.toFixed(2)}
                      />
                    )}
                    {detail.amount_tip != null && (
                      <Row
                        label="Tip"
                        value={`$${detail.amount_tip.toFixed(2)}`}
                        copyValue={detail.amount_tip.toFixed(2)}
                      />
                    )}
                    <Row
                      label="Payment"
                      value={
                        detail.payment_method
                          ? [
                              PAYMENT_METHODS.find(m => m.value === detail.payment_method)?.label,
                              detail.card_last_four ? `····${detail.card_last_four}` : null,
                            ]
                              .filter(Boolean)
                              .join(' ')
                          : null
                      }
                      copyValue={
                        detail.payment_method
                          ? [
                              PAYMENT_METHODS.find(m => m.value === detail.payment_method)?.label,
                              detail.card_last_four ? `····${detail.card_last_four}` : null,
                            ]
                              .filter(Boolean)
                              .join(' ')
                          : undefined
                      }
                    />
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Business context
                    </p>
                    <Row
                      label="Category"
                      value={detail.category}
                      copyValue={detail.category ?? undefined}
                    />
                    <Row
                      label="Client"
                      value={detail.client_name}
                      copyValue={detail.client_name ?? undefined}
                    />
                    <Row
                      label="Purpose"
                      value={detail.business_purpose}
                      copyValue={detail.business_purpose ?? undefined}
                    />
                    {detail.notes && (
                      <Row
                        label="Notes"
                        value={detail.notes}
                        copyValue={detail.notes}
                      />
                    )}
                    {detail.attendees && detail.attendees.length > 0 && (
                      <Row
                        label="Attendees"
                        value={detail.attendees.map(a => a.name || a.email || '').filter(Boolean).join(', ')}
                        copyValue={detail.attendees.map(a => a.name || a.email || '').filter(Boolean).join(', ')}
                      />
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  onClick={handleMarkSubmitted}
                  disabled={submitting}
                  className="w-full bg-green-600 text-white rounded-xl py-3.5 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Mark as submitted →'}
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Select an expense to begin
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
