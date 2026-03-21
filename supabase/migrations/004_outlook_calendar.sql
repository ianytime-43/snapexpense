-- Add Outlook Calendar token storage to users table
alter table public.users
  add column if not exists outlook_calendar_token jsonb;
