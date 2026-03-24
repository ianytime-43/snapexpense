import { useEffect, useState } from 'react'

interface Props {
  message: string
  onUndo: () => void
  onExpire: () => void
  duration?: number
}

export default function UndoToast({ message, onUndo, onExpire, duration = 10000 }: Props) {
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 100) {
          clearInterval(interval)
          onExpire()
          return 0
        }
        return prev - 100
      })
    }, 100)

    return () => clearInterval(interval)
  }, [duration, onExpire])

  const progress = remaining / duration

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex justify-center">
      <div className="bg-gray-900 dark:bg-gray-700 text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-sm w-full">
        <p className="text-sm flex-1">{message}</p>
        <button
          onClick={onUndo}
          className="text-green-400 font-semibold text-sm shrink-0 hover:text-green-300"
        >
          Undo
        </button>
        <div className="w-8 h-8 relative shrink-0">
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600" />
            <circle
              cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2"
              className="text-green-400"
              strokeDasharray={`${progress * 88} 88`}
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
