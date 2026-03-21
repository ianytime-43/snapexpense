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

  const handleWorkflowSelect = async (workflow: WorkflowOption) => {
    setSelectedWorkflow(workflow)
    setSaving(true)
    // Set flag now so any navigation from steps 2–3 won't trigger the onboarding redirect
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full flex-1 max-w-[60px] transition-colors ${s <= step ? 'bg-green-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

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
                onClick={handleComplete}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-3"
              >
                Go to dashboard →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
