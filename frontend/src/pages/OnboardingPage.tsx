import type { Session } from '@supabase/supabase-js'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCalendarAuthUrl,
  getOutlookAuthUrl,
  updateMe,
} from '../lib/api'

interface Props {
  session: Session
}

type WorkflowOption = 'corporate_system' | 'hr_managed' | 'document' | 'self_employed'

const WORKFLOW_OPTIONS: { value: WorkflowOption; emoji: string; title: string; desc: string }[] = [
  {
    value: 'corporate_system',
    emoji: '🏢',
    title: 'Corporate system',
    desc: 'ChromeRiver, Concur, Coupa, or similar',
  },
  {
    value: 'hr_managed',
    emoji: '📋',
    title: 'Submit reports to HR / manager',
    desc: 'Fill out a form or send an email',
  },
  {
    value: 'document',
    emoji: '📄',
    title: 'Spreadsheet or Word doc',
    desc: 'Track it yourself in a document',
  },
  {
    value: 'self_employed',
    emoji: '🧮',
    title: 'Track for my own taxes',
    desc: 'Self-employed or business owner',
  },
]

export default function OnboardingPage({ session }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [calWorking, setCalWorking] = useState(false)
  const [outlookWorking, setOutlookWorking] = useState(false)

  // New step state
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['business', 'personal'])
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('17:00')
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [country, setCountry] = useState('CA')

  // Whether work hours step is shown (only if business or work selected)
  const showWorkHours = selectedCategories.includes('business') || selectedCategories.includes('work')

  // Step labels: 1=workflow, 2=calendar, 3=try, 4=categories, 5=workHours(conditional), 6=country
  // We hide step 5 (work hours) from the progress bar count when not applicable
  const totalSteps = showWorkHours ? 6 : 5

  // Map visible step number to progress dot index (1-based)
  // Steps 1-4 are fixed; step 5 is work hours (only when shown); last step is country
  const progressDot = step <= 4 ? step : showWorkHours ? step : step - 1

  const handleWorkflowSelect = async (workflow: WorkflowOption) => {
    setSelectedWorkflow(workflow)
    setSaving(true)
    localStorage.setItem('onboarding_done', '1')
    try {
      await updateMe(
        { expense_workflow: workflow, onboarding_complete: true },
        session.access_token,
      )
    } catch {
      // non-fatal
    } finally {
      setSaving(false)
      setStep(2)
    }
  }

  const handleConnectGoogle = async () => {
    setCalWorking(true)
    try {
      const { auth_url } = await getCalendarAuthUrl(session.access_token)
      window.location.href = auth_url
    } catch {
      setCalWorking(false)
    }
  }

  const handleConnectOutlook = async () => {
    setOutlookWorking(true)
    try {
      const { auth_url } = await getOutlookAuthUrl(session.access_token)
      window.location.href = auth_url
    } catch {
      setOutlookWorking(false)
    }
  }

  const handleComplete = () => {
    localStorage.setItem('onboarding_done', '1')
    navigate('/dashboard')
  }

  // Save new prefs and navigate to dashboard
  const handleSavePrefsAndComplete = async () => {
    setSaving(true)
    const defaultCurrency = country === 'CA' ? 'CAD' : country === 'US' ? 'USD' : null
    try {
      await updateMe(
        {
          expense_categories: selectedCategories,
          work_hours_start: workStart,
          work_hours_end: workEnd,
          work_days: workDays,
          country,
          ...(defaultCurrency ? { default_currency: defaultCurrency } : {}),
        },
        session.access_token,
      )
    } catch {
      // non-fatal
    } finally {
      setSaving(false)
      handleComplete()
    }
  }

  // Next step after categories: skip work hours if not applicable
  const afterCategories = () => {
    if (showWorkHours) {
      setStep(5)
    } else {
      setStep(6)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full flex-1 max-w-[60px] transition-colors ${s <= progressDot ? 'bg-green-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* Step 1: Workflow */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              How does your company handle expenses?
            </h1>
            <p className="text-gray-500 text-center mb-8 text-sm">
              This helps us tailor how we format your data for export.
            </p>
            <div className="space-y-3">
              {WORKFLOW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleWorkflowSelect(opt.value)}
                  disabled={saving}
                  className={`w-full bg-white border-2 rounded-2xl p-5 text-left flex items-center gap-4 transition-all hover:border-green-400 hover:shadow-sm disabled:opacity-50 ${
                    selectedWorkflow === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <span className="text-3xl shrink-0">{opt.emoji}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{opt.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Calendar */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              Connect your calendar
            </h1>
            <p className="text-gray-500 text-center mb-8 text-sm">
              SnapExpense uses your calendar to auto-fill client names and business purpose.
              This saves you the most time.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleConnectGoogle}
                disabled={calWorking}
                className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-center gap-4 hover:border-green-400 transition-all disabled:opacity-50"
              >
                <span className="text-3xl">📅</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900">Connect Google Calendar</p>
                  <p className="text-sm text-gray-500 mt-0.5">Gmail / Google Workspace</p>
                </div>
                {calWorking && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600" />}
              </button>
              <button
                onClick={handleConnectOutlook}
                disabled={outlookWorking}
                className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-center gap-4 hover:border-blue-400 transition-all disabled:opacity-50"
              >
                <span className="text-3xl">📧</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900">Connect Outlook Calendar</p>
                  <p className="text-sm text-gray-500 mt-0.5">Microsoft 365 / Outlook.com</p>
                </div>
                {outlookWorking && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />}
              </button>
            </div>
            <button
              onClick={() => setStep(3)}
              className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 py-3"
            >
              Skip for now →
            </button>
          </div>
        )}

        {/* Step 3: Try it now */}
        {step === 3 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Try it now
            </h1>
            <p className="text-gray-500 mb-8 text-sm">
              Upload your first receipt and see how SnapExpense works.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  localStorage.setItem('onboarding_done', '1')
                  navigate('/upload')
                }}
                className="block w-full bg-green-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-green-700 transition-colors"
              >
                📸 Upload your first receipt
              </button>
              <button
                onClick={() => setStep(4)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-3"
              >
                Continue setup →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Expense categories */}
        {step === 4 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              How do you use SnapExpense?
            </h1>
            <p className="text-gray-500 text-center mb-6 text-sm">
              This personalises your experience.
            </p>
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">Select all that apply</p>
              {[
                { id: 'business', label: 'Business expenses', desc: 'Self-employed / business owner' },
                { id: 'work', label: 'Work expenses', desc: 'Employee reimbursements' },
                { id: 'personal', label: 'Personal tracking', desc: 'Track personal spending' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    const cats = selectedCategories.includes(opt.id)
                      ? selectedCategories.filter(c => c !== opt.id)
                      : [...selectedCategories, opt.id]
                    setSelectedCategories(cats)
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selectedCategories.includes(opt.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="font-medium text-gray-900 text-sm">{opt.label}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            <button
              onClick={afterCategories}
              className="w-full mt-6 bg-green-600 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              Continue
            </button>
            <button
              onClick={() => setStep(showWorkHours ? 5 : 6)}
              className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-3"
            >
              Skip →
            </button>
          </div>
        )}

        {/* Step 5: Work hours (only if business or work selected) */}
        {step === 5 && showWorkHours && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              What are your typical work hours?
            </h1>
            <p className="text-gray-500 text-center mb-8 text-sm">
              We use this to suggest expense tags automatically.
            </p>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">Start</label>
                  <input
                    type="time"
                    value={workStart}
                    onChange={e => setWorkStart(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">End</label>
                  <input
                    type="time"
                    value={workEnd}
                    onChange={e => setWorkEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-2">Work days</label>
                <div className="flex gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                    <button
                      key={day}
                      onClick={() => {
                        const dayNum = i + 1
                        setWorkDays(prev =>
                          prev.includes(dayNum) ? prev.filter(d => d !== dayNum) : [...prev, dayNum],
                        )
                      }}
                      className={`w-10 h-10 rounded-full text-xs font-medium ${
                        workDays.includes(i + 1) ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep(6)}
              className="w-full mt-6 bg-green-600 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              Continue
            </button>
            <button
              onClick={() => setStep(6)}
              className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-3"
            >
              Skip →
            </button>
          </div>
        )}

        {/* Step 6: Country */}
        {step === 6 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              Which country?
            </h1>
            <p className="text-gray-500 text-center mb-8 text-sm">
              Sets your default currency and tax rules.
            </p>
            <div className="space-y-3">
              {[
                { id: 'CA', flag: '🇨🇦', label: 'Canada' },
                { id: 'US', flag: '🇺🇸', label: 'United States' },
                { id: 'other', flag: '🌍', label: 'Other (basic mode)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setCountry(opt.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    country === opt.id ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-2xl mr-3">{opt.flag}</span>
                  <span className="font-medium text-gray-900">{opt.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleSavePrefsAndComplete}
              disabled={saving}
              className="w-full mt-6 bg-green-600 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Finish setup'}
            </button>
            <button
              onClick={handleComplete}
              className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-3"
            >
              Skip →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
