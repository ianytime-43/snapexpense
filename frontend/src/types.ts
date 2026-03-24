export interface Expense {
  id: string
  user_id: string
  status: 'draft' | 'confirmed' | 'submitted' | 'reimbursed'
  merchant_name: string | null
  merchant_address: string | null
  expense_date: string | null
  expense_time: string | null
  amount_total: number | null
  amount_tax: number | null
  amount_tip: number | null
  currency: string
  payment_method: 'personal_card' | 'corporate_card' | 'cash' | null
  card_last_four: string | null
  category: string | null
  business_purpose: string | null
  client_name: string | null
  project_name: string | null
  calendar_event_id: string | null
  calendar_event_title: string | null
  calendar_match_confidence: number | null
  calendar_suggested_client: string | null
  calendar_suggested_purpose: string | null
  notes: string | null
  expense_tag?: 'business' | 'work' | 'personal' | null
  report_id: string | null
  group_id: string | null
  location_name: string | null
  location_jurisdiction: string | null
  document_type?: 'receipt' | 'invoice' | 'subscription' | 'payment_confirmation' | null
  alcohol_total?: number | null
  due_date?: string | null
  converted_amount: number | null
  conversion_rate: number | null
  converted_currency: string | null
  created_at: string
  updated_at: string
  receipts?: Receipt[]
  attendees?: Attendee[]
}

export interface ExpenseGroup {
  id: string
  user_id: string
  title: string
  trip_date_start: string | null
  trip_date_end: string | null
  expense_count: number
  total_amount: number
  created_at: string
  updated_at: string
  expenses?: Expense[]
}

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  department: string | null
  default_currency: string | null
  timezone: string | null
  reminder_frequency: 'weekly' | 'never'
  expense_workflow: 'corporate_system' | 'hr_managed' | 'document' | 'self_employed' | null
  onboarding_complete: boolean
  expense_categories?: string[]
  work_hours_start?: string
  work_hours_end?: string
  work_days?: number[]
  country?: string
  region?: string
  locale?: string
  notification_push?: boolean
  notification_email?: boolean
  notification_sms?: boolean
  created_at: string
  updated_at: string
}

export interface Receipt {
  id: string
  user_id: string
  expense_id: string | null
  image_url: string
  receipt_role: string
  source: string
  ocr_raw_text: string | null
  ocr_confidence: number | null
  is_duplicate: boolean
  uploaded_at: string
  processed_at: string | null
}

export interface Attendee {
  id: string
  expense_id: string
  name: string | null
  email: string | null
  company: string | null
  is_internal: boolean
  source: string
  created_at: string
}

export interface LineItem {
  id: string
  expense_id: string
  description: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  sort_order: number
}

export interface EmailScanResult {
  email_id: string
  subject: string
  sender: string
  date: string
}
