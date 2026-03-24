import { useState } from 'react'

interface Props {
  country: string  // 'CA' or 'US'
  actualMealTotal?: number  // total of actual meal receipts for comparison
}

// CRA NJC standard rates (simplified — single rate for all cities)
const CRA_RATES = { breakfast: 22.70, lunch: 22.95, dinner: 53.80, incidentals: 17.30 }
const CRA_DAILY = CRA_RATES.breakfast + CRA_RATES.lunch + CRA_RATES.dinner + CRA_RATES.incidentals

// IRS GSA standard CONUS rates
const IRS_STANDARD_MIE = 74  // standard
const IRS_HIGH_COST_MIE = 86  // high-cost areas

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

export default function PerDiemCalculator({ country, actualMealTotal }: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isHighCost, setIsHighCost] = useState(false)
  const [result, setResult] = useState<{ days: number; total: number; daily: number } | null>(null)

  const currency = country === 'CA' ? 'CAD' : 'USD'

  const calculate = () => {
    if (!startDate || !endDate) return
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (end < start) return
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    const daily = country === 'CA' ? CRA_DAILY : (isHighCost ? IRS_HIGH_COST_MIE : IRS_STANDARD_MIE)
    setResult({ days, total: days * daily, daily })
  }

  const perDiemSavings =
    result && actualMealTotal != null ? result.total - actualMealTotal : null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Per Diem Calculator
        <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
          {country === 'CA' ? 'CRA NJC rates' : 'IRS GSA rates'}
        </span>
      </h3>

      {/* Rate reference */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        {country === 'CA' ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">Breakfast</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 text-right">{formatCurrency(CRA_RATES.breakfast, 'CAD')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Lunch</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 text-right">{formatCurrency(CRA_RATES.lunch, 'CAD')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Dinner</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 text-right">{formatCurrency(CRA_RATES.dinner, 'CAD')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Incidentals</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 text-right">{formatCurrency(CRA_RATES.incidentals, 'CAD')}</p>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-1 mt-0.5">Daily total</p>
            <p className="text-xs font-semibold text-gray-800 dark:text-white border-t border-gray-200 dark:border-gray-600 pt-1 mt-0.5 text-right">{formatCurrency(CRA_DAILY, 'CAD')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">Standard M&IE</p>
              <p className="text-xs text-gray-700 dark:text-gray-300">{formatCurrency(IRS_STANDARD_MIE, 'USD')}/day</p>
            </div>
            <div className="flex justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">High-cost areas</p>
              <p className="text-xs text-gray-700 dark:text-gray-300">{formatCurrency(IRS_HIGH_COST_MIE, 'USD')}/day</p>
            </div>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              min={startDate}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {country === 'US' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isHighCost}
              onChange={e => setIsHighCost(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">High-cost area (NYC, SF, etc.)</span>
          </label>
        )}

        <button
          onClick={calculate}
          disabled={!startDate || !endDate}
          className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Calculate
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex justify-between items-baseline mb-1">
            <p className="text-xs text-green-700 dark:text-green-400 font-medium">
              {result.days} day{result.days !== 1 ? 's' : ''} × {formatCurrency(result.daily, currency)}/day
            </p>
            <p className="text-base font-bold text-green-800 dark:text-green-300">
              {formatCurrency(result.total, currency)}
            </p>
          </div>
          <p className="text-xs text-green-600 dark:text-green-500">
            {country === 'CA' ? 'CRA NJC standard rate' : isHighCost ? 'IRS high-cost area rate' : 'IRS standard rate'}
          </p>

          {/* Comparison with actual receipts */}
          {actualMealTotal != null && perDiemSavings != null && (
            <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                Your actual meal receipts: <span className="font-medium">{formatCurrency(actualMealTotal, currency)}</span>
              </p>
              {perDiemSavings > 0 ? (
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                  Per diem saves you {formatCurrency(perDiemSavings, currency)} more — use per diem
                </p>
              ) : perDiemSavings < 0 ? (
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Actual receipts save you {formatCurrency(Math.abs(perDiemSavings), currency)} more — keep receipts
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Per diem and actual receipts are equal
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
