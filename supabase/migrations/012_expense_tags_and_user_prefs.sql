-- Migration 012: Expense tags + user preferences for work hours, country, notifications
-- Part of Wave 1: Tags & Intelligence

-- Add expense tag (business, work, personal)
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS expense_tag TEXT CHECK (expense_tag IN ('business', 'work', 'personal'));

-- Add user preference columns
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS expense_categories JSONB DEFAULT '["business", "personal"]',
ADD COLUMN IF NOT EXISTS work_hours_start TEXT DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS work_hours_end TEXT DEFAULT '17:00',
ADD COLUMN IF NOT EXISTS work_days JSONB DEFAULT '[1,2,3,4,5]',
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'CA',
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS notification_push BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_email BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_sms BOOLEAN DEFAULT false;

-- Index for filtering expenses by tag
CREATE INDEX IF NOT EXISTS idx_expenses_tag ON public.expenses (user_id, expense_tag);
