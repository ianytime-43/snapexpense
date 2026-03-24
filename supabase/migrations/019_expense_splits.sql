-- Migration 019: Expense splits
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS split_from_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS split_percentage NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS idx_expenses_split ON public.expenses (split_from_id) WHERE split_from_id IS NOT NULL;
