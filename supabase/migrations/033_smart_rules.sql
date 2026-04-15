-- 033_smart_rules.sql
-- Smart Rules: pattern-based auto-categorization for incoming receipts.
-- When a new expense is ingested, rules are matched against the merchant name
-- and apply category + tax-deductible flag when the expense is uncategorized.

CREATE TABLE IF NOT EXISTS public.smart_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  merchant_pattern TEXT NOT NULL,
  category TEXT,
  is_tax_deductible BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_rules_user_active
  ON public.smart_rules (user_id, is_active);

ALTER TABLE public.smart_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own smart rules"
  ON public.smart_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Optional: track which rule was applied to an expense (non-breaking addition).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS applied_rule_id UUID;

COMMENT ON COLUMN public.expenses.applied_rule_id IS
  'References smart_rules.id when an expense was auto-categorized by a smart rule. No FK to allow soft-delete of rules.';
