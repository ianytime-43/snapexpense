CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'CAD',
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'annual', 'weekly')),
  expense_tag TEXT DEFAULT 'business',
  last_seen_date DATE,
  next_expected_date DATE,
  previous_amount NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recurring" ON public.recurring_expenses FOR ALL USING (auth.uid() = user_id);
