create table public.expense_groups (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade not null,
  title            text not null,
  trip_date_start  date,
  trip_date_end    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.expense_groups (user_id);
alter table public.expense_groups enable row level security;
create policy "groups_all_own" on public.expense_groups for all using (auth.uid() = user_id);
alter table public.expenses add column if not exists group_id uuid references public.expense_groups(id) on delete set null;
create trigger set_updated_at_expense_groups before update on public.expense_groups for each row execute function public.set_updated_at();
