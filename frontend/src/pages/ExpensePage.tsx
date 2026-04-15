import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  addExpensesToGroup,
  confirmExpense,
  createGroup,
  deleteExpense,
  getExpense,
  getGroups,
  removeExpenseFromGroup,
  splitExpense,
  updateExpense,
} from '../lib/api'
import SplitExpense from '../components/SplitExpense'
import type { Expense, ExpenseGroup } from '../types'

type CalendarAction = 'accepted' | 'dismissed' | null

interface Props {
  session: Session
}

const CATEGORIES = [
  'Meals & Entertainment',
  'Travel',
  'Accommodation',
  'Transportation',
  'Office Supplies',
  'Software',
  'Marketing',
  'Professional Services',
  'Investment Fees',
  'Other',
]

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
      // intentionally silent: fallback to execCommand for browsers without clipboard API
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
  children,
  copyValue,
}: {
  label: string
  children: React.ReactNode
  copyValue?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0 pt-1">{label}</span>
      <div className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white">{children}</div>
      {copyValue != null && copyValue.trim() !== '' && (
        <CopyButton value={copyValue} />
      )}
    </div>
  )
}

function formatCAD(amount: number | null, currency = 'CAD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

const inputCls =
  'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

export default function ExpensePage({ session }: Props) {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<Expense>>({})
  const [calendarAction, setCalendarAction] = useState<CalendarAction>(null)
  const [groups, setGroups] = useState<ExpenseGroup[]>([])
  const [showGroupDropdown, setShowGroupDropdown] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupSaving, setGroupSaving] = useState(false)
  const groupDropdownRef = useRef<HTMLDivElement>(null)
  const [suggestedTag, setSuggestedTag] = useState<string | null>(null)
  const [tagReason, setTagReason] = useState<string | null>(null)
  const [showSplit, setShowSplit] = useState(false)

  useEffect(() => {
    if (!id) return
    getExpense(id, session.access_token)
      .then((data: Expense) => {
        setExpense(data)
        setForm(data)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id, session])

  useEffect(() => {
    getGroups(session.access_token)
      .then(setGroups)
      .catch((err) => {
        // Non-fatal: group dropdown just stays empty
        console.error('ExpensePage: failed to load groups:', err)
      })
  }, [session])

  useEffect(() => {
    if (!expense) return

    // Simple client-side suggestion based on time
    const expTime = expense.expense_time
    const expDate = expense.expense_date

    if (expense.calendar_match_confidence && expense.calendar_match_confidence >= 0.4) {
      setSuggestedTag('business')
      setTagReason('Calendar match found')
    } else if (expTime && expDate) {
      const hour = parseInt(expTime.split(':')[0], 10)
      const date = new Date(expDate)
      const dayOfWeek = date.getDay() // 0=Sun, 6=Sat
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
      const isWorkHours = hour >= 9 && hour <= 17

      if (isWeekday && isWorkHours) {
        setSuggestedTag('business')
        setTagReason('During work hours')
      } else {
        setSuggestedTag('personal')
        setTagReason('Outside work hours')
      }
    }
  }, [expense])

  // Close group dropdown on outside click
  useEffect(() => {
    if (!showGroupDropdown) return
    const handler = (e: MouseEvent) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setShowGroupDropdown(false)
        setCreatingGroup(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGroupDropdown])

  const handleAddToGroup = async (groupId: string) => {
    if (!id || !expense) return
    setGroupSaving(true)
    try {
      await addExpensesToGroup(groupId, [id], session.access_token)
      const updatedGroups = await getGroups(session.access_token)
      setGroups(updatedGroups)
      setExpense(prev => prev ? { ...prev, group_id: groupId } : prev)
      setShowGroupDropdown(false)
    } catch (err) {
      console.error('Add to group failed:', err)
      setError(err instanceof Error ? err.message : 'Could not add expense to group')
    } finally {
      setGroupSaving(false)
    }
  }

  const handleRemoveFromGroup = async () => {
    if (!id || !expense?.group_id) return
    setGroupSaving(true)
    try {
      await removeExpenseFromGroup(expense.group_id, id, session.access_token)
      const updatedGroups = await getGroups(session.access_token)
      setGroups(updatedGroups)
      setExpense(prev => prev ? { ...prev, group_id: null } : prev)
    } catch (err) {
      console.error('Remove from group failed:', err)
      setError(err instanceof Error ? err.message : 'Could not remove expense from group')
    } finally {
      setGroupSaving(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim() || !id) return
    setGroupSaving(true)
    try {
      const newGroup = await createGroup({ title: newGroupTitle.trim() }, session.access_token)
      await addExpensesToGroup(newGroup.id, [id], session.access_token)
      const updatedGroups = await getGroups(session.access_token)
      setGroups(updatedGroups)
      setExpense(prev => prev ? { ...prev, group_id: newGroup.id } : prev)
      setNewGroupTitle('')
      setCreatingGroup(false)
      setShowGroupDropdown(false)
    } catch (err) {
      console.error('Create group failed:', err)
      setError(err instanceof Error ? err.message : 'Could not create group')
    } finally {
      setGroupSaving(false)
    }
  }

  const handleTagChange = async (tag: string) => {
    if (!expense) return
    const prevTag = expense.expense_tag
    // Optimistic update
    setExpense(prev => prev ? { ...prev, expense_tag: tag as Expense['expense_tag'] } : prev)
    try {
      await updateExpense(expense.id, { expense_tag: tag }, session.access_token)
    } catch (err) {
      console.error('Tag change failed:', err)
      // Revert on failure
      setExpense(prev => prev ? { ...prev, expense_tag: prevTag } : prev)
      setError(err instanceof Error ? err.message : 'Could not update tag')
    }
  }

  const handleSplit = async (businessPct: number, businessTag: string) => {
    if (!id) return
    await splitExpense(id, businessPct, businessTag, session.access_token)
    navigate('/dashboard')
  }

  const patch = (key: keyof Expense) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleConfirm = async () => {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      if (isEditing) {
        // Send only editable fields to avoid sending receipts/metadata
        const editable: Record<string, unknown> = {
          merchant_name: form.merchant_name,
          merchant_address: form.merchant_address,
          expense_date: form.expense_date,
          amount_total: form.amount_total,
          amount_tax: form.amount_tax,
          amount_tip: form.amount_tip,
          category: form.category,
          payment_method: form.payment_method,
          card_last_four: form.card_last_four,
          client_name: form.client_name,
          business_purpose: form.business_purpose,
          notes: form.notes,
        }
        await updateExpense(id, editable, session.access_token)
      }
      await confirmExpense(id, session.access_token)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  const handleDiscard = async () => {
    if (!id || !confirm('Discard this expense draft?')) return
    setSaving(true)
    try {
      await deleteExpense(id, session.access_token)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to discard')
      setSaving(false)
    }
  }

  const handleAcceptCalendarSuggestion = async () => {
    if (!id || !expense) return
    const patch: Record<string, unknown> = {}
    if (expense.calendar_suggested_client)
      patch.client_name = expense.calendar_suggested_client
    if (expense.calendar_suggested_purpose)
      patch.business_purpose = expense.calendar_suggested_purpose
    if (Object.keys(patch).length === 0) {
      setCalendarAction('accepted')
      return
    }
    try {
      const updated = await updateExpense(id, patch, session.access_token)
      setExpense(updated)
      setForm(updated)
      setCalendarAction('accepted')
    } catch (err) {
      // non-critical — just dismiss, but log so we can see repeated failures
      console.error('Accept calendar suggestion failed:', err)
      setCalendarAction('accepted')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">
            {error ?? 'Expense not found'}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-3 text-green-600 text-sm font-medium hover:underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  const isDraft = expense.status === 'draft'
  const receiptUrl = expense.receipts?.[0]?.image_url

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-500 hover:text-gray-700 p-1 -ml-1"
              aria-label="Back"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              Review Expense
            </h1>
          </div>
          {isDraft && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-sm text-green-600 font-medium hover:text-green-700"
            >
              {isEditing ? 'Done editing' : 'Edit'}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">
        {/* Receipt image */}
        {receiptUrl && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <img
              src={receiptUrl}
              alt={`Receipt from ${expense.merchant_name ?? 'merchant'}`}
              className="w-full max-h-64 object-contain"
            />
          </div>
        )}

        {/* OCR confidence badge + document type badge */}
        {expense.receipts?.[0]?.ocr_confidence != null && (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                expense.receipts[0].ocr_confidence >= 0.8
                  ? 'bg-green-100 text-green-700'
                  : expense.receipts[0].ocr_confidence >= 0.5
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              OCR confidence:{' '}
              {Math.round(expense.receipts[0].ocr_confidence * 100)}%
            </span>
            {expense.document_type && expense.document_type !== 'receipt' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                expense.document_type === 'invoice' ? 'bg-orange-100 text-orange-700' :
                expense.document_type === 'subscription' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {expense.document_type === 'invoice' ? 'Invoice' :
                 expense.document_type === 'subscription' ? 'Subscription' :
                 'Payment Confirmation'}
              </span>
            )}
            {expense.receipts[0].ocr_confidence < 0.5 && (
              <span className="text-xs text-gray-400">
                Low quality — please review fields carefully
              </span>
            )}
          </div>
        )}

        {/* Calendar match — auto-applied (confidence ≥ 0.75) */}
        {expense.calendar_event_id &&
          expense.calendar_match_confidence != null &&
          expense.calendar_match_confidence >= 0.75 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-sm font-medium text-green-800">
                Calendar match applied
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {expense.calendar_event_title
                  ? `"${expense.calendar_event_title}"`
                  : 'Event found'}{' '}
                — client and purpose filled from your calendar (
                {Math.round(expense.calendar_match_confidence * 100)}% match)
              </p>
            </div>
          )}

        {/* Calendar match — suggestion (0.40–0.74), not yet acted on */}
        {expense.calendar_event_id &&
          expense.calendar_match_confidence != null &&
          expense.calendar_match_confidence >= 0.40 &&
          expense.calendar_match_confidence < 0.75 &&
          calendarAction === null && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-sm font-medium text-yellow-800">
                Possible calendar match
              </p>
              <p className="text-xs text-yellow-600 mt-0.5 mb-3">
                {expense.calendar_event_title
                  ? `"${expense.calendar_event_title}"`
                  : 'Event found'}{' '}
                ({Math.round(expense.calendar_match_confidence * 100)}%
                confidence)
                {expense.calendar_suggested_client
                  ? ` — client: ${expense.calendar_suggested_client}`
                  : ''}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptCalendarSuggestion}
                  className="text-xs bg-yellow-700 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-yellow-800 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => setCalendarAction('dismissed')}
                  className="text-xs text-yellow-700 font-medium hover:text-yellow-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

        {/* Invoice due date */}
        {expense.document_type === 'invoice' && expense.due_date && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
            <span className="text-orange-700 font-medium">Due: {expense.due_date}</span>
          </div>
        )}

        {/* Expense policy alert — meals over $75 */}
        {expense.amount_total && expense.amount_total > 75 && expense.category === 'Meals & Entertainment' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300">
            Meal over $75 — some employer policies require manager approval for meals above this amount.
          </div>
        )}

        {/* Alcohol notice */}
        {expense.alcohol_total != null && expense.alcohol_total > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-sm">
            <p className="text-amber-700 dark:text-amber-300 font-medium">
              Alcohol detected: {formatCAD(expense.alcohol_total, expense.currency)}
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
              Meal expenses including alcohol are 50% deductible under CRA/IRS rules.
            </p>
          </div>
        )}

        {/* Missing amount warning */}
        {(!expense.amount_total || expense.amount_total === 0) && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300">
            Amount missing — please update the total manually.
          </div>
        )}

        {/* Extracted fields */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Extracted from receipt
            </p>
            <Row label="Merchant" copyValue={expense.merchant_name ?? undefined}>
              {isEditing ? (
                <input
                  value={form.merchant_name ?? ''}
                  onChange={patch('merchant_name')}
                  className={inputCls}
                  placeholder="Merchant name"
                />
              ) : (
                <div>
                  <span className="text-sm text-gray-900 font-medium">
                    {expense.merchant_name ?? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </span>
                  {expense.location_jurisdiction && (
                    <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200 px-1.5 py-0.5 rounded-full">
                      {expense.location_jurisdiction}
                    </span>
                  )}
                </div>
              )}
            </Row>
            <Row label="Date" copyValue={expense.expense_date ?? undefined}>
              {isEditing ? (
                <input
                  type="date"
                  value={form.expense_date ?? ''}
                  onChange={patch('expense_date')}
                  className={inputCls}
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.expense_date ?? (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </span>
              )}
            </Row>
            <Row
              label="Total"
              copyValue={
                expense.converted_amount != null
                  ? expense.converted_amount.toFixed(2)
                  : expense.amount_total != null
                    ? expense.amount_total.toFixed(2)
                    : undefined
              }
            >
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount_total ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      amount_total: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    }))
                  }
                  className={inputCls}
                  placeholder="0.00"
                />
              ) : (
                <div>
                  <span className="text-sm text-gray-900 font-semibold">
                    {expense.amount_total != null ? (
                      `$${expense.amount_total.toFixed(2)} ${expense.currency}`
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 font-normal">—</span>
                    )}
                  </span>
                  {expense.converted_amount != null && expense.converted_currency && expense.converted_currency !== expense.currency && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      ≈ ${expense.converted_amount.toFixed(2)} {expense.converted_currency}
                      {expense.conversion_rate != null && ` (rate: ${expense.conversion_rate.toFixed(6)})`}
                    </p>
                  )}
                </div>
              )}
            </Row>
            {(expense.amount_tax != null || isEditing) && (
              <Row
                label="Tax"
                copyValue={expense.amount_tax != null ? expense.amount_tax.toFixed(2) : undefined}
              >
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount_tax ?? ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        amount_tax: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    className={inputCls}
                    placeholder="0.00"
                  />
                ) : (
                  <span className="text-sm text-gray-900">
                    {expense.amount_tax != null ? (
                      `$${expense.amount_tax.toFixed(2)}`
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </span>
                )}
              </Row>
            )}
            {(expense.amount_tip != null || isEditing) && (
              <Row
                label="Tip"
                copyValue={expense.amount_tip != null ? expense.amount_tip.toFixed(2) : undefined}
              >
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount_tip ?? ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        amount_tip: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    className={inputCls}
                    placeholder="0.00"
                  />
                ) : (
                  <span className="text-sm text-gray-900">
                    {expense.amount_tip != null ? (
                      `$${expense.amount_tip.toFixed(2)}`
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </span>
                )}
              </Row>
            )}
            {expense.amount_tip != null && expense.amount_tip > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-300 mt-1 pb-2">
                Tips on business meals are {expense.expense_tag === 'personal' ? 'not deductible' : '50% deductible (CRA/IRS)'}.
              </p>
            )}
            <Row
              label="Payment"
              copyValue={
                expense.payment_method
                  ? [
                      PAYMENT_METHODS.find(m => m.value === expense.payment_method)?.label,
                      expense.card_last_four ? `····${expense.card_last_four}` : null,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : undefined
              }
            >
              {isEditing ? (
                <select
                  value={form.payment_method ?? ''}
                  onChange={patch('payment_method')}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.payment_method
                    ? (PAYMENT_METHODS.find(
                        (m) => m.value === expense.payment_method,
                      )?.label ?? <span className="text-gray-400 dark:text-gray-500">—</span>)
                    : <span className="text-gray-400 dark:text-gray-500">—</span>}
                  {expense.card_last_four && (
                    <span className="text-gray-400 ml-1">
                      ····{expense.card_last_four}
                    </span>
                  )}
                </span>
              )}
            </Row>
          </div>

          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Business context
            </p>
            <Row label="Category" copyValue={expense.category ?? undefined}>
              {isEditing ? (
                <select
                  value={form.category ?? ''}
                  onChange={patch('category')}
                  className={inputCls}
                >
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.category ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                </span>
              )}
            </Row>
            <Row label="Client" copyValue={expense.client_name ?? undefined}>
              {isEditing ? (
                <input
                  value={form.client_name ?? ''}
                  onChange={patch('client_name')}
                  className={inputCls}
                  placeholder="Client or company name"
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.client_name ?? (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </span>
              )}
            </Row>
            <Row label="Purpose" copyValue={expense.business_purpose ?? undefined}>
              {isEditing ? (
                <textarea
                  value={form.business_purpose ?? ''}
                  onChange={patch('business_purpose')}
                  className={inputCls}
                  rows={2}
                  placeholder="Business purpose"
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.business_purpose ?? (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </span>
              )}
            </Row>
            <Row label="Notes" copyValue={expense.notes ?? undefined}>
              {isEditing ? (
                <textarea
                  value={form.notes ?? ''}
                  onChange={patch('notes')}
                  className={inputCls}
                  rows={2}
                  placeholder="Optional notes"
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {expense.notes ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                </span>
              )}
            </Row>
            {expense.category && !['Meals & Entertainment', 'Travel', 'Transportation', 'Software'].includes(expense.category) && expense.expense_date && (
              <p className="text-xs text-gray-500 dark:text-gray-300 py-2">
                Check store return policy — most retailers allow 30-90 day returns.
              </p>
            )}
            {expense.attendees && expense.attendees.length > 0 && (
              <Row
                label="Attendees"
                copyValue={expense.attendees
                  .map(a => a.name || a.email || '')
                  .filter(Boolean)
                  .join(', ')}
              >
                <span className="text-sm text-gray-900">
                  {expense.attendees
                    .map(a => a.name || a.email || '')
                    .filter(Boolean)
                    .join(', ')}
                </span>
                {expense.amount_total && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Cost per person: {formatCAD(expense.amount_total / (expense.attendees.length + 1), expense.currency)}
                      <span className="ml-1">({expense.attendees.length + 1} people including you)</span>
                    </p>
                  </div>
                )}
              </Row>
            )}

            {/* Trip / Group section */}
            <div className="flex items-start gap-3 py-2">
              <span className="text-sm text-gray-400 w-24 shrink-0 pt-1">Trip</span>
              <div className="flex-1 min-w-0">
                {expense.group_id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900 font-medium">
                      {groups.find(g => g.id === expense.group_id)?.title ?? 'Loading…'}
                    </span>
                    <button
                      onClick={handleRemoveFromGroup}
                      disabled={groupSaving}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      Remove ×
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={groupDropdownRef}>
                    <button
                      onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                      className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 font-medium border border-green-200 dark:border-green-700 rounded-lg px-2 py-1 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    >
                      ＋ Add to trip
                    </button>
                    {showGroupDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-30 overflow-hidden">
                        {creatingGroup ? (
                          <div className="p-3">
                            <input
                              autoFocus
                              value={newGroupTitle}
                              onChange={e => setNewGroupTitle(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                              className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
                              placeholder="Trip name (e.g. NYC Jan 2026)"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleCreateGroup}
                                disabled={groupSaving || !newGroupTitle.trim()}
                                className="flex-1 bg-green-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                              >
                                {groupSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => setCreatingGroup(false)}
                                className="text-xs text-gray-500 px-2"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {groups.length > 0 && (
                              <ul className="max-h-40 overflow-y-auto">
                                {groups.map(g => (
                                  <li key={g.id}>
                                    <button
                                      onClick={() => handleAddToGroup(g.id)}
                                      disabled={groupSaving}
                                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between disabled:opacity-50"
                                    >
                                      <span className="font-medium text-gray-900 truncate">{g.title}</span>
                                      <span className="text-xs text-gray-400 shrink-0 ml-2">{g.expense_count} exp</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <button
                              onClick={() => setCreatingGroup(true)}
                              className="w-full text-left px-3 py-2.5 text-sm text-green-600 font-medium hover:bg-green-50 border-t border-gray-100"
                            >
                              ＋ Create new trip
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expense tag */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 font-medium uppercase tracking-wider">
            Expense Type
          </p>
          <div className="flex gap-2">
            {[
              { id: 'business', label: t('expense.business'), color: 'green' },
              { id: 'work', label: t('expense.work'), color: 'blue' },
              { id: 'personal', label: t('expense.personal'), color: 'gray' },
            ].map(tag => (
              <button
                key={tag.id}
                onClick={() => handleTagChange(tag.id)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  expense?.expense_tag === tag.id
                    ? tag.color === 'green' ? 'bg-green-600 text-white'
                      : tag.color === 'blue' ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-white'
                    : `bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600`
                }`}
              >
                {tag.label}
                {suggestedTag === tag.id && expense?.expense_tag !== tag.id && (
                  <span className="ml-1 text-xs opacity-60">suggested</span>
                )}
              </button>
            ))}
          </div>
          {tagReason && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{tagReason}</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      {/* Split expense sheet */}
      {showSplit && (
        <SplitExpense
          expense={expense}
          onSplit={handleSplit}
          onCancel={() => setShowSplit(false)}
        />
      )}

      {/* Action bar */}
      <div className="fixed bottom-16 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 z-30">
        <div className="max-w-2xl mx-auto space-y-2">
          {isDraft ? (
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl py-3.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {t('expense.discard')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-[2] bg-green-600 text-white rounded-xl py-3.5 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving
                  ? 'Saving…'
                  : isEditing
                    ? 'Save & Confirm'
                    : t('expense.confirm')}
              </button>
            </div>
          ) : (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl py-3 px-4 text-center">
              <p className="text-green-700 dark:text-green-400 font-medium text-sm">
                ✓ Expense {expense.status}
              </p>
            </div>
          )}
          {/* Split button — available for all statuses */}
          <button
            onClick={() => setShowSplit(true)}
            disabled={saving}
            className="w-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-xl py-2.5 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
          >
            {t('expense.split')}
          </button>
        </div>
      </div>
    </div>
  )
}
