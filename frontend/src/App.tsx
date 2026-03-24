import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import CookieConsent from './components/CookieConsent'
import { useDarkMode } from './hooks/useDarkMode'
import { ToastProvider, useOnlineToast } from './hooks/useToast'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ExpensePage from './pages/ExpensePage'
import LandingPage from './pages/LandingPage'
import OnboardingPage from './pages/OnboardingPage'
import PrivacyPage from './pages/PrivacyPage'
import HomeOfficePage from './pages/HomeOfficePage'
import InsightsPage from './pages/InsightsPage'
import SettingsPage from './pages/SettingsPage'
import SubmitSessionPage from './pages/SubmitSessionPage'
import TermsPage from './pages/TermsPage'
import QuarterlyEstimatePage from './pages/QuarterlyEstimatePage'
import UploadPage from './pages/UploadPage'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
    </div>
  )
}

// Inner component that can use hooks requiring context
function AppRoutes({ session }: { session: Session | null }) {
  useOnlineToast()
  useDarkMode()

  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      {/* Auth */}
      <Route
        path="/auth"
        element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          session ? (
            <OnboardingPage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />

      {/* Protected app routes */}
      <Route
        path="/dashboard"
        element={
          session ? (
            <DashboardPage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/upload"
        element={
          session ? (
            <UploadPage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/expenses/:id"
        element={
          session ? (
            <ExpensePage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/insights"
        element={session ? <InsightsPage session={session} /> : <Navigate to="/auth" replace />}
      />
      <Route
        path="/home-office"
        element={
          session ? (
            <HomeOfficePage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/quarterly-estimate"
        element={
          session ? (
            <QuarterlyEstimatePage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/settings"
        element={
          session ? (
            <SettingsPage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/submit-session"
        element={
          session ? (
            <SubmitSessionPage session={session} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // Redirect to onboarding on first sign-in only.
      // Guard: skip if already on onboarding or on public-only routes.
      const SKIP_ONBOARDING_REDIRECT = ['/onboarding', '/privacy', '/terms']
      if (
        event === 'SIGNED_IN' &&
        session &&
        !localStorage.getItem('onboarding_done') &&
        !SKIP_ONBOARDING_REDIRECT.some(p => window.location.pathname.startsWith(p))
      ) {
        window.location.replace('/onboarding')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <Spinner />

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes session={session} />
          <CookieConsent />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}
