CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'CAD',
  merchant_name TEXT,
  transaction_date DATE,
  account_name TEXT,
  matched_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  match_confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_tx_user ON public.bank_transactions (user_id, transaction_date DESC);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank transactions" ON public.bank_transactions FOR ALL USING (auth.uid() = user_id);
