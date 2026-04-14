-- 030_plaid_integration.sql
-- Plaid bank integration: connected items + extended bank_transactions

CREATE TABLE IF NOT EXISTS public.plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,                -- MVP: stored as plaintext; rotate to encrypted column post-launch
  institution_id TEXT,
  institution_name TEXT,
  cursor TEXT,                               -- transactions/sync cursor for incremental pulls
  status TEXT NOT NULL DEFAULT 'active',     -- active | error | disconnected
  error_message TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON public.plaid_items (user_id);
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plaid items" ON public.plaid_items FOR ALL USING (auth.uid() = user_id);

-- Extend bank_transactions for Plaid metadata
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS plaid_item_id UUID REFERENCES public.plaid_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unmatched', -- unmatched | matched | dismissed | converted
  ADD COLUMN IF NOT EXISTS raw_json JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_plaid_id
  ON public.bank_transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON public.bank_transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched ON public.bank_transactions (matched_expense_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_plaid_item ON public.bank_transactions (plaid_item_id);

-- Backfill: any existing row with a matched_expense_id gets status 'matched'
UPDATE public.bank_transactions
SET status = 'matched'
WHERE matched_expense_id IS NOT NULL AND status = 'unmatched';
