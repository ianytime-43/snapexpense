-- Migration 017: Tax deduction calculation results stored on expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS tax_deductible_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS itc_claimable NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS deduction_pct NUMERIC(5,4),
ADD COLUMN IF NOT EXISTS tax_line TEXT,
ADD COLUMN IF NOT EXISTS deduction_rule TEXT;
