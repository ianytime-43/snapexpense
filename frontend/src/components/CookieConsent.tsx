import { useState, useEffect } from 'react'

export default function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      setShow(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 z-50 shadow-lg">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          We use essential cookies only — no tracking or advertising cookies.{' '}
          <a href="/privacy" className="text-green-600 underline">Privacy Policy</a>
        </p>
        <button
          onClick={handleAccept}
          className="shrink-0 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
