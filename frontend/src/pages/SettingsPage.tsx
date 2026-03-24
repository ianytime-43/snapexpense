import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  disconnectCalendar,
  disconnectOutlook,
  getCalendarAuthUrl,
  getCalendarStatus,
  getMe,
  getOutlookAuthUrl,
  getOutlookStatus,
  updateMe,
} from '../lib/api'
import type { UserProfile } from '../types'

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    getMe(session.access_token).then(setUserProfile).catch(() => {})
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700 p-1 -ml-1"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Google Calendar card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Google Calendar
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect your calendar so SnapExpense can auto-fill client and
            business purpose from your meeting history.
          </p>

          {calLoading ? (
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          ) : calConnected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm text-gray-700">
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
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Outlook Calendar
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect your Microsoft / Outlook calendar as an alternative to Google
            Calendar. SnapExpense will use whichever is connected to match
            expenses to meetings.
          </p>

          {outlookLoading ? (
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          ) : outlookConnected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm text-gray-700">
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

        {/* Forwarding address card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Email Forwarding
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Forward receipts from Uber, hotels, airlines, and more to this
            address. SnapExpense will automatically parse and save them.
          </p>

          {loading ? (
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-800 select-all overflow-x-auto">
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

        {/* Gmail setup instructions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Set up auto-forwarding in Gmail
          </h2>
          <ol className="space-y-2 text-sm text-gray-600">
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
              (e.g. <code className="bg-gray-100 px-1 rounded">receipts@uber.com</code>)
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              Click <strong>Create filter</strong>, then check <strong>Forward it to</strong> and
              paste your SnapExpense address above
            </li>
          </ol>
        </div>

        {/* Outlook setup instructions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Set up auto-forwarding in Outlook
          </h2>
          <ol className="space-y-2 text-sm text-gray-600">
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
          <p className="text-xs text-gray-400 mt-3">
            Note: Some corporate Outlook accounts block external forwarding rules.
            If so, forward individual receipts manually to the address above.
          </p>
        </div>

        {/* Supported vendors */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Supported vendors
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            These senders are automatically recognised. All other senders go
            through a generic parser.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_VENDORS.map((v) => (
              <span
                key={v}
                className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Reminders card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Reminders
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Get a weekly email when you have unconfirmed expense drafts waiting for review.
          </p>
          {userProfile ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Weekly expense reminders</span>
              <button
                onClick={handleReminderToggle}
                disabled={reminderSaving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  userProfile.reminder_frequency === 'weekly' ? 'bg-green-600' : 'bg-gray-200'
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
            <div className="h-8 bg-gray-100 rounded-xl animate-pulse" />
          )}
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
