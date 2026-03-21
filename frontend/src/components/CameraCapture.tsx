import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (file: File) => void
  onCancel: () => void
}

export default function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let localStream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        localStream = s
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
      })
      .catch(() =>
        setError('Camera access denied. Please allow camera access or use file upload.'),
      )

    return () => {
      localStream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' })
        stream?.getTracks().forEach((t) => t.stop())
        setCaptured(canvas.toDataURL('image/jpeg'))
        onCapture(file)
      },
      'image/jpeg',
      0.92,
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-800 mb-4">{error}</p>
          <button
            onClick={onCancel}
            className="bg-green-600 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-green-700"
          >
            Use file upload instead
          </button>
        </div>
      </div>
    )
  }

  if (captured) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="flex-1 w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="bg-black/60 p-6 flex items-center justify-center gap-8">
        <button
          onClick={onCancel}
          className="text-white/70 hover:text-white text-sm font-medium px-4 py-2"
        >
          Cancel
        </button>
        <button
          onClick={capture}
          className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="Take photo"
        >
          <span className="w-12 h-12 rounded-full bg-white block" />
        </button>
        <div className="w-20" />
      </div>
    </div>
  )
}
