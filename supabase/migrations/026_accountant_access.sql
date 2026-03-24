CREATE TABLE IF NOT EXISTS public.accountant_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accountant_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  UNIQUE(user_id, accountant_email)
);
CREATE TABLE IF NOT EXISTS public.expense_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accountant access" ON public.accountant_access FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Comments visible to expense owner" ON public.expense_comments FOR ALL USING (
  expense_id IN (SELECT id FROM public.expenses WHERE user_id = auth.uid())
);
