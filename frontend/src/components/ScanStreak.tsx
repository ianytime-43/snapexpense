import type { Expense } from '../types'

interface Props {
  expenses: Expense[]
}

function calculateStreak(expenses: Expense[]): number {
  if (expenses.length === 0) return 0

  // Collect unique days that have at least one expense
  const days = new Set(
    expenses.map((e) => {
      const d = e.expense_date ?? e.created_at.split('T')[0]
      return d
    })
  )

  const today = new Date()
  let streak = 0

  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().split('T')[0]
    if (days.has(key)) {
      streak++
    } else {
      // Allow a gap of one day only for today (in case today hasn't been scanned yet)
      if (i === 0) continue
      break
    }
  }

  return streak
}

function countThisWeek(expenses: Expense[]): number {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)
  return expenses.filter((e) => {
    const d = new Date(e.expense_date ?? e.created_at)
    return d >= weekStart
  }).length
}

function countThisMonth(expenses: Expense[]): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return expenses.filter((e) => {
    const d = new Date(e.expense_date ?? e.created_at)
    return d >= monthStart
  }).length
}

export default function ScanStreak({ expenses }: Props) {
  if (expenses.length === 0) return null

  const streak = calculateStreak(expenses)
  const weekCount = countThisWeek(expenses)
  const monthCount = countThisMonth(expenses)

  const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '📸'
  // Progress toward a 7-day streak
  const progress = Math.min((streak / 7) * 100, 100)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">{streakEmoji}</span>
          <div>
            {streak > 0 ? (
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {streak}-day scan streak!
              </p>
            ) : (
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Start your streak today
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Keep scanning daily to build momentum
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            <span className="font-medium text-gray-700 dark:text-gray-300">{weekCount}</span> this week
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            <span className="font-medium text-gray-700 dark:text-gray-300">{monthCount}</span> this month
          </p>
        </div>
      </div>

      {/* Progress bar toward 7-day streak */}
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {streak < 7 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {7 - streak} more day{7 - streak !== 1 ? 's' : ''} to reach a 7-day streak
        </p>
      )}
      {streak >= 7 && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
          7-day streak achieved!
        </p>
      )}
    </div>
  )
}
