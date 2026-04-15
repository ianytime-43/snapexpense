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

export async function importGmailReceipt(
  token: string,
  emailId: string,
  subject: string,
  sender: string,
  date: string,
): Promise<{ status: string; expense_id: string | null }> {
  const res = await fetch(`${API_BASE}/gmail/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email_id: emailId, subject, sender, date }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
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

// ── Tax ───────────────────────────────────────────────────────────────────────

export async function getQuarterlyEstimate(token: string, annualIncome: number) {
  const res = await fetch(`${API_BASE}/tax/quarterly-estimate?annual_income=${annualIncome}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getTaxSummary(token: string, quarter?: number, year?: number) {
  const params = new URLSearchParams()
  if (quarter) params.set('quarter', quarter.toString())
  if (year) params.set('year', year.toString())
  const res = await fetch(`${API_BASE}/tax/summary?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Mileage ──────────────────────────────────────────────────────────────────

export interface TripData {
  start_address?: string
  end_address?: string
  start_lat?: number
  start_lng?: number
  end_lat?: number
  end_lng?: number
  distance_km?: number
  trip_date?: string
  trip_tag?: 'business' | 'work' | 'personal' | 'commute'
  notes?: string
}

export async function getTrips(token: string, months = 3) {
  return apiFetch(`/mileage/trips?months=${months}`, token)
}

export async function createTrip(token: string, data: TripData) {
  return apiFetch('/mileage/trips', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateTrip(token: string, id: string, data: Partial<TripData>) {
  return apiFetch(`/mileage/trips/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteTrip(token: string, id: string) {
  return apiFetch(`/mileage/trips/${id}`, token, { method: 'DELETE' })
}

export async function getMileageSummary(token: string, year?: number) {
  const params = year ? `?year=${year}` : ''
  return apiFetch(`/mileage/summary${params}`, token)
}

// ── Integrations ─────────────────────────────────────────────────────────────

export interface IntegrationConnection {
  platform: string
  company_name: string | null
  connected_at: string | null
  last_synced_at: string | null
}

export async function getIntegrationConnections(token: string): Promise<IntegrationConnection[]> {
  const data = await apiFetch('/integrations/connections', token)
  return data.connections
}

export async function connectIntegration(
  token: string,
  platform: string,
  companyName = '',
): Promise<void> {
  await apiFetch('/integrations/connect', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, company_name: companyName }),
  })
}

export async function disconnectIntegration(token: string, platform: string): Promise<void> {
  await apiFetch(`/integrations/disconnect/${platform}`, token, { method: 'DELETE' })
}

// ── Bank Transactions ─────────────────────────────────────────────────────────

export interface BankTransactionIn {
  external_id?: string
  amount: number
  currency?: string
  merchant_name?: string
  transaction_date?: string
  account_name?: string
}

export interface BankTransaction {
  id: string
  external_id?: string
  amount: number
  currency: string
  merchant_name?: string
  transaction_date?: string
  account_name?: string
  matched_expense_id?: string
  match_confidence?: number
  category?: string
  pending?: boolean
  status?: 'unmatched' | 'matched' | 'dismissed' | 'converted'
  plaid_item_id?: string
  created_at: string
  expenses?: {
    id: string
    merchant_name?: string
    amount_total?: number
    expense_date?: string
    status?: string
  } | null
}

export interface BankCoverage {
  total_transactions: number
  matched: number
  unmatched_transactions: number
  extra_receipts: number
  coverage_pct: number
}

export async function importBankTransactions(
  transactions: BankTransactionIn[],
  token: string,
): Promise<{ imported: number; auto_matched: number }> {
  return apiFetch('/bank/import', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
}

export async function importBankCsv(
  file: File,
  token: string,
): Promise<{ imported: number; auto_matched: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE}/bank/import-csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Import failed' }))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function getBankTransactions(
  token: string,
  unmatchedOnly = false,
): Promise<BankTransaction[]> {
  return apiFetch(`/bank/transactions${unmatchedOnly ? '?unmatched_only=true' : ''}`, token)
}

export async function manualMatchTransaction(
  transactionId: string,
  expenseId: string,
  token: string,
): Promise<BankTransaction> {
  return apiFetch('/bank/match', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_id: transactionId, expense_id: expenseId }),
  })
}

export async function unmatchTransaction(transactionId: string, token: string): Promise<void> {
  return apiFetch(`/bank/unmatch/${transactionId}`, token, { method: 'POST' })
}

export async function getBankCoverage(token: string): Promise<BankCoverage> {
  return apiFetch('/bank/coverage', token)
}

// ── Plaid integration ────────────────────────────────────────────────────────

export interface PlaidItem {
  id: string
  item_id: string
  institution_name?: string | null
  status: string
  last_sync_at?: string | null
  created_at: string
}

export interface PlaidStatus {
  configured: boolean
  items: PlaidItem[]
}

export interface MatchCandidate {
  id: string
  merchant_name?: string
  amount_total?: number
  expense_date?: string
  score: number
}

export async function getPlaidStatus(token: string): Promise<PlaidStatus> {
  return apiFetch('/bank/status', token)
}

export async function createPlaidLinkToken(
  token: string,
): Promise<{ link_token: string; expiration?: string }> {
  return apiFetch('/bank/link-token', token, { method: 'POST' })
}

export async function exchangePlaidToken(
  token: string,
  publicToken: string,
  institutionName?: string,
  institutionId?: string,
): Promise<{ item_id: string; institution_name?: string }> {
  return apiFetch('/bank/exchange-token', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public_token: publicToken,
      institution_name: institutionName,
      institution_id: institutionId,
    }),
  })
}

export async function syncBank(
  token: string,
  itemId?: string,
): Promise<{ added: number; modified: number; removed: number; auto_matched: number }> {
  return apiFetch('/bank/sync', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId }),
  })
}

export async function removePlaidItem(token: string, itemRowId: string): Promise<void> {
  return apiFetch(`/bank/items/${itemRowId}`, token, { method: 'DELETE' })
}

export async function getMatchCandidates(
  token: string,
  txId: string,
): Promise<{ candidates: MatchCandidate[] }> {
  return apiFetch(`/bank/transactions/${txId}/candidates`, token)
}

export async function matchTransactionToExpense(
  token: string,
  txId: string,
  expenseId: string,
): Promise<void> {
  return apiFetch(`/bank/transactions/${txId}/match`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_id: expenseId }),
  })
}

export async function convertTransactionToExpense(
  token: string,
  txId: string,
  expenseTag: 'business' | 'work' | 'personal' = 'business',
): Promise<{ expense_id: string }> {
  return apiFetch(`/bank/transactions/${txId}/convert`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_tag: expenseTag }),
  })
}

export async function dismissTransaction(token: string, txId: string): Promise<void> {
  return apiFetch(`/bank/transactions/${txId}/dismiss`, token, { method: 'POST' })
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export interface DetectedSubscription {
  merchant_name: string
  amount: number
  currency: string
  frequency: 'monthly' | 'annual' | 'weekly'
  expense_tag: string
  last_seen_date: string
  next_expected_date: string
  times_seen: number
  price_change: number | null
}

export interface SavedSubscription {
  id: string
  user_id: string
  merchant_name: string
  amount: number | null
  currency: string
  frequency: string
  expense_tag: string
  last_seen_date: string | null
  next_expected_date: string | null
  previous_amount: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function detectSubscriptions(
  token: string,
): Promise<{ subscriptions: DetectedSubscription[]; count: number }> {
  return apiFetch('/subscriptions/detect', token)
}

export async function listSubscriptions(
  token: string,
): Promise<{ subscriptions: SavedSubscription[] }> {
  return apiFetch('/subscriptions', token)
}

export async function saveSubscription(
  token: string,
  data: Omit<DetectedSubscription, 'times_seen'>,
): Promise<SavedSubscription> {
  return apiFetch('/subscriptions', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_name: data.merchant_name,
      amount: data.amount,
      currency: data.currency,
      frequency: data.frequency,
      expense_tag: data.expense_tag,
      last_seen_date: data.last_seen_date,
      next_expected_date: data.next_expected_date,
      previous_amount: data.price_change != null ? data.amount - data.price_change : null,
    }),
  })
}

export async function deleteSubscription(token: string, id: string): Promise<void> {
  return apiFetch(`/subscriptions/${id}`, token, { method: 'DELETE' })
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

// ── Accountant Access ─────────────────────────────────────────────────────────

export interface AccountantAccess {
  accountant_email: string
  access_token: string
  granted_at: string
  last_accessed_at: string | null
}

export async function inviteAccountant(token: string, accountant_email: string): Promise<AccountantAccess> {
  return apiFetch('/accountant/invite', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountant_email }),
  })
}

export async function revokeAccountant(token: string, email: string): Promise<void> {
  return apiFetch(`/accountant/revoke/${encodeURIComponent(email)}`, token, { method: 'DELETE' })
}

export async function getAccountantAccessList(token: string): Promise<AccountantAccess[]> {
  return apiFetch('/accountant/access-list', token)
}

export async function downloadTaxPackage(token: string, year: number): Promise<Blob> {
  const res = await fetch(`${API_BASE}/accountant/tax-package/${year}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

// ── Enterprise ────────────────────────────────────────────────────────────────

export interface EnterpriseProfile {
  employee_id: string | null
  cost_center: string | null
  default_gl_code: string | null
  manager_email: string | null
  enterprise_platform: string | null
}

export interface ComplianceCheck {
  profile_checks: Record<string, boolean>
  profile_ready: boolean
  expense_checks: Array<{
    id: string
    merchant_name: string | null
    amount_total: number | null
    issues: string[]
    ready: boolean
  }>
  all_expenses_ready: boolean
  ready_to_submit: boolean
  not_found_ids: string[]
}

export async function getEnterpriseProfile(token: string): Promise<EnterpriseProfile> {
  return apiFetch('/enterprise/profile', token)
}

export async function updateEnterpriseProfile(
  data: Partial<EnterpriseProfile>,
  token: string,
): Promise<EnterpriseProfile> {
  return apiFetch('/enterprise/profile', token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function validateEnterpriseExpenses(
  expenseIds: string[],
  token: string,
): Promise<ComplianceCheck> {
  return apiFetch('/enterprise/validate', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_ids: expenseIds }),
  })
}

export async function formatEnterpriseExpenses(
  expenseIds: string[],
  platform: string,
  token: string,
): Promise<{ platform: string; formatted_expenses: unknown[]; expense_count: number }> {
  return apiFetch('/enterprise/format', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_ids: expenseIds, platform }),
  })
}


// -- Natural Language Search --------------------------------------------------

export interface SearchResult {
  results: import('../types').Expense[]
  filters: Record<string, unknown>
  count: number
  error?: string
}

export async function naturalSearch(query: string, token: string): Promise<SearchResult> {
  return apiFetch('/search/natural', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
}

// -- Zapier Webhooks ----------------------------------------------------------

export async function getZapierTriggers(token: string) {
  return apiFetch('/zapier/triggers', token)
}

export async function registerZapierWebhook(event: string, url: string, token: string) {
  return apiFetch('/zapier/webhooks', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, url }),
  })
}

// -- Admin --------------------------------------------------------------------

export async function adminHealth(token: string) {
  const res = await fetch(`${API_BASE}/admin/health`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminTestAll(token: string) {
  const res = await fetch(`${API_BASE}/admin/test-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminTestEndpoints(token: string) {
  const res = await fetch(`${API_BASE}/admin/test-endpoints`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminListExpenses(token: string) {
  const res = await fetch(`${API_BASE}/admin/expenses`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminReprocessAll(token: string) {
  const res = await fetch(`${API_BASE}/admin/reprocess-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminReprocessOne(token: string, expenseId: string) {
  const res = await fetch(`${API_BASE}/admin/reprocess`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expense_id: expenseId }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminUpdateExpense(token: string, expenseId: string, updates: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/admin/update-expense`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expense_id: expenseId, updates }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminFindDuplicates(token: string) {
  const res = await fetch(`${API_BASE}/admin/duplicates`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function adminDeleteDuplicates(token: string, expenseIds: string[]) {
  const res = await fetch(`${API_BASE}/admin/delete-duplicates`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expense_ids: expenseIds }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// -- Smart Rules --------------------------------------------------------------

export interface SmartRule {
  id: string
  user_id: string
  name: string
  merchant_pattern: string
  category: string | null
  is_tax_deductible: boolean
  is_active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface SmartRuleInput {
  name: string
  merchant_pattern: string
  category?: string | null
  is_tax_deductible?: boolean
  is_active?: boolean
  priority?: number
}

export async function listSmartRules(token: string): Promise<{ rules: SmartRule[] }> {
  return apiFetch('/smart-rules', token)
}

export async function createSmartRule(token: string, data: SmartRuleInput): Promise<SmartRule> {
  return apiFetch('/smart-rules', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateSmartRule(
  token: string,
  id: string,
  data: Partial<SmartRuleInput>,
): Promise<SmartRule> {
  return apiFetch(`/smart-rules/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteSmartRule(token: string, id: string): Promise<void> {
  return apiFetch(`/smart-rules/${id}`, token, { method: 'DELETE' })
}

export async function testSmartRule(
  token: string,
  merchant: string,
  amount?: number,
): Promise<{ matched: boolean; rule: SmartRule | null; checked_count: number }> {
  return apiFetch('/smart-rules/test', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, amount }),
  })
}

export async function applySmartRulesToExisting(
  token: string,
): Promise<{ updated: number; rules_evaluated: number }> {
  return apiFetch('/smart-rules/apply-to-existing', token, { method: 'POST' })
}

// -- Accountant scoped shares (date-range, content toggles) -----------------

export interface AccountantShare {
  id: string
  accountant_email?: string
  label: string | null
  date_from: string | null
  date_to: string | null
  granted_at: string | null
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
  view_count?: number | null
  include_receipts?: boolean | null
  include_invoices?: boolean | null
  include_mileage?: boolean | null
}

export interface CreateShareInput {
  label?: string
  date_from: string
  date_to: string
  expires_in_days?: number
  include_receipts?: boolean
  include_invoices?: boolean
  include_mileage?: boolean
  accountant_email?: string
}

export interface CreateShareResponse {
  id: string
  label: string | null
  date_from: string
  date_to: string
  expires_at: string
  include_receipts: boolean
  include_invoices: boolean
  include_mileage: boolean
  access_token: string
  access_token_notice: string
}

export async function createAccountantShare(
  token: string,
  data: CreateShareInput,
): Promise<CreateShareResponse> {
  return apiFetch('/accountant/shares', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function listAccountantShares(token: string): Promise<AccountantShare[]> {
  return apiFetch('/accountant/access-list', token)
}

export async function revokeAccountantShare(token: string, shareId: string): Promise<void> {
  return apiFetch(`/accountant/shares/${shareId}`, token, { method: 'DELETE' })
}

export interface PublicAccountantExpense {
  id: string
  merchant_name?: string | null
  expense_date?: string | null
  amount_total?: number | null
  tax_total?: number | null
  gst_hst?: number | null
  category?: string | null
  province?: string | null
  doc_type?: string | null
  [key: string]: unknown
}

export interface PublicAccountantMileageTrip {
  id: string
  trip_date?: string | null
  distance_km?: number | null
  start_address?: string | null
  end_address?: string | null
  trip_tag?: string | null
  notes?: string | null
}

export interface PublicAccountantView {
  share: {
    owner_email_masked: string
    label: string | null
    date_range: { from: string | null; to: string | null }
    expires_at: string | null
    include_receipts: boolean
    include_invoices: boolean
    include_mileage: boolean
  }
  expenses: PublicAccountantExpense[]
  totals: { count: number; subtotal: number; tax_total: number; grand_total: number }
  mileage: { trips: PublicAccountantMileageTrip[]; total_km: number; count: number } | null
}

export async function fetchPublicAccountantView(
  plaintextToken: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<PublicAccountantView> {
  const params = new URLSearchParams({ token: plaintextToken })
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const res = await fetch(`${API_BASE}/accountant/public?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    const error = new Error(err.detail || `HTTP ${res.status}`) as Error & { status?: number }
    error.status = res.status
    throw error
  }
  return res.json()
}
