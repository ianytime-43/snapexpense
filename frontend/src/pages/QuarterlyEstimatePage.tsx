import type { Session } from '@supabase/supabase-js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuarterlyEstimate } from '../lib/api'

interface Props {
  session: Session
}

// Shape returned by CRA estimate
interface CRAEstimate {
  country: 'CA'
  annual_income: number
  annual_deductions: number
  taxable_income: number
  federal_tax: number
  provincial_tax: number
  cpp_contributions: number
  total_annual: number
  quarterly_instalment: number
  confirmed_deductions_used: number
  instalment_dates: string[]
  disclaimer: string
}

// Shape returned by IRS estimate
interface IRSEstimate {
  country: 'US'
  annual_income: number
  annual_deductions: number
  taxable_income: number
  federal_tax: number
  se_tax: number
  state_tax: number
  total_annual: number
  quarterly_payment: number
  confirmed_deductions_used: number
  payment_dates: string[]
  disclaimer: string
}

type Estimate = CRAEstimate | IRSEstimate

function fmt(amount: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

function ResultRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`flex justify-between items-center py-3 px-4 rounded-lg ${
        highlight
          ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
          : 'bg-gray-50 dark:bg-gray-700/40'
      }`}
    >
      <span className={`text-sm ${highlight ? 'font-semibold text-green-800 dark:text-green-200' : 'text-gray-600 dark:text-gray-300'}`}>
        {label}
      </span>
      <span className={`font-mono font-semibold ${highlight ? 'text-green-700 dark:text-green-300 text-lg' : 'text-gray-800 dark:text-gray-100'}`}>
        {value}
      </span>
    </div>
  )
}

function DateBadge({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
      <span className="text-blue-600 dark:text-blue-300 text-sm font-medium">{date}</span>
    </div>
  )
}

export default function QuarterlyEstimatePage({ session }: Props) {
  const token = session.access_token
  const currency = 'CAD' // will reflect from profile in a future pass

  const [income, setIncome] = useState('')
  const [whatIfSpend, setWhatIfSpend] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)

  async function handleCalculate() {
    const parsed = parseFloat(income)
    if (!income || isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid annual income greater than $0.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await getQuarterlyEstimate(token, parsed)
      setEstimate(data as Estimate)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load estimate.')
    } finally {
      setLoading(false)
    }
  }

  // What-if: recalculate quarterly amount if user adds extra deductions
  function computeWhatIf(): { newQuarterly: number; saving: number } | null {
    if (!estimate) return null
    const extra = parseFloat(whatIfSpend)
    if (!whatIfSpend || isNaN(extra) || extra <= 0) return null

    if (estimate.country === 'CA') {
      const cra = estimate as CRAEstimate
      // Simplified: assume ~26% marginal benefit on deduction (federal + provincial average)
      const marginalRate = 0.26
      const annualSaving = extra * marginalRate
      const newQuarterly = Math.max(0, cra.quarterly_instalment - annualSaving / 4)
      return { newQuarterly, saving: annualSaving / 4 }
    } else {
      const irs = estimate as IRSEstimate
      // Simplified: assume ~22% federal + state marginal
      const marginalRate = 0.22
      const annualSaving = extra * marginalRate
      const newQuarterly = Math.max(0, irs.quarterly_payment - annualSaving / 4)
      return { newQuarterly, saving: annualSaving / 4 }
    }
  }

  const whatIfResult = computeWhatIf()
  const quarterlyAmount = estimate
    ? estimate.country === 'CA'
      ? (estimate as CRAEstimate).quarterly_instalment
      : (estimate as IRSEstimate).quarterly_payment
    : 0
  const paymentDates = estimate
    ? estimate.country === 'CA'
      ? (estimate as CRAEstimate).instalment_dates
      : (estimate as IRSEstimate).payment_dates
    : []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Quarterly Tax Estimate</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Self-employed CRA instalments &amp; IRS 1040-ES payments
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Income input card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Enter Your Annual Income</h2>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-medium">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 80000"
                value={income}
                onChange={e => setIncome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCalculate()}
                className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleCalculate}
              disabled={loading}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Calculating…' : 'Calculate'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Your confirmed business expenses are automatically included as deductions.
          </p>
        </div>

        {/* Results */}
        {estimate && (
          <>
            {/* Disclaimer — always shown */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                {estimate.disclaimer}
              </p>
            </div>

            {/* Tax breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-3">
                {estimate.country === 'CA' ? 'CRA Tax Breakdown' : 'IRS Tax Breakdown'}
              </h2>

              <ResultRow
                label="Gross Annual Income"
                value={fmt(estimate.annual_income, currency)}
              />
              <ResultRow
                label="Confirmed Deductions"
                value={`− ${fmt(estimate.confirmed_deductions_used, currency)}`}
              />
              <ResultRow
                label="Taxable Income"
                value={fmt(estimate.taxable_income, currency)}
              />

              <div className="border-t border-gray-100 dark:border-gray-700 my-2" />

              <ResultRow
                label="Federal Tax"
                value={fmt(estimate.federal_tax, currency)}
              />

              {estimate.country === 'CA' ? (
                <>
                  <ResultRow
                    label="Provincial Tax"
                    value={fmt((estimate as CRAEstimate).provincial_tax, currency)}
                  />
                  <ResultRow
                    label="CPP Contributions (self-employed)"
                    value={fmt((estimate as CRAEstimate).cpp_contributions, currency)}
                  />
                </>
              ) : (
                <>
                  <ResultRow
                    label="Self-Employment Tax"
                    value={fmt((estimate as IRSEstimate).se_tax, currency)}
                  />
                  <ResultRow
                    label="State Tax"
                    value={fmt((estimate as IRSEstimate).state_tax, currency)}
                  />
                </>
              )}

              <div className="border-t border-gray-100 dark:border-gray-700 my-2" />

              <ResultRow
                label="Total Annual Tax"
                value={fmt(estimate.total_annual, currency)}
              />
              <ResultRow
                label={estimate.country === 'CA' ? 'Quarterly Instalment' : 'Quarterly Payment'}
                value={fmt(quarterlyAmount, currency)}
                highlight
              />
            </div>

            {/* Instalment dates */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-3">
                {estimate.country === 'CA' ? 'Instalment Due Dates' : 'Payment Due Dates'}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {paymentDates.map(date => (
                  <DateBadge key={date} date={date} />
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {estimate.country === 'CA'
                  ? 'Pay each instalment by the due date to avoid CRA interest charges.'
                  : 'Pay each quarter by the due date to avoid IRS underpayment penalties.'}
              </p>
            </div>

            {/* What-if simulator */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
                What-If Simulator
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                If I spend an additional amount on deductible business expenses, my quarterly estimate changes by:
              </p>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="e.g. 2000"
                    value={whatIfSpend}
                    onChange={e => setWhatIfSpend(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {whatIfResult && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
                    <span className="text-sm text-blue-800 dark:text-blue-200">
                      Quarterly saving
                    </span>
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                      − {fmt(whatIfResult.saving, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700">
                    <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                      New quarterly {estimate.country === 'CA' ? 'instalment' : 'payment'}
                    </span>
                    <span className="font-mono font-semibold text-green-700 dark:text-green-300 text-lg">
                      {fmt(whatIfResult.newQuarterly, currency)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                    Based on an approximate {estimate.country === 'CA' ? '26%' : '22%'} combined marginal rate.
                    Actual savings depend on your full tax situation.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom disclaimer */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                {estimate.disclaimer}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
