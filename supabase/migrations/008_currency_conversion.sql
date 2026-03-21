alter table public.expenses
  add column if not exists converted_amount numeric(12,2),
  add column if not exists conversion_rate numeric(10,6),
  add column if not exists converted_currency text;
