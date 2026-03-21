alter table public.users add column if not exists reminder_frequency text not null default 'weekly' check (reminder_frequency in ('weekly', 'never'));
