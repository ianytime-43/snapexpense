/**
 * IndexedDB queue for pending uploads when offline.
 * Saves files to 'snapexpense-queue' store and processes them when online.
 */
import { useCallback, useEffect } from 'react'
import { uploadReceipt } from '../lib/api'

const DB_NAME = 'snapexpense'
const STORE_NAME = 'upload-queue'
const DB_VERSION = 1

export interface QueuedFile {
  id: string
  name: string
  type: string
  data: ArrayBuffer
  addedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveToQueue(file: File): Promise<void> {
  const db = await openDb()
  const data = await file.arrayBuffer()
  const item: QueuedFile = {
    id: `${Date.now()}-${Math.random()}`,
    name: file.name,
    type: file.type,
    data,
    addedAt: Date.now(),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getQueue(): Promise<QueuedFile[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as QueuedFile[])
    req.onerror = () => reject(req.error)
  })
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function processQueue(token: string): Promise<number> {
  const items = await getQueue()
  let uploaded = 0
  for (const item of items) {
    try {
      const file = new File([item.data], item.name, { type: item.type })
      await uploadReceipt(file, token)
      await removeFromQueue(item.id)
      uploaded++
    } catch {
      // Leave in queue for next attempt
    }
  }
  return uploaded
}

export function useOfflineQueue(token: string | null) {
  const process = useCallback(() => {
    if (token) processQueue(token).catch(() => {})
  }, [token])

  useEffect(() => {
    window.addEventListener('online', process)
    return () => window.removeEventListener('online', process)
  }, [process])

  return { saveToQueue, getQueue, removeFromQueue }
}
