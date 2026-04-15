import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  type SmartRule,
  type SmartRuleInput,
  applySmartRulesToExisting,
  createSmartRule,
  deleteSmartRule,
  listSmartRules,
  testSmartRule,
  updateSmartRule,
} from '../lib/api'

interface Props {
  session: Session
}

const CATEGORIES = [
  'meals',
  'travel',
  'office',
  'software',
  'subscriptions',
  'entertainment',
  'fuel',
  'vehicle',
  'utilities',
  'professional_services',
  'marketing',
  'shipping',
  'other',
]

const CATEGORY_ICON: Record<string, string> = {
  meals: '🍽️',
  travel: '✈️',
  office: '📎',
  software: '💻',
  subscriptions: '🔁',
  entertainment: '🎬',
  fuel: '⛽',
  vehicle: '🚗',
  utilities: '💡',
  professional_services: '💼',
  marketing: '📣',
  shipping: '📦',
  other: '•',
}

function emptyDraft(): SmartRuleInput {
  return {
    name: '',
    merchant_pattern: '',
    category: 'other',
    is_tax_deductible: false,
    is_active: true,
    priority: 100,
  }
}

function RuleModal({
  open,
  initial,
  onClose,
  onSaved,
  token,
}: {
  open: boolean
  initial: SmartRule | null
  onClose: () => void
  onSaved: (rule: SmartRule) => void
  token: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<SmartRuleInput>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (initial) {
      setDraft({
        name: initial.name,
        merchant_pattern: initial.merchant_pattern,
        category: initial.category ?? 'other',
        is_tax_deductible: initial.is_tax_deductible,
        is_active: initial.is_active,
        priority: initial.priority,
      })
    } else {
      setDraft(emptyDraft())
    }
    setErr(null)
  }, [initial, open])

  if (!open) return null

  async function save() {
    if (!draft.name.trim() || !draft.merchant_pattern.trim()) {
      setErr('Name and merchant pattern are required')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const result = initial
        ? await updateSmartRule(token, initial.id, draft)
        : await createSmartRule(token, draft)
      onSaved(result)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {initial ? t('rules.edit_rule') : t('rules.new_rule')}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('rules.name_label')}
            </label>
            <input
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Coffee shops"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('rules.pattern_label')}
            </label>
            <input
              value={draft.merchant_pattern}
              onChange={e => setDraft({ ...draft, merchant_pattern: e.target.value })}
              placeholder="Starbucks  (or  re:^UBER)"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-400">{t('rules.pattern_hint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('rules.category_label')}
              </label>
              <select
                value={draft.category ?? 'other'}
                onChange={e => setDraft({ ...draft, category: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {CATEGORY_ICON[c]} {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('rules.priority_label')}
              </label>
              <input
                type="number"
                value={draft.priority ?? 100}
                onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.is_tax_deductible ?? false}
              onChange={e => setDraft({ ...draft, is_tax_deductible: e.target.checked })}
              className="h-4 w-4 rounded text-green-600 focus:ring-green-600"
            />
            {t('rules.tax_deductible')}
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.is_active ?? true}
              onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
              className="h-4 w-4 rounded text-green-600 focus:ring-green-600"
            />
            {t('rules.active')}
          </label>

          {err && (
            <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400"
          >
            {saving ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function TestModal({
  open,
  onClose,
  token,
}: {
  open: boolean
  onClose: () => void
  token: string
}) {
  const { t } = useTranslation()
  const [merchant, setMerchant] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ matched: boolean; rule: SmartRule | null; checked_count: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setMerchant('')
      setResult(null)
      setErr(null)
    }
  }, [open])

  if (!open) return null

  async function run() {
    if (!merchant.trim()) return
    setLoading(true)
    setErr(null)
    try {
      const res = await testSmartRule(token, merchant)
      setResult(res)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('rules.test_title')}
          </h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <input
          value={merchant}
          onChange={e => setMerchant(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="STARBUCKS #1234 SEATTLE"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-green-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <button
          onClick={run}
          disabled={loading || !merchant.trim()}
          className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400"
        >
          {loading ? '...' : t('rules.run_test')}
        </button>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        {result && (
          <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            {result.matched && result.rule ? (
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {t('rules.match_found')}: {result.rule.name}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {CATEGORY_ICON[result.rule.category ?? 'other']} {result.rule.category ?? '—'}
                  {result.rule.is_tax_deductible && ` · ${t('rules.tax_deductible')}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('rules.no_match', { count: result.checked_count })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SmartRulesPage({ session }: Props) {
  const { t } = useTranslation()
  const token = session.access_token
  const [rules, setRules] = useState<SmartRule[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<SmartRule | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState<string | null>(null)

  useEffect(() => {
    listSmartRules(token)
      .then(d => setRules(d.rules))
      .catch(e => setErr(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [token])

  function handleSaved(rule: SmartRule) {
    setRules(prev => {
      const exists = prev.find(r => r.id === rule.id)
      if (exists) return prev.map(r => (r.id === rule.id ? rule : r))
      return [...prev, rule].sort((a, b) => a.priority - b.priority)
    })
  }

  async function toggleActive(rule: SmartRule) {
    try {
      const updated = await updateSmartRule(token, rule.id, { is_active: !rule.is_active })
      handleSaved(updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('rules.confirm_delete'))) return
    try {
      await deleteSmartRule(token, id)
      setRules(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleApplyToExisting() {
    setApplying(true)
    setApplyMsg(null)
    try {
      const res = await applySmartRulesToExisting(token)
      setApplyMsg(t('rules.applied_msg', { count: res.updated }))
    } catch (e) {
      setApplyMsg(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#faf7f2] pb-24 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="back"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('rules.title')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('rules.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            + {t('rules.new_rule')}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-6">
        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {err}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => setTestOpen(true)}
            className="text-sm font-medium text-green-700 hover:underline dark:text-green-400"
          >
            {t('rules.test_a_merchant')}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-white dark:bg-gray-800"
              />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('rules.empty')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map(rule => (
              <li
                key={rule.id}
                className={`rounded-xl border bg-white p-4 dark:bg-gray-900 ${
                  rule.is_active
                    ? 'border-gray-200 dark:border-gray-800'
                    : 'border-gray-200 opacity-60 dark:border-gray-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 dark:text-white">{rule.name}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {CATEGORY_ICON[rule.category ?? 'other']} {rule.category ?? '—'}
                      </span>
                      {rule.is_tax_deductible && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-300">
                          {t('rules.tax_deductible_badge')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">p{rule.priority}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 break-all">
                      {rule.merchant_pattern}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleActive(rule)}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        rule.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {rule.is_active ? t('rules.active') : t('rules.inactive')}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(rule)
                        setModalOpen(true)
                      }}
                      className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      aria-label="edit"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="rounded-md p-1.5 text-gray-400 hover:text-red-500"
                      aria-label="delete"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Apply to existing */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            {t('rules.apply_existing_title')}
          </p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {t('rules.apply_existing_desc')}
          </p>
          <button
            onClick={handleApplyToExisting}
            disabled={applying || rules.length === 0}
            className="rounded-lg border border-green-600 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
          >
            {applying ? '...' : t('rules.apply_existing_btn')}
          </button>
          {applyMsg && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{applyMsg}</p>
          )}
        </div>
      </div>

      <RuleModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        token={token}
      />
      <TestModal open={testOpen} onClose={() => setTestOpen(false)} token={token} />
    </div>
  )
}
