import type { EmailScanResult, ExpenseGroup, UserProfile } from '../types'

// In dev, VITE_API_URL is unset and Vite proxies /api → localhost:8000.
// In production, set VITE_API_URL=https://your-app.railway.app
const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function uploadReceipt(
  file: File,
  token: string,
  coords?: { lat: number; lng: number } | null,
): Promise<{ expense_id: string; duplicate: boolean }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('source', 'upload')
  if (coords) {
    formData.append('latitude', coords.lat.toString())
    formData.append('longitude', coords.lng.toString())
  }

  const response = await fetch(`${API_BASE}/receipts/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function getExpenses(token: string) {
  return apiFetch('/expenses', token)
}

export async function getExpense(id: string, token: string) {
  return apiFetch(`/expenses/${id}`, token)
}

export async function updateExpense(
  id: string,
  data: Record<string, unknown>,
  token: string,
) {
  return apiFetch(`/expenses/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function splitExpense(
  id: string,
  businessPercentage: number,
  businessTag: string,
  token: string,
) {
  return apiFetch(`/expenses/${id}/split`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_percentage: businessPercentage, business_tag: businessTag }),
  })
}

export async function confirmExpense(id: string, token: string) {
  return updateExpense(id, { status: 'confirmed' }, token)
}

export async function deleteExpense(id: string, token: string) {
  return apiFetch(`/expenses/${id}`, token, { method: 'DELETE' })
}

export async function getCalendarStatus(
  token: string,
): Promise<{ connected: boolean; email: string | null }> {
  return apiFetch('/calendar/status', token)
}

export async function getCalendarAuthUrl(
  token: string,
): Promise<{ auth_url: string }> {
  return apiFetch('/calendar/connect', token)
}

export async function disconnectCalendar(token: string): Promise<void> {
  return apiFetch('/calendar/disconnect', token, { method: 'DELETE' })
}

export async function getOutlookStatus(
  token: string,
): Promise<{ connected: boolean; email: string | null }> {
  return apiFetch('/outlook/status', token)
}

export async function getOutlookAuthUrl(
  token: string,
): Promise<{ auth_url: string }> {
  return apiFetch('/outlook/connect', token)
}

export async function disconnectOutlook(token: string): Promise<void> {
  return apiFetch('/outlook/disconnect', token, { method: 'DELETE' })
}

// ── Groups ──────────────────────────────────────────────────────────────────

export async function getGroups(token: string): Promise<ExpenseGroup[]> {
  return apiFetch('/groups', token)
}

export async function getGroup(id: string, token: string): Promise<ExpenseGroup> {
  return apiFetch(`/groups/${id}`, token)
}

export async function createGroup(
  data: { title: string; trip_date_start?: string; trip_date_end?: string },
  token: string,
): Promise<ExpenseGroup> {
  return apiFetch('/groups', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateGroup(
  id: string,
  data: Record<string, unknown>,
  token: string,
): Promise<ExpenseGroup> {
  return apiFetch(`/groups/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteGroup(id: string, token: string): Promise<void> {
  return apiFetch(`/groups/${id}`, token, { method: 'DELETE' })
}

export async function addExpensesToGroup(
  groupId: string,
  expenseIds: string[],
  token: string,
): Promise<void> {
  return apiFetch(`/groups/${groupId}/expenses`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_ids: expenseIds }),
  })
}

export async function removeExpenseFromGroup(
  groupId: string,
  expenseId: string,
  token: string,
): Promise<void> {
  return apiFetch(`/groups/${groupId}/expenses/${expenseId}`, token, { method: 'DELETE' })
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function getMe(token: string): Promise<UserProfile> {
  return apiFetch('/users/me', token)
}

export async function updateMe(data: Record<string, unknown>, token: string): Promise<UserProfile> {
  return apiFetch('/users/me', token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function scanGmail(token: string, months: number): Promise<EmailScanResult[]> {
  const res = await fetch(`${API_BASE}/gmail/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ months }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Scan failed' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.results
}

// ── Account ──────────────────────────────────────────────────────────────────

export async function exportMyData(token: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/account/export`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

export async function deleteMyAccount(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/account/delete`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Insights ─────────────────────────────────────────────────────────────────

export async function getSpendingTrends(token: string, months = 6) {
  const res = await fetch(`${API_BASE}/insights/trends?months=${months}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getTopVendors(token: string, months = 3) {
  const res = await fetch(`${API_BASE}/insights/top-vendors?months=${months}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getAnomalies(token: string) {
  const res = await fetch(`${API_BASE}/insights/anomalies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function scanOutlook(token: string, months: number): Promise<EmailScanResult[]> {
  const res = await fetch(`${API_BASE}/outlook-scan/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ months }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Scan failed' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.results
}
