-- ═══════════════════════════════════════════════════════════
-- SnapExpense v1 — Migration 003: Calendar Columns
-- Run in Supabase SQL Editor after 002_user_forwarding_addresses.sql
-- ═══════════════════════════════════════════════════════════

-- Store Google Calendar OAuth token (access_token, refresh_token, expiry, email)
alter table public.users
  add column if not exists google_calendar_token jsonb;

-- Calendar match metadata on expenses
alter table public.expenses
  add column if not exists calendar_event_title     text,
  add column if not exists calendar_suggested_client  text,
  add column if not exists calendar_suggested_purpose text;
