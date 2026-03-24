interface Props {
  selectedCount: number
  onConfirmAll: () => void
  onDeleteAll: () => void
  onCancel: () => void
  processing?: boolean
}

export default function BulkActions({ selectedCount, onConfirmAll, onDeleteAll, onCancel, processing }: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 z-40 safe-area-bottom">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <button onClick={onCancel} className="text-sm text-gray-500 dark:text-gray-400">
          Cancel
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
          {selectedCount} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onDeleteAll}
            disabled={processing}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            onClick={onConfirmAll}
            disabled={processing}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Confirm ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  )
}
