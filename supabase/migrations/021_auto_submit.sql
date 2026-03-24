ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS auto_submit_frequency TEXT DEFAULT 'never' CHECK (auto_submit_frequency IN ('never', 'weekly', 'monthly')),
ADD COLUMN IF NOT EXISTS auto_submit_email TEXT;
