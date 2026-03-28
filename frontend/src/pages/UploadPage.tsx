import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { uploadReceipt } from '../lib/api'
import CameraCapture from '../components/CameraCapture'
import ScannerMode from '../components/ScannerMode'
import { saveToQueue } from '../hooks/useOfflineQueue'
import type { GpsCoords } from '../lib/gps'

interface Props {
  session: Session
}

type FileStatus = 'pending' | 'processing' | 'done' | 'duplicate' | 'error'

interface FileItem {
  id: string
  file: File
  preview: string
  status: FileStatus
  error?: string
  expenseId?: string
}

const PROCESSING_STEPS = [
  'Uploading image...',
  'Running OCR (Google Cloud Vision)...',
  'Parsing with Claude Haiku...',
  'Saving expense...',
]

// ── Single-file view ──────────────────────────────────────────────────────────

function SingleView({
  item,
  onUpload,
  onReset,
}: {
  item: FileItem
  onUpload: () => void
  onReset: () => void
}) {
  const isProcessing = item.status === 'processing'

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <img
          src={item.preview}
          alt="Receipt preview"
          className="w-full max-h-[60vh] object-contain"
        />
      </div>

      {item.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {item.error}
        </div>
      )}

      {isProcessing ? (
        <ProcessingIndicator />
      ) : (
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Choose different
          </button>
          <button
            onClick={onUpload}
            className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Process receipt
          </button>
        </div>
      )}
    </div>
  )
}

function ProcessingIndicator({ label }: { label?: string }) {
  const [step, setStep] = useState(0)

  // Cycle through steps for visual feedback
  useEffect(() => {
    const id = setInterval(
      () => setStep(s => Math.min(s + 1, PROCESSING_STEPS.length - 1)),
      1800,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      <p className="text-gray-700 font-medium">{label ?? PROCESSING_STEPS[step]}</p>
      <p className="text-gray-400 text-sm">Takes about 5–10 seconds</p>
    </div>
  )
}

// ── Batch view ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<FileStatus, { label: string; cls: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-gray-100 text-gray-500' },
  processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-600' },
  done:       { label: 'Done',       cls: 'bg-green-100 text-green-700' },
  duplicate:  { label: 'Duplicate',  cls: 'bg-yellow-100 text-yellow-700' },
  error:      { label: 'Error',      cls: 'bg-red-100 text-red-600' },
}

function BatchView({
  items,
  onUpload,
  onReset,
  uploading,
}: {
  items: FileItem[]
  onUpload: () => void
  onReset: () => void
  uploading: boolean
}) {
  const done = items.filter(i => i.status === 'done' || i.status === 'duplicate').length
  const errors = items.filter(i => i.status === 'error').length
  const allFinished = items.every(i => i.status !== 'pending' && i.status !== 'processing')

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map(item => {
          const badge = STATUS_BADGE[item.status]
          return (
            <div
              key={item.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="relative">
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className="w-full h-28 object-cover"
                />
                {item.status === 'processing' && (
                  <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                  </div>
                )}
                {item.status === 'done' && (
                  <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="text-xs text-gray-600 truncate">{item.file.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                {item.error && (
                  <p className="text-xs text-red-500 mt-0.5 truncate" title={item.error}>
                    {item.error}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar while uploading */}
      {uploading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 font-medium">Processing receipts…</span>
            <span className="text-sm text-gray-500">{done} / {items.length}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-2 bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary when all done */}
      {allFinished && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="font-medium text-gray-900 mb-1">
            {done} receipt{done !== 1 ? 's' : ''} processed
            {errors > 0 ? `, ${errors} failed` : ''}
          </p>
          <p className="text-xs text-gray-400">
            Each expense has been created — review them on the dashboard.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          disabled={uploading}
          className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {allFinished ? 'Upload more' : 'Clear'}
        </button>
        {allFinished ? (
          <a
            href="/dashboard"
            className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors text-center"
          >
            View expenses
          </a>
        ) : (
          <button
            onClick={onUpload}
            disabled={uploading}
            className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {uploading
              ? `Processing ${done}/${items.length}…`
              : `Upload ${items.length} receipt${items.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function makeFileList(file: File): FileList {
  const dt = new DataTransfer()
  dt.items.add(file)
  return dt.files
}

export default function UploadPage({ session }: Props) {
  const [items, setItems] = useState<FileItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [cameraMode, setCameraMode] = useState(false)
  const [scannerMode, setScannerMode] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // PWA launchQueue share target
  useEffect(() => {
    if ('launchQueue' in window) {
      (window as { launchQueue?: { setConsumer: (fn: (params: { files?: FileSystemFileHandle[] }) => void) => void } }).launchQueue?.setConsumer(async (launchParams) => {
        if (launchParams.files && launchParams.files.length > 0) {
          const files = await Promise.all(launchParams.files.map((h) => h.getFile()))
          const dt = new DataTransfer()
          files.forEach(f => dt.items.add(f))
          handleFilesSelected(dt.files)
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sharedNotice = searchParams.get('shared') === '1'

  const isBatch = items.length > 1
  const isSingle = items.length === 1

  const readPreview = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleFilesSelected = async (files: FileList) => {
    const arr = Array.from(files)
    const newItems: FileItem[] = await Promise.all(
      arr.map(async (file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        preview: await readPreview(file),
        status: 'pending' as FileStatus,
      })),
    )
    setItems(newItems)
  }

  const updateItem = (id: string, patch: Partial<FileItem>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))

  // Single-file upload → navigate to expense page
  const handleSingleUpload = async () => {
    const item = items[0]
    if (!item) return
    updateItem(item.id, { status: 'processing' })
    try {
      const result = await uploadReceipt(item.file, session.access_token, gpsCoords)
      navigate(`/expenses/${result.expense_id}`)
    } catch (err: unknown) {
      if (!navigator.onLine) {
        await saveToQueue(item.file).catch(() => {})
        updateItem(item.id, {
          status: 'error',
          error: "You're offline — receipt saved. Will upload automatically when connected.",
        })
      } else {
        updateItem(item.id, {
          status: 'error',
          error: 'Upload failed — please try again. If the problem persists, contact support.',
        })
      }
    }
  }

  // Batch upload → parallel, per-item status updates
  const handleBatchUpload = async () => {
    setUploading(true)
    const pending = items.filter(i => i.status === 'pending')

    await Promise.allSettled(
      pending.map(async item => {
        updateItem(item.id, { status: 'processing' })
        try {
          const result = await uploadReceipt(item.file, session.access_token, gpsCoords)
          updateItem(item.id, {
            status: result.duplicate ? 'duplicate' : 'done',
            expenseId: result.expense_id,
          })
        } catch (err: unknown) {
          updateItem(item.id, {
            status: 'error',
            error: 'Upload failed — please try again. If the problem persists, contact support.',
          })
        }
      }),
    )

    setUploading(false)
  }

  const handleScannerComplete = async (files: File[], coords: GpsCoords | null) => {
    setScannerMode(false)
    setGpsCoords(coords)
    if (files.length === 0) return

    const newItems: FileItem[] = await Promise.all(
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        file,
        preview: await readPreview(file),
        status: 'pending' as FileStatus,
      })),
    )
    setItems(newItems)
  }

  const reset = () => {
    setItems([])
    setUploading(false)
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
          <h1 className="text-lg font-semibold text-gray-900">
            {isBatch ? `Add ${items.length} receipts` : 'Add Receipt'}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {scannerMode && (
          <ScannerMode
            onComplete={handleScannerComplete}
            onCancel={() => setScannerMode(false)}
          />
        )}

        {/* Camera capture overlay */}
        {cameraMode && (
          <CameraCapture
            onCapture={(file) => {
              setCameraMode(false)
              handleFilesSelected(makeFileList(file))
            }}
            onCancel={() => setCameraMode(false)}
          />
        )}

        {/* Select stage */}
        {items.length === 0 && !cameraMode && !scannerMode && (
          <div className="space-y-3">
            {sharedNotice && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                Processing shared receipt…
              </div>
            )}
            <button
              onClick={() => setScannerMode(true)}
              className="bg-green-600 text-white rounded-xl px-4 py-3 text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Scanner Mode
            </button>
            <button
              onClick={() => setCameraMode(true)}
              className="w-full bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-green-400 hover:bg-green-50 transition-all"
            >
              <span className="text-4xl">📷</span>
              <div className="text-center">
                <p className="font-medium text-gray-700">Take a photo</p>
                <p className="text-sm text-gray-400 mt-0.5">Use your camera to capture a receipt</p>
              </div>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-green-400 hover:bg-green-50 transition-all"
            >
              <span className="text-4xl">🖼️</span>
              <div className="text-center">
                <p className="font-medium text-gray-700">Choose from library</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  Select one or multiple receipts — photo, PDF, or screenshot
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files?.length && handleFilesSelected(e.target.files)}
            />
          </div>
        )}

        {/* Single preview / processing */}
        {isSingle && (
          <SingleView
            item={items[0]}
            onUpload={handleSingleUpload}
            onReset={reset}
          />
        )}

        {/* Batch grid */}
        {isBatch && (
          <BatchView
            items={items}
            onUpload={handleBatchUpload}
            onReset={reset}
            uploading={uploading}
          />
        )}
      </main>
    </div>
  )
}
