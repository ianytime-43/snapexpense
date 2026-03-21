-- ═══════════════════════════════════════════════════════════
-- SnapExpense — Migration 005: Merchant Aliases
-- Maps raw OCR / processor strings to clean display names.
-- ═══════════════════════════════════════════════════════════

create table public.merchant_aliases (
  id           uuid primary key default gen_random_uuid(),
  raw_name     text not null,   -- OCR / processor string, e.g. "AMZN MKTP CA"
  display_name text not null,   -- Clean name shown to user, e.g. "Amazon"
  category     text,            -- Optional expense category hint
  created_at   timestamptz not null default now()
);

-- Case-insensitive unique index on raw_name for fast exact lookup
create unique index merchant_aliases_raw_lower on public.merchant_aliases (lower(raw_name));

-- Any authenticated user can read; only service role can write
alter table public.merchant_aliases enable row level security;
create policy "merchant_aliases_read" on public.merchant_aliases
  for select using (auth.role() = 'authenticated');

-- ── Seed data ─────────────────────────────────────────────
insert into public.merchant_aliases (raw_name, display_name, category) values
  -- Amazon
  ('AMZN MKTP',        'Amazon',           'Office Supplies'),
  ('AMZN MKTP CA',     'Amazon',           'Office Supplies'),
  ('AMZN MKTP US',     'Amazon',           'Office Supplies'),
  ('AMAZON.COM',       'Amazon',           'Office Supplies'),
  ('AMAZON CA',        'Amazon',           'Office Supplies'),
  ('AMAZON PRIME',     'Amazon',           'Software'),
  -- Apple
  ('APPLE.COM/BILL',   'Apple',            'Software'),
  ('APPLE CANADA',     'Apple',            'Software'),
  ('APPLE STORE',      'Apple',            'Software'),
  ('ITUNES.COM/BILL',  'Apple',            'Software'),
  -- Google
  ('GOOGLE *',         'Google',           'Software'),
  ('GOOGLE GSUITE',    'Google Workspace', 'Software'),
  ('GOOGLE CLOUD',     'Google Cloud',     'Software'),
  ('GOOGLE ADS',       'Google Ads',       'Marketing'),
  -- Microsoft
  ('MICROSOFT*',       'Microsoft',        'Software'),
  ('MSFT*',            'Microsoft',        'Software'),
  ('MICROSOFT 365',    'Microsoft 365',    'Software'),
  -- Ride share
  ('UBER*',            'Uber',             'Transportation'),
  ('UBER TRIP',        'Uber',             'Transportation'),
  ('LYFT*',            'Lyft',             'Transportation'),
  ('LYFT RIDE',        'Lyft',             'Transportation'),
  -- Food delivery
  ('DOORDASH*',        'DoorDash',         'Meals & Entertainment'),
  ('UBER EATS*',       'Uber Eats',        'Meals & Entertainment'),
  ('SKIP*',            'Skip The Dishes',  'Meals & Entertainment'),
  ('INSTACART*',       'Instacart',        'Meals & Entertainment'),
  -- Coffee & food chains
  ('STARBUCKS',        'Starbucks',        'Meals & Entertainment'),
  ('STARBUCKS STORE',  'Starbucks',        'Meals & Entertainment'),
  ('TIM HORTONS',      'Tim Hortons',      'Meals & Entertainment'),
  ('TIM HORTON',       'Tim Hortons',      'Meals & Entertainment'),
  ('MCDONALD''S',      'McDonald''s',      'Meals & Entertainment'),
  ('MCDONALDS',        'McDonald''s',      'Meals & Entertainment'),
  -- Hotels
  ('AIRBNB',           'Airbnb',           'Accommodation'),
  ('AIRBNB PMTS',      'Airbnb',           'Accommodation'),
  ('BOOKING.COM',      'Booking.com',      'Accommodation'),
  ('EXPEDIA',          'Expedia',          'Accommodation'),
  ('MARRIOTT',         'Marriott',         'Accommodation'),
  ('HILTON',           'Hilton',           'Accommodation'),
  -- Airlines
  ('AIR CANADA',       'Air Canada',       'Travel'),
  ('WESTJET',          'WestJet',          'Travel'),
  ('UNITED AIRLINES',  'United Airlines',  'Travel'),
  ('DELTA AIR',        'Delta',            'Travel'),
  -- Streaming / software
  ('NETFLIX.COM',      'Netflix',          'Software'),
  ('SPOTIFY',          'Spotify',          'Software'),
  ('SLACK',            'Slack',            'Software'),
  ('ZOOM.US',          'Zoom',             'Software'),
  ('DROPBOX',          'Dropbox',          'Software'),
  ('GITHUB',           'GitHub',           'Software'),
  ('NOTION',           'Notion',           'Software'),
  ('ATLASSIAN',        'Atlassian',        'Software'),
  -- Shipping
  ('FEDEX',            'FedEx',            'Office Supplies'),
  ('UPS*',             'UPS',              'Office Supplies'),
  ('CANADA POST',      'Canada Post',      'Office Supplies');
