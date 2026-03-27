import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import {
  getExpenses,
  getEnterpriseProfile,
  updateEnterpriseProfile,
  validateEnterpriseExpenses,
  formatEnterpriseExpenses,
} from '../lib/api'
import type { Expense } from '../types'
import type { EnterpriseProfile, ComplianceCheck } from '../lib/api'

interface Props {
  session: Session
}

const PLATFORMS = [
  { value: 'concur', label: 'SAP Concur' },
  { value: 'chromeriver', label: 'ChromeRiver' },
  { value: 'workday', label: 'Workday' },
  { value: 'other', label: 'Other / Generic' },
]

const FIELD_LABELS: Record<string, string> = {
  employee_id: 'Employee ID',
  cost_center: 'Cost Center',
  default_gl_code: 'Default GL Code',
}

function CheckIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function EnterpriseSubmitPage({ session }: Props) {
  const token = session.access_token

  const [profile, setProfile] = useState<EnterpriseProfile>({
    employee_id: null,
    cost_center: null,
    default_gl_code: null,
    manager_email: null,
    enterprise_platform: null,
  })
  const [profileDraft, setProfileDraft] = useState<EnterpriseProfile>(profile)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [platform, setPlatform] = useState('concur')

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [compliance, setCompliance] = useState<ComplianceCheck | null>(null)
  const [validating, setValidating] = useState(false)

  const [formatted, setFormatted] = useState<unknown[] | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)

  useEffect(() => {
    getEnterpriseProfile(token)
      .then(p => {
        setProfile(p)
        setProfileDraft(p)
        if (p.enterprise_platform) setPlatform(p.enterprise_platform)
      })
      .catch(() => {})

    setExpensesLoading(true)
    getExpenses(token)
      .then((data: Expense[]) => {
        setExpenses(data.filter((e: Expense) => e.status === 'confirmed'))
      })
      .catch(() => {})
      .finally(() => setExpensesLoading(false))
  }, [token])

  async function handleSaveProfile() {
    setProfileSaving(true)
    setProfileError(null)
    try {
      const updated = await updateEnterpriseProfile(
        { ...profileDraft, enterprise_platform: platform },
        token,
      )
      setProfile(updated)
      setProfileDraft(updated)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (e: unknown) {
      setProfileError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setProfileSaving(false)
    }
  }

  function toggleExpense(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setCompliance(null)
    setFormatted(null)
  }

  function toggleAll() {
    if (selectedIds.size === expenses.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(expenses.map(e => e.id)))
    }
    setCompliance(null)
    setFormatted(null)
  }

  async function handleValidate() {
    if (selectedIds.size === 0) return
    setValidating(true)
    setCompliance(null)
    try {
      const result = await validateEnterpriseExpenses([...selectedIds], token)
      setCompliance(result)
    } catch (e: unknown) {
      setFormatError(e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  async function handleFormat() {
    if (selectedIds.size === 0) return
    setFormatting(true)
    setFormatError(null)
    setFormatted(null)
    try {
      const result = await formatEnterpriseExpenses([...selectedIds], platform, token)
      setFormatted(result.formatted_expenses)
    } catch (e: unknown) {
      setFormatError(e instanceof Error ? e.message : 'Formatting failed')
    } finally {
      setFormatting(false)
    }
  }

  const confirmedCount = expenses.length
  const allSelected = selectedIds.size === confirmedCount && confirmedCount > 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Enterprise Submit</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Format and prepare expenses for your corporate expense platform.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Enterprise Profile Setup */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Enterprise Profile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                { key: 'employee_id' as const, label: 'Employee ID', placeholder: 'e.g. EMP-00123' },
                { key: 'cost_center' as const, label: 'Cost Center', placeholder: 'e.g. CC-4210' },
                { key: 'default_gl_code' as const, label: 'Default GL Code', placeholder: 'e.g. 6200-EXP' },
                { key: 'manager_email' as const, label: 'Manager Email', placeholder: 'manager@company.com' },
              ]
            ).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {label}
                </label>
                <input
                  type={key === 'manager_email' ? 'email' : 'text'}
                  value={profileDraft[key] ?? ''}
                  onChange={e =>
                    setProfileDraft(prev => ({ ...prev, [key]: e.target.value || null }))
                  }
                  placeholder={placeholder}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            ))}
          </div>

          {profileError && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{profileError}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
            {profileSaved && (
              <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
            )}
          </div>
        </section>

        {/* Platform Selector */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Target Platform
          </h2>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p.value}
                onClick={() => {
                  setPlatform(p.value)
                  setCompliance(null)
                  setFormatted(null)
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  platform === p.value
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-green-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Expense List */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Confirmed Expenses
              {confirmedCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({confirmedCount} available)
                </span>
              )}
            </h2>
            {confirmedCount > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs text-green-600 dark:text-green-400 hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {expensesLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
          ) : confirmedCount === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No confirmed expenses found. Confirm some expenses first.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {expenses.map(expense => {
                const checked = selectedIds.has(expense.id)
                return (
                  <li
                    key={expense.id}
                    className={`flex items-center gap-3 py-3 cursor-pointer transition-colors rounded ${
                      checked ? 'bg-green-50 dark:bg-green-950/30 -mx-5 px-5' : ''
                    }`}
                    onClick={() => toggleExpense(expense.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExpense(expense.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {expense.merchant_name ?? 'Unknown merchant'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {expense.expense_date ?? 'No date'} &middot; {expense.category ?? 'Uncategorised'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                      {expense.currency}{' '}
                      {expense.amount_total != null ? expense.amount_total.toFixed(2) : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {selectedIds.size > 0 && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {selectedIds.size} expense{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </section>

        {/* Compliance Check */}
        {selectedIds.size > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Pre-Submit Compliance
              </h2>
              <button
                onClick={handleValidate}
                disabled={validating}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
              >
                {validating ? 'Checking...' : 'Run Check'}
              </button>
            </div>

            {compliance && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Profile Fields
                  </p>
                  <ul className="space-y-1">
                    {Object.entries(compliance.profile_checks).map(([field, ok]) => (
                      <li key={field} className="flex items-center gap-2">
                        <CheckIcon ok={ok} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {FIELD_LABELS[field] ?? field}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Expenses
                  </p>
                  <ul className="space-y-2">
                    {compliance.expense_checks.map(ec => (
                      <li key={ec.id} className="flex items-start gap-2">
                        <CheckIcon ok={ec.ready} />
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {ec.merchant_name ?? ec.id}
                            {ec.amount_total != null ? ` — $${ec.amount_total.toFixed(2)}` : ''}
                          </p>
                          {ec.issues.map(issue => (
                            <p key={issue} className="text-xs text-red-500 dark:text-red-400">
                              {issue}
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className={`rounded-lg px-4 py-3 text-sm font-medium ${
                    compliance.ready_to_submit
                      ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                  }`}
                >
                  {compliance.ready_to_submit
                    ? 'All checks passed — ready to format and submit.'
                    : 'Fix the issues above before submitting.'}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Format & Submit */}
        {selectedIds.size > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Format for {PLATFORMS.find(p => p.value === platform)?.label ?? platform}
            </h2>

            <button
              onClick={handleFormat}
              disabled={formatting}
              className="w-full py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {formatting
                ? 'Formatting...'
                : `Format ${selectedIds.size} expense${selectedIds.size !== 1 ? 's' : ''}`}
            </button>

            {formatError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formatError}</p>
            )}

            {formatted && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Formatted Output ({formatted.length} record{formatted.length !== 1 ? 's' : ''})
                </p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                  {JSON.stringify(formatted, null, 2)}
                </pre>
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 italic">
                  Actual submission to{' '}
                  {PLATFORMS.find(p => p.value === platform)?.label ?? platform} will be
                  enabled in a future release.
                </p>
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  )
}
