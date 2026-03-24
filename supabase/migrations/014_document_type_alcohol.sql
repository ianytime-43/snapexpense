-- Migration 014: Document type detection + alcohol amount tracking
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'receipt' CHECK (document_type IN ('receipt', 'invoice', 'subscription', 'payment_confirmation')),
ADD COLUMN IF NOT EXISTS alcohol_total NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS due_date DATE;
