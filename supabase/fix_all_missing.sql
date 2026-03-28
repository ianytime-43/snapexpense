-- SnapExpense: Fix ALL missing columns and tables
-- Run this ONCE in Supabase SQL Editor
-- Safe to re-run — uses IF NOT EXISTS everywhere

-- Migration 005: Merchant Aliases (if table missing)
CREATE TABLE IF NOT EXISTS public.merchant_aliases (
  id           uuid primary key default gen_random_uuid(),
  raw_name     text not null,
  display_name text not null,
  category     text,
  created_at   timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_aliases_raw_lower ON public.merchant_aliases (lower(raw_name));
ALTER TABLE public.merchant_aliases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "merchant_aliases_read" ON public.merchant_aliases FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed merchant aliases if table is empty
INSERT INTO public.merchant_aliases (raw_name, display_name, category)
SELECT * FROM (VALUES
  ('AMZN MKTP', 'Amazon', 'Office Supplies'),
  ('AMAZON.COM', 'Amazon', 'Office Supplies'),
  ('UBER*', 'Uber', 'Transportation'),
  ('LYFT*', 'Lyft', 'Transportation'),
  ('STARBUCKS', 'Starbucks', 'Meals & Entertainment'),
  ('TIM HORTONS', 'Tim Hortons', 'Meals & Entertainment'),
  ('COSTCO*', 'Costco', 'Office Supplies'),
  ('H-MART', 'H-Mart', 'Meals & Entertainment'),
  ('H MART', 'H-Mart', 'Meals & Entertainment'),
  ('POPEYES*', 'Popeyes', 'Meals & Entertainment'),
  ('AIR CANADA', 'Air Canada', 'Travel'),
  ('WESTJET', 'WestJet', 'Travel'),
  ('AIRBNB', 'Airbnb', 'Accommodation'),
  ('NETFLIX.COM', 'Netflix', 'Software'),
  ('SPOTIFY', 'Spotify', 'Software'),
  ('DOORDASH*', 'DoorDash', 'Meals & Entertainment')
) AS v(raw_name, display_name, category)
WHERE NOT EXISTS (SELECT 1 FROM public.merchant_aliases LIMIT 1)
ON CONFLICT (lower(raw_name)) DO NOTHING;

-- Migration 007: Location jurisdiction
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS location_jurisdiction TEXT;

-- Migration 008: Currency conversion (THIS IS THE CRITICAL MISSING ONE)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS converted_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS converted_currency TEXT;

-- Migration 009: Reminder preferences
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reminder_frequency TEXT DEFAULT 'weekly';

-- Migration 010: Onboarding
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;

-- Reload schema cache so PostgREST picks up all new columns
NOTIFY pgrst, 'reload schema';
