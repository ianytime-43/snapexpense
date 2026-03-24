import { useState } from 'react'
import type { Expense } from '../types'

interface SplitExpenseProps {
  expense: Expense
  onSplit: (businessPct: number, businessTag: string) => Promise<void>
  onCancel: () => void
}

function formatAmt(amount: number | null, currency = 'CAD') {
  if (amount == null) return '$0.00'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

const SHORTCUTS = [
  { label: '50/50', biz: 50 },
  { label: '75/25', biz: 75 },
  { label: '80/20', biz: 80 },
]

export default function SplitExpense({ expense, onSplit, onCancel }: SplitExpenseProps) {
  const [pct, setPct] = useState(70)
  const [businessTag, setBusinessTag] = useState<'business' | 'work'>('business')
  const [remember, setRemember] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const total = expense.amount_total ?? 0
  const tax = expense.amount_tax ?? 0
  const currency = expense.currency ?? 'CAD'

  const bizAmt = total * (pct / 100)
  const personalAmt = total * ((100 - pct) / 100)
  const bizTax = tax * (pct / 100)

  // Rough deduction estimate: meals are 50% deductible, everything else 100%
  const isMeals = expense.category?.toLowerCase().includes('meal') || expense.category?.toLowerCase().includes('entertainment')
  const deductibleRate = isMeals ? 0.5 : 1
  const deductibleAmt = bizAmt * deductibleRate

  const handleApply = async () => {
    setSplitting(true)
    setErr(null)
    try {
      await onSplit(pct, businessTag)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Split failed')
      setSplitting(false)
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-5" />

        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Split this expense
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {expense.merchant_name ?? 'Expense'} — total{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {formatAmt(total, currency)}
          </span>
        </p>

        {/* Shortcut buttons */}
        <div className="flex gap-2 mb-4">
          {SHORTCUTS.map(s => (
            <button
              key={s.label}
              onClick={() => setPct(s.biz)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                pct === s.biz
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
            <span>Business</span>
            <span>Personal</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={e => setPct(Number(e.target.value))}
            className="w-full accent-green-600 h-2 cursor-pointer"
          />
          <div className="flex justify-between text-sm font-semibold mt-1 text-gray-900 dark:text-white">
            <span>{pct}%</span>
            <span>{100 - pct}%</span>
          </div>
        </div>

        {/* Live amount preview */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1 uppercase tracking-wide">
              Business
            </p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">
              {formatAmt(bizAmt, currency)}
            </p>
            {tax > 0 && (
              <p className="text-xs text-green-500 dark:text-green-500 mt-0.5">
                Tax: {formatAmt(bizTax, currency)}
              </p>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 uppercase tracking-wide">
              Personal
            </p>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-200">
              {formatAmt(personalAmt, currency)}
            </p>
          </div>
        </div>

        {/* Tax deduction preview */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800 mb-4 text-sm">
          <p className="text-blue-700 dark:text-blue-300">
            Business portion:{' '}
            <span className="font-semibold">{formatAmt(bizAmt, currency)}</span>
            {' '}→ deductible:{' '}
            <span className="font-semibold">{formatAmt(deductibleAmt, currency)}</span>
            {isMeals && (
              <span className="text-xs text-blue-500 dark:text-blue-400 ml-1">(50% meals rule)</span>
            )}
          </p>
        </div>

        {/* Business tag selector */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">Tag as:</span>
          <div className="flex gap-2">
            {(['business', 'work'] as const).map(tag => (
              <button
                key={tag}
                onClick={() => setBusinessTag(tag)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  businessTag === tag
                    ? tag === 'business'
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Remember checkbox */}
        {expense.merchant_name && (
          <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="w-4 h-4 accent-green-600 rounded"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Remember this split for{' '}
              <span className="font-medium text-gray-900 dark:text-white">{expense.merchant_name}</span>
            </span>
          </label>
        )}

        {err && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{err}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={splitting || pct === 0 || pct === 100}
            className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {splitting ? 'Splitting…' : 'Apply Split'}
          </button>
        </div>

        {(pct === 0 || pct === 100) && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
            Move the slider to create a split between business and personal
          </p>
        )}
      </div>
    </div>
  )
}
