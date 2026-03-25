import { useRef, useState, useEffect, useCallback } from 'react'
import { calculateBlurScore } from '../lib/blurDetector'
import { enhanceCanvasToFile } from '../lib/imageEnhance'
import { getCurrentPosition, type GpsCoords } from '../lib/gps'

type ScanState = 'searching' | 'detected' | 'verifying' | 'captured'

interface CapturedReceipt {
  file: File
  thumbnailUrl: string
}

interface Props {
  onComplete: (files: File[], coords: GpsCoords | null) => void
  onCancel: () => void
}

// Downscale factor for blur analysis canvas (avoids expensive full-res Laplacian)
const ANALYSIS_WIDTH = 480
const ANALYSIS_HEIGHT = 270
const STABLE_FRAMES_REQUIRED = 30  // ~1 second at 30fps — prevents rapid-fire

export default function ScannerMode({ onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const stableFrameCount = useRef(0)
  const isCapturingRef = useRef(false)

  const [scanState, setScanState] = useState<ScanState>('searching')
  const [blurScore, setBlurScore] = useState(0)
  const [receipts, setReceipts] = useState<CapturedReceipt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null)

  // ── GPS capture (silent, non-blocking) ────────────────────────────────────

  useEffect(() => {
    getCurrentPosition().then(setGpsCoords)
  }, [])

  // ── Camera setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        if (!cancelled) {
          setError('Camera access denied. Please allow camera permission and try again.')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ── Analysis loop ─────────────────────────────────────────────────────────

  const scheduleAnalysis = useCallback(() => {
    animFrameRef.current = requestAnimationFrame(analyseFrame)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const analyseFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = analysisCanvasRef.current
    if (!video || !canvas || isCapturingRef.current) return

    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      scheduleAnalysis()
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
    const imageData = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
    const score = calculateBlurScore(imageData)

    setBlurScore(score)

    const sharp = score >= 0.55

    if (sharp) {
      stableFrameCount.current += 1

      if (stableFrameCount.current >= STABLE_FRAMES_REQUIRED) {
        // Transition through verifying → trigger capture
        setScanState('verifying')
        triggerCapture()
        return
      } else if (stableFrameCount.current > 5) {
        setScanState('verifying')
      } else {
        setScanState('detected')
      }
    } else {
      stableFrameCount.current = 0
      setScanState('searching')
    }

    scheduleAnalysis()
  }, [scheduleAnalysis]) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerCapture = useCallback(async () => {
    if (isCapturingRef.current) return
    isCapturingRef.current = true

    const video = videoRef.current
    const captureCanvas = captureCanvasRef.current
    if (!video || !captureCanvas) {
      isCapturingRef.current = false
      return
    }

    // Draw full-resolution frame to capture canvas
    captureCanvas.width = video.videoWidth || 1920
    captureCanvas.height = video.videoHeight || 1080
    const ctx = captureCanvas.getContext('2d')
    if (!ctx) {
      isCapturingRef.current = false
      return
    }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)

    // Build thumbnail before enhancement mutates the canvas
    const thumbnailUrl = captureCanvas.toDataURL('image/jpeg', 0.5)

    try {
      const index = Date.now()
      const file = await enhanceCanvasToFile(captureCanvas, `receipt-${index}.jpg`)

      setScanState('captured')
      setReceipts((prev) => [...prev, { file, thumbnailUrl }])

      // Haptic feedback
      if ('vibrate' in navigator) navigator.vibrate(50)

      // Resume scanning after brief pause
      stableFrameCount.current = 0
      setTimeout(() => {
        isCapturingRef.current = false
        setScanState('searching')
        scheduleAnalysis()
      }, 2000)  // 2 second cooldown before scanning for next receipt
    } catch {
      isCapturingRef.current = false
      scheduleAnalysis()
    }
  }, [scheduleAnalysis])

  // Start the analysis loop once video is playing
  const handleVideoPlay = useCallback(() => {
    if (animFrameRef.current === null) {
      scheduleAnalysis()
    }
  }, [scheduleAnalysis])

  // ── Manual capture ────────────────────────────────────────────────────────

  const handleManualCapture = useCallback(() => {
    if (isCapturingRef.current) return
    // Cancel current animation frame so triggerCapture won't race
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    triggerCapture()
  }, [triggerCapture])

  // ── Remove last receipt ───────────────────────────────────────────────────

  const handleRemoveLast = useCallback(() => {
    setReceipts((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      URL.revokeObjectURL(last.thumbnailUrl) // clean up if object URL (noop on data URL)
      return prev.slice(0, -1)
    })
  }, [])

  // ── Done / Cancel ─────────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (receipts.length === 0) {
      onCancel()
    } else {
      onComplete(receipts.map((r) => r.file), gpsCoords)
    }
  }, [receipts, gpsCoords, onComplete, onCancel])

  // ── Guide box border color ─────────────────────────────────────────────────

  const guideBorderColor = (() => {
    switch (scanState) {
      case 'searching':
        return 'border-white/40'
      case 'detected':
        return 'border-green-400'
      case 'verifying':
        return 'border-yellow-400'
      case 'captured':
        return 'border-green-500'
    }
  })()

  const statusText = (() => {
    switch (scanState) {
      case 'searching':
        return 'Point at receipt'
      case 'detected':
        return 'Hold steady…'
      case 'verifying':
        return 'Capturing…'
      case 'captured':
        return 'Captured!'
    }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <svg className="w-16 h-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-white text-lg font-medium">Camera Unavailable</p>
        <p className="text-white/60 text-sm">{error}</p>
        <button
          onClick={onCancel}
          className="mt-4 px-6 py-2 rounded-full bg-white/20 text-white text-sm font-medium active:bg-white/30"
        >
          Go Back
        </button>
      </div>
    )
  }

  const blurBarWidth = `${Math.round(blurScore * 100)}%`

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* Hidden canvases for analysis and capture */}
      <canvas
        ref={analysisCanvasRef}
        width={ANALYSIS_WIDTH}
        height={ANALYSIS_HEIGHT}
        className="hidden"
      />
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Live video viewfinder */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPlay={handleVideoPlay}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dark overlay with guide box cut-out using ring */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Top overlay */}
        <div className="absolute inset-x-0 top-0 h-[8%] bg-black/50" />
        {/* Bottom overlay */}
        <div className="absolute inset-x-0 bottom-0 h-[15%] bg-black/50" />
        {/* Left overlay */}
        <div className="absolute left-0 top-[8%] bottom-[15%] w-[5%] bg-black/50" />
        {/* Right overlay */}
        <div className="absolute right-0 top-[8%] bottom-[15%] w-[5%] bg-black/50" />

        {/* Guide box border — tall rectangle for receipts */}
        <div
          className={`absolute border-2 rounded-lg transition-colors duration-200 ${guideBorderColor}`}
          style={{
            left: '5%',
            right: '5%',
            top: '8%',
            bottom: '15%',
          }}
        />

        {/* Corner accents */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
          const isTop = corner.startsWith('t')
          const isLeft = corner.endsWith('l')
          return (
            <div
              key={corner}
              className={`absolute w-8 h-8 border-white/80 ${isTop ? 'border-t-2 top-[8%]' : 'border-b-2 bottom-[15%]'} ${isLeft ? 'border-l-2 left-[5%]' : 'border-r-2 right-[5%]'}`}
              style={{
                borderTopLeftRadius: corner === 'tl' ? '6px' : 0,
                borderTopRightRadius: corner === 'tr' ? '6px' : 0,
                borderBottomLeftRadius: corner === 'bl' ? '6px' : 0,
                borderBottomRightRadius: corner === 'br' ? '6px' : 0,
              }}
            />
          )
        })}
      </div>

      {/* Status text — top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-safe-top py-3 bg-gradient-to-b from-black/60 to-transparent">
        {/* Done / Cancel button */}
        <button
          onClick={handleDone}
          className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur text-white text-sm font-medium active:bg-white/30"
        >
          {receipts.length > 0 ? `Done (${receipts.length})` : 'Cancel'}
        </button>

        {/* Status label */}
        <span className="text-white text-sm font-medium drop-shadow">
          {statusText}
        </span>

        {/* Spacer to balance flex */}
        <div className="w-20" />
      </div>

      {/* Bottom bar: blur indicator + thumbnails + shutter */}
      <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-safe-bottom bg-gradient-to-t from-black/80 to-transparent px-4 pt-6">
        {/* Blur indicator bar */}
        <div className="w-full max-w-xs mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/50 text-xs">Blur</span>
            <span className="text-white/50 text-xs">{Math.round(blurScore * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-100 ${blurScore >= 0.35 ? 'bg-green-400' : 'bg-white/60'}`}
              style={{ width: blurBarWidth }}
            />
          </div>
        </div>

        {/* Thumbnail strip + shutter row */}
        <div className="w-full flex items-center justify-between mb-4 gap-4">
          {/* Thumbnail strip (left side) */}
          <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {receipts.length === 0 ? (
              <span className="text-white/30 text-xs">No receipts yet</span>
            ) : (
              receipts.map((r, i) => {
                const isLast = i === receipts.length - 1
                return (
                  <div key={r.thumbnailUrl} className="relative flex-shrink-0">
                    <img
                      src={r.thumbnailUrl}
                      alt={`Receipt ${i + 1}`}
                      className="w-12 h-16 object-cover rounded border border-white/30"
                    />
                    {isLast && (
                      <button
                        onClick={handleRemoveLast}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 border border-white/40 flex items-center justify-center active:bg-black"
                        aria-label="Remove last"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Manual shutter button */}
          <button
            onClick={handleManualCapture}
            className="flex-shrink-0 w-16 h-16 rounded-full bg-white border-4 border-white/60 active:scale-95 transition-transform shadow-lg"
            aria-label="Capture receipt"
          />
        </div>
      </div>
    </div>
  )
}
