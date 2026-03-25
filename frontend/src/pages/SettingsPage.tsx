import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  deleteMyAccount,
  disconnectCalendar,
  disconnectIntegration,
  disconnectOutlook,
  downloadTaxPackage,
  exportMyData,
  getAccountantAccessList,
  getCalendarAuthUrl,
  getCalendarStatus,
  getIntegrationConnections,
  getMe,
  getOutlookAuthUrl,
  getOutlookStatus,
  inviteAccountant,
  revokeAccountant,
  scanGmail,
  scanOutlook,
  updateMe,
} from '../lib/api'
import type { AccountantAccess, IntegrationConnection } from '../lib/api'
import { useDarkMode } from '../hooks/useDarkMode'
import type { EmailScanResult, UserProfile } from '../types'

interface Props {
  session: Session
}

const SUPPORTED_VENDORS = [
  'Uber', 'Lyft', 'Airbnb', 'Booking.com', 'Expedia',
  'Amazon Business', 'Hilton', 'Marriott', 'IHG',
  'Air Canada', 'United', 'Delta', 'WestJet', 'Southwest',
  'DoorDash', 'Uber Eats', 'Skip The Dishes',
]

export default function SettingsPage({ session }: Props) {
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calConnected, setCalConnected] = useState(false)
  const [calEmail, setCalEmail] = useState<string | null>(null)
  const [calLoading, setCalLoading] = useState(true)
  const [calWorking, setCalWorking] = useState(false)
  const [outlookConnected, setOutlookConnected] = useState(false)
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null)
  const [outlookLoading, setOutlookLoading] = useState(true)
  const [outlookWorking, setOutlookWorking] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [reminderSaving, setReminderSaving] = useState(false)
  const [scanResults, setScanResults] = useState<EmailScanResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanSource, setScanSource] = useState<'gmail' | 'outlook' | null>(null)
  const [showForwarding, setShowForwarding] = useState(false)
  const [integrationConnections, setIntegrationConnections] = useState<IntegrationConnection[]>([])
  const [integrationsLoading, setIntegrationsLoading] = useState(true)
  const [integrationsWorking, setIntegrationsWorking] = useState<string | null>(null)
  const [accountantList, setAccountantList] = useState<AccountantAccess[]>([])
  const [accountantEmail, setAccountantEmail] = useState('')
  const [accountantLoading, setAccountantLoading] = useState(true)
  const [accountantWorking, setAccountantWorking] = useState(false)
  const [accountantError, setAccountantError] = useState<string | null>(null)
  const [taxPackageYear, setTaxPackageYear] = useState(new Date().getFullYear())
  const [taxPackageWorking, setTaxPackageWorking] = useState(false)
  const { theme, setTheme } = useDarkMode()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    getMe(session.access_token).then(setUserProfile).catch(() => {})
  }, [session])

  useEffect(() => {
    getIntegrationConnections(session.access_token)
      .then(setIntegrationConnections)
      .catch(() => {})
      .finally(() => setIntegrationsLoading(false))
  }, [session])

  useEffect(() => {
    getAccountantAccessList(session.access_token)
      .then(setAccountantList)
      .catch(() => {})
      .finally(() => setAccountantLoading(false))
  }, [session])

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/settings/forwarding-address`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => setAddress(data.forwarding_address))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    getCalendarStatus(session.access_token)
      .then((s) => {
        setCalConnected(s.connected)
        setCalEmail(s.email)
      })
      .catch(() => {})
      .finally(() => setCalLoading(false))
  }, [session])

  useEffect(() => {
    getOutlookStatus(session.access_token)
      .then((s) => {
        setOutlookConnected(s.connected)
        setOutlookEmail(s.email)
      })
      .catch(() => {})
      .finally(() => setOutlookLoading(false))
  }, [session])

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const calParam = searchParams.get('calendar')
    if (calParam === 'connected') {
      getCalendarStatus(session.access_token)
        .then((s) => { setCalConnected(s.connected); setCalEmail(s.email) })
        .catch(() => {})
      navigate('/settings', { replace: true })
    }
  }, [searchParams, session, navigate])

  // Handle redirect back from Microsoft OAuth
  useEffect(() => {
    const outlookParam = searchParams.get('outlook')
    if (outlookParam === 'connected') {
      getOutlookStatus(session.access_token)
        .then((s) => { setOutlookConnected(s.connected); setOutlookEmail(s.email) })
        .catch(() => {})
      navigate('/settings', { replace: true })
    }
  }, [searchParams, session, navigate])

  const handleCalendarConnect = async () => {
    setCalWorking(true)
    try {
      const { auth_url } = await getCalendarAuthUrl(session.access_token)
      window.location.href = auth_url
    } catch {
      setCalWorking(false)
    }
  }

  const handleCalendarDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar?')) return
    setCalWorking(true)
    try {
      await disconnectCalendar(session.access_token)
      setCalConnected(false)
      setCalEmail(null)
    } catch {
    } finally {
      setCalWorking(false)
    }
  }

  const handleOutlookConnect = async () => {
    setOutlookWorking(true)
    try {
      const { auth_url } = await getOutlookAuthUrl(session.access_token)
      window.location.href = auth_url
    } catch {
      setOutlookWorking(false)
    }
  }

  const handleOutlookDisconnect = async () => {
    if (!confirm('Disconnect Outlook Calendar?')) return
    setOutlookWorking(true)
    try {
      await disconnectOutlook(session.access_token)
      setOutlookConnected(false)
      setOutlookEmail(null)
    } catch {
    } finally {
      setOutlookWorking(false)
    }
  }

  const handleReminderToggle = async () => {
    if (!userProfile) return
    const newFrequency = userProfile.reminder_frequency === 'weekly' ? 'never' : 'weekly'
    setReminderSaving(true)
    try {
      const updated = await updateMe({ reminder_frequency: newFrequency }, session.access_token)
      setUserProfile(prev => prev ? { ...prev, reminder_frequency: updated.reminder_frequency } : prev)
    } catch {
      // ignore
    } finally {
      setReminderSaving(false)
    }
  }

  const handleEmailScan = async (source: 'gmail' | 'outlook', months: number) => {
    if (!confirm(
      'SnapExpense will search your inbox for:\n\n' +
      '✓ Receipts from known vendors (Uber, Lyft, airlines, hotels, etc.)\n' +
      '✓ Emails with subjects containing "invoice", "receipt", "payment confirmation", etc.\n\n' +
      'We will NOT read any other emails. Only email subject and sender are accessed.\n\n' +
      'Continue?'
    )) return

    setScanning(true)
    setScanError(null)
    setScanSource(source)
    setScanResults([])

    try {
      const results = source === 'gmail'
        ? await scanGmail(session.access_token, months)
        : await scanOutlook(session.access_token, months)
      setScanResults(results)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that block clipboard
      const el = document.createElement('textarea')
      el.value = address
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleAccountantInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountantEmail.trim()) return
    setAccountantWorking(true)
    setAccountantError(null)
    try {
      const row = await inviteAccountant(session.access_token, accountantEmail.trim())
      setAccountantList((prev) => {
        const filtered = prev.filter((a) => a.accountant_email !== row.accountant_email)
        return [row, ...filtered]
      })
      setAccountantEmail('')
    } catch (err) {
      setAccountantError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setAccountantWorking(false)
    }
  }

  const handleAccountantRevoke = async (email: string) => {
    if (!confirm(`Revoke access for ${email}?`)) return
    try {
      await revokeAccountant(session.access_token, email)
      setAccountantList((prev) => prev.filter((a) => a.accountant_email !== email))
    } catch {
      // ignore
    }
  }

  const handleTaxPackageDownload = async () => {
    setTaxPackageWorking(true)
    try {
      const blob = await downloadTaxPackage(session.access_token, taxPackageYear)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tax_package_${taxPackageYear}.zip`
      a.style.display = 'none'
      document.body.appendChild(a)
      setTimeout(() => {
        a.click()
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 1000)
      }, 100)
    } catch {
      alert('Download failed. Please try again.')
    } finally {
      setTaxPackageWorking(false)
    }
  }

  const [exportWorking, setExportWorking] = useState(false)

  const handleExportData = async () => {
    setExportWorking(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/account/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      // Mobile browsers need window.open fallback for blob downloads
      const a = document.createElement('a')
      a.href = url
      a.download = 'snapexpense_export.zip'
      a.style.display = 'none'
      document.body.appendChild(a)
      // Try click first, fall back to window.open for mobile
      setTimeout(() => {
        a.click()
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 1000)
      }, 100)
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setExportWorking(false)
    }
  }

  const handleIntegrationDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}? Your category mappings will also be removed.`)) return
    setIntegrationsWorking(platform)
    try {
      await disconnectIntegration(session.access_token, platform)
      setIntegrationConnections((prev) => prev.filter((c) => c.platform !== platform))
    } catch {
      // ignore
    } finally {
      setIntegrationsWorking(null)
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account?\n\n' +
      'This will permanently delete:\n' +
      '- All your expenses and receipts\n' +
      '- Your profile and preferences\n' +
      '- All connected accounts\n\n' +
      'This action cannot be undone.'
    )
    if (!confirmed) return

    const doubleConfirm = confirm('This is permanent. Type OK to proceed.')
    if (!doubleConfirm) return

    try {
      await deleteMyAccount(session.access_token)
      window.location.href = '/'
    } catch {
      alert('Deletion failed. Please try again or contact support.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">

        {/* Connected Accounts card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Connected Accounts
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Connect your accounting software to sync expenses automatically.
            OAuth flows will be available in an upcoming release.
          </p>

          {integrationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { id: 'quickbooks', label: 'QuickBooks Online', color: 'bg-green-600 hover:bg-green-700' },
                { id: 'xero', label: 'Xero', color: 'bg-blue-600 hover:bg-blue-700' },
                { id: 'wave', label: 'Wave', color: 'bg-indigo-600 hover:bg-indigo-700' },
              ].map(({ id, label, color }) => {
                const conn = integrationConnections.find((c) => c.platform === id)
                const isWorking = integrationsWorking === id
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {conn && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                        {conn && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {conn.company_name ? conn.company_name : 'Connected'}
                            {conn.last_synced_at
                              ? ` · Last synced ${new Date(conn.last_synced_at).toLocaleDateString()}`
                              : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {conn ? (
                      <button
                        onClick={() => handleIntegrationDisconnect(id)}
                        disabled={isWorking}
                        className="text-sm text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50"
                      >
                        {isWorking ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        disabled
                        title="OAuth coming soon"
                        className={`shrink-0 text-sm font-medium text-white px-4 py-1.5 rounded-lg opacity-50 cursor-not-allowed ${color}`}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Google Calendar card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Google Calendar
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Connect your calendar so SnapExpense can auto-fill client and
            business purpose from your meeting history.
          </p>

          {calLoading ? (
            <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ) : calConnected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Connected{calEmail ? ` as ${calEmail}` : ''}
                </span>
              </div>
              <button
                onClick={handleCalendarDisconnect}
                disabled={calWorking}
                className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleCalendarConnect}
              disabled={calWorking}
              className="bg-green-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {calWorking ? 'Connecting…' : 'Connect Google Calendar'}
            </button>
          )}
        </div>

        {/* Outlook Calendar card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Outlook Calendar
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Connect your Microsoft / Outlook calendar as an alternative to Google
            Calendar. SnapExpense will use whichever is connected to match
            expenses to meetings.
          </p>

          {outlookLoading ? (
            <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ) : outlookConnected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Connected{outlookEmail ? ` as ${outlookEmail}` : ''}
                </span>
              </div>
              <button
                onClick={handleOutlookDisconnect}
                disabled={outlookWorking}
                className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleOutlookConnect}
              disabled={outlookWorking}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {outlookWorking ? 'Connecting…' : 'Connect Outlook Calendar'}
            </button>
          )}
        </div>

        {/* Email Scanning card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Scan Email for Receipts & Invoices
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search your inbox for receipts and invoices. We only look at email subjects
            and senders — we never read your personal emails.
          </p>

          <div className="flex gap-2 mb-4">
            <div className="flex-1 space-y-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Gmail</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEmailScan('gmail', 3)}
                  disabled={scanning}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  Last 3 months
                </button>
                <button
                  onClick={() => handleEmailScan('gmail', 6)}
                  disabled={scanning}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  Last 6 months
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Outlook</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEmailScan('outlook', 3)}
                  disabled={scanning}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Last 3 months
                </button>
                <button
                  onClick={() => handleEmailScan('outlook', 6)}
                  disabled={scanning}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Last 6 months
                </button>
              </div>
            </div>
          </div>

          {scanning && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600" />
              Scanning {scanSource === 'gmail' ? 'Gmail' : 'Outlook'}...
            </div>
          )}

          {scanError && (
            <p className="text-sm text-red-600">{scanError}</p>
          )}

          {scanResults.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Found {scanResults.length} receipt/invoice emails
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {scanResults.map((r) => (
                  <div key={r.email_id} className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{r.subject}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.sender}</p>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {r.date ? new Date(r.date).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Forward these emails to your SnapExpense address below to import them.
              </p>
            </div>
          )}
        </div>

        {/* Collapsible forwarding fallback */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={() => setShowForwarding(!showForwarding)}
            className="flex items-center justify-between w-full"
          >
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Alternative: Email Forwarding
            </h2>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${showForwarding ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showForwarding && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Forward receipts from Uber, hotels, airlines, and more to this
                address. SnapExpense will automatically parse and save them.
              </p>
              {loading ? (
                <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 font-mono text-sm text-gray-800 dark:text-gray-200 select-all overflow-x-auto">
                    {address}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gmail setup instructions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Set up auto-forwarding in Gmail
          </h2>
          <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              Open Gmail → Settings (gear icon) → <strong>See all settings</strong>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              Go to <strong>Filters and Blocked Addresses</strong> → <strong>Create a new filter</strong>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              In the <strong>From</strong> field, enter the senders you want to forward
              (e.g. <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">receipts@uber.com</code>)
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              Click <strong>Create filter</strong>, then check <strong>Forward it to</strong> and
              paste your SnapExpense address above
            </li>
          </ol>
        </div>

        {/* Outlook setup instructions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Set up auto-forwarding in Outlook
          </h2>
          <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              Open Outlook → Settings → <strong>View all Outlook settings</strong>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              Go to <strong>Mail → Rules</strong> → <strong>Add new rule</strong>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              Set condition: <strong>From</strong> → enter vendor email addresses
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              Set action: <strong>Forward to</strong> → paste your SnapExpense address
            </li>
          </ol>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Note: Some corporate Outlook accounts block external forwarding rules.
            If so, forward individual receipts manually to the address above.
          </p>
        </div>

        {/* Supported vendors */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Supported vendors
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            These senders are automatically recognised. All other senders go
            through a generic parser.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_VENDORS.map((v) => (
              <span
                key={v}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full"
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Reminders card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Reminders
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Get a weekly email when you have unconfirmed expense drafts waiting for review.
          </p>
          {userProfile ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Weekly expense reminders</span>
              <button
                onClick={handleReminderToggle}
                disabled={reminderSaving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  userProfile.reminder_frequency === 'weekly' ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
                aria-label="Toggle weekly reminders"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    userProfile.reminder_frequency === 'weekly' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          )}
        </div>

        {/* Theme card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Appearance
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Choose your preferred theme
          </p>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  theme === t
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
              </button>
            ))}
          </div>
        </div>

        {/* Share with Accountant card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Share with Accountant
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Invite your accountant by email. They get a read-only link to all your business expenses, receipts, and tax data — no account needed.
          </p>

          <form onSubmit={handleAccountantInvite} className="flex gap-2 mb-4">
            <input
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="accountant@example.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={accountantWorking || !accountantEmail.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {accountantWorking ? 'Inviting…' : 'Invite'}
            </button>
          </form>

          {accountantError && (
            <p className="text-sm text-red-600 mb-3">{accountantError}</p>
          )}

          {accountantLoading ? (
            <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ) : accountantList.length > 0 ? (
            <div className="space-y-2">
              {accountantList.map((a) => (
                <div key={a.accountant_email} className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.accountant_email}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Granted {new Date(a.granted_at).toLocaleDateString()}
                      {a.last_accessed_at ? ` · Last viewed ${new Date(a.last_accessed_at).toLocaleDateString()}` : ' · Not yet viewed'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAccountantRevoke(a.accountant_email)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">No accountants have access yet.</p>
          )}
        </div>

        {/* Annual Tax Package card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Annual Tax Package
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Download a ZIP with all your business expenses and a tax summary grouped by T2125 / Schedule C line — ready to hand to your accountant.
          </p>
          <div className="flex gap-2">
            <select
              value={taxPackageYear}
              onChange={(e) => setTaxPackageYear(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={handleTaxPackageDownload}
              disabled={taxPackageWorking}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {taxPackageWorking ? 'Generating…' : `Download ${taxPackageYear} Tax Package`}
            </button>
          </div>
        </div>

        {/* Your Data card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Your Data
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Download or delete all your data. We respect your privacy rights under PIPEDA and CCPA.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleExportData}
              disabled={exportWorking}
              className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              {exportWorking ? 'Generating export…' : 'Download all my data (ZIP)'}
            </button>
            <button
              onClick={handleDeleteAccount}
              className="w-full text-left px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Delete my account permanently
            </button>
          </div>
        </div>

        {/* Sign out */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Account</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Signed in as <span className="font-medium text-gray-700 dark:text-gray-300">{session.user.email}</span>
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Footer links */}
        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
            <Link to="/privacy" className="hover:text-gray-600 hover:underline">Privacy Policy</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-gray-600 hover:underline">Terms of Service</Link>
          </div>
        </div>

      </main>
    </div>
  )
}
