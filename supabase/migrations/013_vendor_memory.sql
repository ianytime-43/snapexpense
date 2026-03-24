-- Migration 013: Vendor memory table
-- Stores per-user vendor preferences learned from expense corrections

CREATE TABLE IF NOT EXISTS public.vendor_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_normalized TEXT NOT NULL,
  merchant_display TEXT,
  category TEXT,
  expense_tag TEXT,
  tax_rate NUMERIC(7,5),
  payment_method TEXT,
  split_percentage NUMERIC(5,2),
  times_seen INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, merchant_normalized)
);

CREATE INDEX IF NOT EXISTS idx_vendor_memory_lookup
ON public.vendor_memory (user_id, merchant_normalized);

-- RLS: users can only access their own vendor memory
ALTER TABLE public.vendor_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vendor memory"
ON public.vendor_memory FOR ALL
USING (auth.uid() = user_id);
