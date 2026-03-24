import type { Session } from '@supabase/supabase-js'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  session: Session
}

type Country = 'CA' | 'US'

interface CAResult {
  businessUsePct: number
  totalExpenses: number
  deduction: number
  breakdown: {
    rent: number
    utilities: number
    insurance: number
    maintenance: number
    propertyTax: number
  }
}

interface USResult {
  businessUsePct: number
  simplified: { sqftUsed: number; deduction: number }
  actual: { totalExpenses: number; deduction: number; breakdown: Record<string, number> }
  recommended: 'simplified' | 'actual'
  savingsVsOther: number
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      {hint && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{hint}</p>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-400 dark:text-gray-500 text-sm select-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-12' : 'pr-3'}`}
          placeholder="0"
        />
        {suffix && (
          <span className="absolute right-3 text-gray-400 dark:text-gray-500 text-sm select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function HomeOfficePage({ session: _session }: Props) {
  const navigate = useNavigate()

  // Country
  const [country, setCountry] = useState<Country>('CA')

  // Setup
  const [totalSqft, setTotalSqft] = useState('')
  const [officeSqft, setOfficeSqft] = useState('')

  // Shared expenses (annual)
  const [rent, setRent] = useState('')
  const [utilities, setUtilities] = useState('')
  const [insurance, setInsurance] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const [propertyTax, setPropertyTax] = useState('')

  // US-only
  const [mortgageInterest, setMortgageInterest] = useState('')

  // Added state
  const [added, setAdded] = useState(false)

  const n = (v: string) => parseFloat(v) || 0

  const totalSqftNum = n(totalSqft)
  const officeSqftNum = n(officeSqft)
  const businessUsePct =
    totalSqftNum > 0 && officeSqftNum > 0
      ? Math.min((officeSqftNum / totalSqftNum) * 100, 100)
      : 0

  const caResult = useMemo<CAResult | null>(() => {
    if (totalSqftNum <= 0 || officeSqftNum <= 0) return null
    const pct = Math.min(officeSqftNum / totalSqftNum, 1.0)
    const totalExpenses = n(rent) + n(utilities) + n(insurance) + n(maintenance) + n(propertyTax)
    return {
      businessUsePct: Math.round(pct * 1000) / 10,
      totalExpenses,
      deduction: totalExpenses * pct,
      breakdown: {
        rent: n(rent) * pct,
        utilities: n(utilities) * pct,
        insurance: n(insurance) * pct,
        maintenance: n(maintenance) * pct,
        propertyTax: n(propertyTax) * pct,
      },
    }
  }, [totalSqftNum, officeSqftNum, rent, utilities, insurance, maintenance, propertyTax])

  const usResult = useMemo<USResult | null>(() => {
    if (totalSqftNum <= 0 || officeSqftNum <= 0) return null
    const pct = Math.min(officeSqftNum / totalSqftNum, 1.0)
    const simplifiedSqft = Math.min(officeSqftNum, 300)
    const simplifiedDeduction = simplifiedSqft * 5
    const totalExpenses =
      n(rent) + n(utilities) + n(insurance) + n(maintenance) + n(mortgageInterest) + n(propertyTax)
    const actualDeduction = totalExpenses * pct
    const recommended = simplifiedDeduction >= actualDeduction ? 'simplified' : 'actual'
    return {
      businessUsePct: Math.round(pct * 1000) / 10,
      simplified: { sqftUsed: simplifiedSqft, deduction: simplifiedDeduction },
      actual: {
        totalExpenses,
        deduction: actualDeduction,
        breakdown: {
          rent: n(rent) * pct,
          utilities: n(utilities) * pct,
          insurance: n(insurance) * pct,
          maintenance: n(maintenance) * pct,
          'mortgage interest': n(mortgageInterest) * pct,
          'property tax': n(propertyTax) * pct,
        },
      },
      recommended,
      savingsVsOther: Math.abs(actualDeduction - simplifiedDeduction),
    }
  }, [totalSqftNum, officeSqftNum, rent, utilities, insurance, maintenance, mortgageInterest, propertyTax])

  const hasSetup = totalSqftNum > 0 && officeSqftNum > 0

  const handleAddToDeductions = () => {
    // Client-side only — no API round-trip needed for the calculator
    setAdded(true)
    setTimeout(() => setAdded(false), 2500)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 -ml-1"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Home Office Deduction
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Country selector */}
        <SectionCard title="Your Country">
          <div className="flex gap-2">
            {(['CA', 'US'] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  country === c
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {c === 'CA' ? 'Canada' : 'United States'}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Your Setup */}
        <SectionCard title="Your Setup">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Total home size"
                value={totalSqft}
                onChange={setTotalSqft}
                suffix="sq ft"
              />
              <NumberInput
                label="Office size"
                value={officeSqft}
                onChange={setOfficeSqft}
                suffix="sq ft"
              />
            </div>

            {hasSetup && (
              <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
                <span className="text-sm text-green-800 dark:text-green-300 font-medium">
                  Business-use percentage
                </span>
                <span className="text-lg font-bold text-green-700 dark:text-green-400">
                  {businessUsePct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Annual Expenses */}
        <SectionCard title="Annual Home Expenses">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 -mt-1">
            Enter your total annual amounts — we'll calculate the deductible portion automatically.
          </p>
          <div className="space-y-4">
            <NumberInput
              label={country === 'US' ? 'Rent (if renting)' : 'Rent'}
              value={rent}
              onChange={setRent}
              prefix="$"
              hint={country === 'US' ? 'Leave blank if you own your home' : undefined}
            />
            <NumberInput
              label="Utilities"
              value={utilities}
              onChange={setUtilities}
              prefix="$"
              hint="Electricity, heat, water, internet"
            />
            <NumberInput
              label="Home insurance"
              value={insurance}
              onChange={setInsurance}
              prefix="$"
            />
            <NumberInput
              label="Maintenance & repairs"
              value={maintenance}
              onChange={setMaintenance}
              prefix="$"
            />
            <NumberInput
              label="Property tax"
              value={propertyTax}
              onChange={setPropertyTax}
              prefix="$"
              hint={country === 'CA' ? 'Leave blank if renting' : undefined}
            />
            {country === 'US' && (
              <NumberInput
                label="Mortgage interest"
                value={mortgageInterest}
                onChange={setMortgageInterest}
                prefix="$"
                hint="From your Form 1098. Leave blank if renting."
              />
            )}
          </div>
        </SectionCard>

        {/* Canada result */}
        {country === 'CA' && caResult && (
          <SectionCard title="Your Deduction">
            {/* T2200 warning */}
            <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-4">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">T2200 required</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Your employer must sign Form T2200 to certify you were required to work from home. The flat-rate ($2/day) method was discontinued after 2022.
                </p>
              </div>
            </div>

            {/* Main deduction */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4 mb-4 text-center">
              <p className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">
                Estimated annual deduction
              </p>
              <p className="text-4xl font-bold text-green-700 dark:text-green-400">
                ${fmt(caResult.deduction)}
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                {caResult.businessUsePct}% of ${fmt(caResult.totalExpenses)} in home expenses
              </p>
            </div>

            {/* Breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Breakdown</p>
              {(
                [
                  ['Rent', caResult.breakdown.rent],
                  ['Utilities', caResult.breakdown.utilities],
                  ['Insurance', caResult.breakdown.insurance],
                  ['Maintenance', caResult.breakdown.maintenance],
                  ['Property tax', caResult.breakdown.propertyTax],
                ] as [string, number][]
              )
                .filter(([, v]) => v > 0)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{label}</span>
                    <span className="text-gray-900 dark:text-white font-medium">${fmt(value)}</span>
                  </div>
                ))}
            </div>
          </SectionCard>
        )}

        {/* US result */}
        {country === 'US' && usResult && (
          <SectionCard title="Method Comparison">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 -mt-1">
              You can choose either method each tax year. We recommend the one that saves you more.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Simplified */}
              <div
                className={`rounded-xl border-2 p-4 ${
                  usResult.recommended === 'simplified'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Simplified</p>
                  {usResult.recommended === 'simplified' && (
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  ${fmt(usResult.simplified.deduction)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {usResult.simplified.sqftUsed} sq ft × $5/sq ft
                  {usResult.simplified.sqftUsed === 300 && (
                    <span className="block text-amber-600 dark:text-amber-400 mt-0.5">
                      Capped at 300 sq ft ($1,500 max)
                    </span>
                  )}
                </p>
                {usResult.recommended === 'simplified' && usResult.savingsVsOther > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-2">
                    Saves you ${fmt(usResult.savingsVsOther)} more
                  </p>
                )}
              </div>

              {/* Actual */}
              <div
                className={`rounded-xl border-2 p-4 ${
                  usResult.recommended === 'actual'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Actual</p>
                  {usResult.recommended === 'actual' && (
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  ${fmt(usResult.actual.deduction)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {usResult.businessUsePct}% of ${fmt(usResult.actual.totalExpenses)} in expenses
                </p>
                {usResult.recommended === 'actual' && usResult.savingsVsOther > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-2">
                    Saves you ${fmt(usResult.savingsVsOther)} more
                  </p>
                )}
              </div>
            </div>

            {/* Actual method breakdown */}
            {Object.entries(usResult.actual.breakdown).some(([, v]) => v > 0) && (
              <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Actual method breakdown
                </p>
                {Object.entries(usResult.actual.breakdown)
                  .filter(([, v]) => v > 0)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{label}</span>
                      <span className="text-gray-900 dark:text-white font-medium">${fmt(value)}</span>
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Add to deductions button */}
        {((country === 'CA' && caResult && caResult.deduction > 0) ||
          (country === 'US' && usResult && (usResult.simplified.deduction > 0 || usResult.actual.deduction > 0))) && (
          <button
            onClick={handleAddToDeductions}
            className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
              added
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
            }`}
          >
            {added ? 'Added to your deductions!' : 'Add to my deductions'}
          </button>
        )}

        {/* Tax disclaimer */}
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            <strong className="text-gray-600 dark:text-gray-300">Tax disclaimer:</strong>{' '}
            These calculations are estimates based on publicly available tax rules and are provided for informational purposes only. They do not constitute tax advice. Tax rules change frequently — consult a qualified tax professional before filing.
            {country === 'CA' && ' CRA rules apply. Eligibility depends on your employment contract and T2200 certification.'}
            {country === 'US' && ' IRS rules apply. The home office deduction is generally only available to self-employed individuals; employees cannot claim it under current law (post-TCJA 2018).'}
          </p>
        </div>

      </main>
    </div>
  )
}
