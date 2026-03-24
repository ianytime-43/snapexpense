-- Migration 018: Optional category budgets for spending alerts
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, period)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budgets"
ON public.budgets FOR ALL USING (auth.uid() = user_id);
