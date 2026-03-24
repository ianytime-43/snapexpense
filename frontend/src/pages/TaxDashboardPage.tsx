import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '../components/Skeleton'
import { getTaxSummary } from '../lib/api'

interface Props {
  session: Session
}

interface TaxSummary {
  quarter: number
  year: number
  savings: {
    itc_total: number
    deductible_total: number
    total_business_expenses: number
  }
  jurisdictions: Array<{
    name: string
    amount: number
    count: number
    itc: number
  }>
  categories: Array<{
    name: string
    amount: number
    deductible: number
    count: number
    tax_line: string
    deduction_pct: number
  }>
  completeness: {
    percentage: number
    total: number
    categorized: number
    drafts: number
  }
}

function formatCurrency(amount: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

function currentQuarterYear() {
  const now = new Date()
  return {
    quarter: Math.floor(now.getMonth() / 3) + 1,
    year: now.getFullYear(),
  }
}

export default function TaxDashboardPage({ session }: Props) {
  const navigate = useNavigate()
  const { quarter: defaultQ, year: defaultY } = currentQuarterYear()
  const [quarter, setQuarter] = useState(defaultQ)
  const [year, setYear] = useState(defaultY)
  const [summary, setSummary] = useState<TaxSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getTaxSummary(session.access_token, quarter, year)
      .then(setSummary)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session, quarter, year])

  const yearOptions = [defaultY - 1, defaultY]

  const maxCategoryAmount = summary?.categories[0]?.amount ?? 1

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg"
            aria-label="Back to dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">Tax Dashboard</h1>

          {/* Quarter selector */}
          <div className="flex items-center gap-2">
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value={1}>Q1 (Jan–Mar)</option>
              <option value={2}>Q2 (Apr–Jun)</option>
              <option value={3}>Q3 (Jul–Sep)</option>
              <option value={4}>Q4 (Oct–Dec)</option>
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Card 1 — Tax Savings Hero */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Q{quarter} {year} — Tax Savings
          </p>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : summary ? (
            <>
              {/* Hero number */}
              <div className="mb-4">
                {summary.savings.itc_total > 0 ? (
                  <>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(summary.savings.itc_total)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      in ITCs recovered this quarter
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(summary.savings.deductible_total)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      in deductions tracked this quarter
                    </p>
                  </>
                )}
              </div>

              {/* Completeness bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Receipt completeness
                  </p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {summary.completeness.percentage}%
                  </p>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      summary.completeness.percentage >= 80
                        ? 'bg-green-500'
                        : summary.completeness.percentage >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${summary.completeness.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {summary.completeness.categorized} of {summary.completeness.total} expenses categorized
                </p>
              </div>

              {/* Draft receipts link */}
              {summary.completeness.drafts > 0 && (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline"
                >
                  {summary.completeness.drafts} receipt{summary.completeness.drafts !== 1 ? 's' : ''} need review →
                </button>
              )}
            </>
          ) : null}
        </div>

        {/* Card 2 — Jurisdiction Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            By Jurisdiction
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : summary && summary.jurisdictions.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {summary.jurisdictions.map(j => (
                <div key={j.name} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{j.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {j.count} expense{j.count !== 1 ? 's' : ''}
                        {j.itc > 0 && (
                          <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                            · {formatCurrency(j.itc)} ITC
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(j.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
              No business expenses in Q{quarter} {year}.
            </p>
          ) : null}
        </div>

        {/* Card 3 — Category Spend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Category Spend
          </p>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : summary && summary.categories.length > 0 ? (
            <div className="space-y-4">
              {summary.categories.map(cat => {
                const barWidth = (cat.amount / maxCategoryAmount) * 100
                const dedPct = Math.round((cat.deduction_pct ?? 1) * 100)
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {cat.name}
                        </p>
                        {dedPct < 100 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                            {dedPct}% ded.
                          </span>
                        )}
                        {cat.tax_line && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 hidden sm:inline">
                            {cat.tax_line}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(cat.amount)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {cat.count} exp.
                        </p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 dark:bg-green-600 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
              No business expenses in Q{quarter} {year}.
            </p>
          ) : null}
        </div>

        {/* Card 4 — Deduction Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Deduction Summary
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : summary ? (
            <div className="space-y-0 divide-y divide-gray-100 dark:divide-gray-700">
              <div className="flex items-center justify-between py-3 first:pt-0">
                <p className="text-sm text-gray-600 dark:text-gray-300">Total business expenses</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(summary.savings.total_business_expenses)}
                </p>
              </div>

              {/* Show meal deduction note if meals category present */}
              {summary.categories.find(c => c.name.toLowerCase().includes('meal') || c.name.toLowerCase().includes('food')) && (() => {
                const mealCat = summary.categories.find(c => c.name.toLowerCase().includes('meal') || c.name.toLowerCase().includes('food'))!
                const reduction = mealCat.amount - mealCat.deductible
                return reduction > 0 ? (
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Meal deduction limit (50%)</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Non-deductible portion</p>
                    </div>
                    <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                      −{formatCurrency(reduction)}
                    </p>
                  </div>
                ) : null
              })()}

              <div className="flex items-center justify-between py-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Total deductible amount</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(summary.savings.deductible_total)}
                </p>
              </div>

              {summary.savings.itc_total > 0 && (
                <div className="flex items-center justify-between py-3 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Tax credits (ITC)</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Input Tax Credits — GST/HST recoverable</p>
                  </div>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.savings.itc_total)}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Card 5 — Tax-Loss Insights */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Insights
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                  Review draft expenses to maximize deductions
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Uncategorized or personal-tagged expenses are excluded from your tax calculations.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-xs text-amber-700 dark:text-amber-300 font-semibold hover:underline mt-1.5 inline-block"
                >
                  Go to dashboard →
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                  Get your quarterly tax estimate
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  Enter your annual income to see CRA instalments or IRS quarterly payments.
                </p>
                <button
                  onClick={() => navigate('/quarterly-estimate')}
                  className="text-xs text-blue-700 dark:text-blue-300 font-semibold hover:underline mt-1.5 inline-block"
                >
                  Calculate estimate →
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                  Claim home office expenses
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                  Calculate your T2200 / Form 8829 deduction for workspace-in-home costs.
                </p>
                <button
                  onClick={() => navigate('/home-office')}
                  className="text-xs text-green-700 dark:text-green-300 font-semibold hover:underline mt-1.5 inline-block"
                >
                  Open calculator →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
