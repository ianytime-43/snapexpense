import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  type AccountantShare,
  type CreateShareInput,
  type CreateShareResponse,
  createAccountantShare,
  listAccountantShares,
  revokeAccountantShare,
} from '../lib/api'

interface Props {
  session: Session
}

function todayIso(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function isExpired(share: AccountantShare): boolean {
  if (share.revoked_at) return true
  if (!share.expires_at) return false
  return new Date(share.expires_at).getTime() <= Date.now()
}

export default function AccountantSharesPage({ session }: Props) {
  const { t } = useTranslation()
  const [shares, setShares] = useState<AccountantShare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<CreateShareInput>({
    label: '',
    date_from: todayIso(-90),
    date_to: todayIso(),
    expires_in_days: 30,
    include_receipts: true,
    include_invoices: true,
    include_mileage: false,
    accountant_email: '',
  })
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<CreateShareResponse | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const shareUrl = useMemo(() => {
    if (!justCreated) return ''
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/accountant-view?token=${encodeURIComponent(justCreated.access_token)}`
  }, [justCreated])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const rows = await listAccountantShares(session.access_token)
        if (!cancelled) setShares(rows)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session.access_token])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.date_from || !form.date_to) {
      setError(t('accountant.err_range_required', 'Select a date range'))
      return
    }
    if (new Date(form.date_from) > new Date(form.date_to)) {
      setError(t('accountant.err_range_order', 'Start date must be before end date'))
      return
    }
    const anyContent = form.include_receipts || form.include_invoices || form.include_mileage
    if (!anyContent) {
      setError(t('accountant.err_content_required', 'Select at least one content type'))
      return
    }
    try {
      setCreating(true)
      const payload: CreateShareInput = {
        label: form.label?.trim() || undefined,
        date_from: form.date_from,
        date_to: form.date_to,
        expires_in_days: form.expires_in_days ?? 30,
        include_receipts: !!form.include_receipts,
        include_invoices: !!form.include_invoices,
        include_mileage: !!form.include_mileage,
        accountant_email: form.accountant_email?.trim() || undefined,
      }
      const created = await createAccountantShare(session.access_token, payload)
      setJustCreated(created)
      // Refresh list.
      const rows = await listAccountantShares(session.access_token)
      setShares(rows)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(shareId: string) {
    if (!confirm(t('accountant.confirm_revoke', 'Revoke this share? The link will stop working immediately.'))) return
    try {
      await revokeAccountantShare(session.access_token, shareId)
      setShares(prev => prev.map(s => (s.id === shareId ? { ...s, revoked_at: new Date().toISOString() } : s)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function copyShareUrl() {
    if (!shareUrl) return
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              ← {t('common.back', 'Back')}
            </Link>
            <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
              {t('accountant.shares_title', 'Accountant shares')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t(
                'accountant.shares_subtitle',
                'Create a read-only link that lets your accountant view a scoped slice of your expenses.',
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200 p-3 text-sm">
            {error}
          </div>
        )}

        {/* Create new share */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
            {t('accountant.create_new', 'Create a new share')}
          </h2>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('accountant.label', 'Label')}
              </label>
              <input
                type="text"
                value={form.label ?? ''}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder={t('accountant.label_placeholder', 'Q1 2026, Annual audit, etc.')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('accountant.date_from', 'Start date')}
                </label>
                <input
                  type="date"
                  value={form.date_from}
                  onChange={e => setForm({ ...form, date_from: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('accountant.date_to', 'End date')}
                </label>
                <input
                  type="date"
                  value={form.date_to}
                  onChange={e => setForm({ ...form, date_to: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('accountant.expires_in', 'Expires in (days)')}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.expires_in_days ?? 30}
                onChange={e => setForm({ ...form, expires_in_days: Number(e.target.value) || 30 })}
                className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('accountant.include', 'Include')}
              </legend>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!form.include_receipts}
                  onChange={e => setForm({ ...form, include_receipts: e.target.checked })}
                />
                {t('accountant.include_receipts', 'Receipts')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!form.include_invoices}
                  onChange={e => setForm({ ...form, include_invoices: e.target.checked })}
                />
                {t('accountant.include_invoices', 'Invoices')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!form.include_mileage}
                  onChange={e => setForm({ ...form, include_mileage: e.target.checked })}
                />
                {t('accountant.include_mileage', 'Mileage')}
              </label>
            </fieldset>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('accountant.email_optional', 'Accountant email (optional)')}
              </label>
              <input
                type="email"
                value={form.accountant_email ?? ''}
                onChange={e => setForm({ ...form, accountant_email: e.target.value })}
                placeholder="cpa@firm.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-green-600 text-white font-medium text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {creating
                ? t('accountant.creating', 'Creating…')
                : t('accountant.create_share', 'Create share')}
            </button>
          </form>
        </section>

        {/* Existing shares */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
            {t('accountant.existing_shares', 'Existing shares')}
          </h2>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Loading...')}</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('accountant.no_shares', 'No shares yet. Create one above.')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {shares.map(share => {
                const expired = isExpired(share)
                return (
                  <li key={share.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                        {share.label || share.accountant_email || t('accountant.unlabeled', 'Untitled share')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(share.date_from)} → {formatDate(share.date_to)} ·{' '}
                        {t('accountant.expires', 'expires')} {formatDate(share.expires_at)}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {t('accountant.views', 'Views')}: {share.view_count ?? 0} ·{' '}
                        {t('accountant.last_used', 'last used')} {formatDate(share.last_used_at)}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {expired ? (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                          {share.revoked_at
                            ? t('accountant.revoked', 'Revoked')
                            : t('accountant.expired', 'Expired')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRevoke(share.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          {t('accountant.revoke', 'Revoke')}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {/* One-time token modal */}
      {justCreated && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50">
              {t('accountant.share_ready', 'Share link ready')}
            </h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {t(
                'accountant.token_once_warning',
                'This is the only time this link will be visible. Copy it now — if lost, you must revoke and create a new share.',
              )}
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {t('accountant.share_url', 'Shareable URL')}
              </label>
              <textarea
                readOnly
                value={shareUrl}
                rows={3}
                onFocus={e => e.currentTarget.select()}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-xs font-mono"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={copyShareUrl}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
              >
                {copyState === 'copied'
                  ? t('accountant.copied', 'Copied!')
                  : t('accountant.copy_link', 'Copy link')}
              </button>
              <button
                onClick={() => setJustCreated(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('accountant.done', 'Done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
