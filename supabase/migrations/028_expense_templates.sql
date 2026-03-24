CREATE TABLE IF NOT EXISTS public.expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount NUMERIC(10,2),
  category TEXT,
  expense_tag TEXT DEFAULT 'business',
  notes TEXT,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.expense_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON public.expense_templates FOR ALL USING (auth.uid() = user_id);
