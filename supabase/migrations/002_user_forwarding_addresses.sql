-- ═══════════════════════════════════════════════════════════
-- SnapExpense v1 — Migration 002: User Forwarding Addresses
-- Run in Supabase SQL Editor after 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════

create table public.user_forwarding_addresses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  forwarding_address  text unique not null,  -- e.g. a3f9c012@in.snapexpense.com
  created_at          timestamptz not null default now()
);

create index on public.user_forwarding_addresses (user_id);
create index on public.user_forwarding_addresses (forwarding_address);

alter table public.user_forwarding_addresses enable row level security;

-- Users can only see their own forwarding addresses
create policy "forwarding_addresses_own" on public.user_forwarding_addresses
  for all using (auth.uid() = user_id);
