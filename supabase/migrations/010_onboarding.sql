alter table public.users add column if not exists expense_workflow text check (expense_workflow in ('corporate_system', 'hr_managed', 'document', 'self_employed'));
-- onboarding_complete already exists in schema
