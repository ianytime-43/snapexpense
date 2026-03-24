import { useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  rightLabel?: string
  leftLabel?: string
  rightColor?: string
  leftColor?: string
  disabled?: boolean
}

const SWIPE_THRESHOLD = 80

export default function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Confirm',
  leftLabel = 'Delete',
  rightColor = 'bg-green-600',
  leftColor = 'bg-red-500',
  disabled = false,
}: Props) {
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    startXRef.current = e.touches[0].clientX
    currentXRef.current = e.touches[0].clientX
    setSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping || disabled) return
    currentXRef.current = e.touches[0].clientX
    const diff = currentXRef.current - startXRef.current
    // Limit swipe distance
    const clamped = Math.max(-150, Math.min(150, diff))
    setOffset(clamped)
  }

  const handleTouchEnd = () => {
    if (!swiping || disabled) return
    setSwiping(false)

    if (offset > SWIPE_THRESHOLD && onSwipeRight) {
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30)
      onSwipeRight()
    } else if (offset < -SWIPE_THRESHOLD && onSwipeLeft) {
      if (navigator.vibrate) navigator.vibrate(30)
      onSwipeLeft()
    }

    setOffset(0)
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        <div className={`flex-1 ${rightColor} flex items-center pl-4`}>
          <span className="text-white text-sm font-medium">{rightLabel}</span>
        </div>
        <div className={`flex-1 ${leftColor} flex items-center justify-end pr-4`}>
          <span className="text-white text-sm font-medium">{leftLabel}</span>
        </div>
      </div>

      {/* Card content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : 'transform 0.3s ease-out',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  )
}
