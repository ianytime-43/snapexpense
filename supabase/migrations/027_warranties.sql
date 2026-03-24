CREATE TABLE IF NOT EXISTS public.warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  purchase_date DATE,
  warranty_expires DATE,
  return_window_expires DATE,
  store_name TEXT,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own warranties" ON public.warranties FOR ALL USING (auth.uid() = user_id);
