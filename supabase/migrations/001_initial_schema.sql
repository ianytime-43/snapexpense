-- ═══════════════════════════════════════════════════════════
-- SnapExpense v1 — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 1. USERS  (extends Supabase Auth users)
-- ───────────────────────────────────────────────────────────
create table public.users (
  id                    uuid references auth.users(id) on delete cascade primary key,
  email                 text unique not null,
  full_name             text,
  company_name          text,
  department            text,
  employee_id           text,
  subscription_tier     text not null default 'free'
                          check (subscription_tier in ('free', 'personal', 'pro')),
  google_oauth_token    text,           -- encrypted at application layer
  microsoft_oauth_token text,           -- encrypted at application layer
  forwarding_email      text unique,    -- random hash, e.g. a8k2m9x1
  default_currency      text not null default 'USD',
  timezone              text not null default 'America/New_York',
  calendar_connected    boolean not null default false,
  onboarding_complete   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 2. EXPENSE_REPORTS  (defined before expenses for FK)
-- ───────────────────────────────────────────────────────────
create table public.expense_reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade not null,
  title            text not null,
  reporting_period text,
  status           text not null default 'draft'
                     check (status in ('draft', 'submitted')),
  total_amount     numeric(12, 2),
  expense_count    integer,
  export_format    text check (export_format in ('pdf', 'excel', 'csv')),
  export_url       text,
  column_config    jsonb,
  grouping         text not null default 'none'
                     check (grouping in ('none', 'date', 'category', 'client')),
  created_at       timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 3. EXPENSES
-- ───────────────────────────────────────────────────────────
create table public.expenses (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid references public.users(id) on delete cascade not null,
  status                      text not null default 'draft'
                                check (status in ('draft', 'confirmed', 'submitted', 'reimbursed')),
  merchant_name               text,
  merchant_address            text,
  expense_date                date,
  expense_time                time,
  amount_total                numeric(12, 2),
  amount_tax                  numeric(12, 2),
  amount_tip                  numeric(12, 2),
  currency                    text not null default 'USD',
  payment_method              text check (payment_method in ('personal_card', 'corporate_card', 'cash')),
  card_last_four              text,
  category                    text,
  business_purpose            text,
  client_name                 text,
  project_name                text,
  calendar_event_id           text,
  calendar_match_confidence   float,
  location_lat                float,
  location_lng                float,
  location_name               text,
  report_id                   uuid references public.expense_reports(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 4. RECEIPTS
-- ───────────────────────────────────────────────────────────
create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.users(id) on delete cascade not null,
  expense_id     uuid references public.expenses(id) on delete set null,
  image_url      text not null,
  receipt_role   text not null default 'itemized'
                   check (receipt_role in ('itemized', 'card_payment', 'invoice', 'supporting')),
  source         text not null
                   check (source in ('email_forward', 'camera', 'photo_library', 'upload', 'share_to')),
  image_hash     text,
  ocr_raw_text   text,
  ocr_confidence float,
  photo_taken_at timestamptz,
  photo_lat      float,
  photo_lng      float,
  is_duplicate   boolean not null default false,
  duplicate_of   uuid references public.receipts(id),
  uploaded_at    timestamptz not null default now(),
  processed_at   timestamptz
);

-- ───────────────────────────────────────────────────────────
-- 5. EXPENSE_LINE_ITEMS
-- ───────────────────────────────────────────────────────────
create table public.expense_line_items (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid references public.expenses(id) on delete cascade not null,
  description  text not null,
  quantity     numeric(10, 3),
  unit_price   numeric(12, 2),
  total_price  numeric(12, 2),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 6. ATTENDEES
-- ───────────────────────────────────────────────────────────
create table public.attendees (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid references public.expenses(id) on delete cascade not null,
  name        text,
  email       text,
  company     text,
  is_internal boolean not null default false,
  source      text not null default 'manual'
                check (source in ('calendar', 'manual')),
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 7. CALENDAR_EVENTS_CACHE
-- ───────────────────────────────────────────────────────────
create table public.calendar_events_cache (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete cascade not null,
  provider          text not null check (provider in ('google', 'microsoft')),
  external_event_id text not null,
  title             text,
  location          text,
  start_time        timestamptz,
  end_time          timestamptz,
  attendees_json    jsonb,
  organizer_email   text,
  fetched_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '24 hours'),
  unique (user_id, provider, external_event_id)
);

-- ───────────────────────────────────────────────────────────
-- 8. VENDOR_REGISTRY
-- ───────────────────────────────────────────────────────────
create table public.vendor_registry (
  id                  uuid primary key default gen_random_uuid(),
  vendor_name         text not null,
  vendor_category     text not null
                        check (vendor_category in ('ride', 'hotel', 'airline', 'food', 'general')),
  sender_domains      jsonb not null default '[]',
  subject_patterns    jsonb not null default '[]',
  attachment_patterns jsonb,
  parser_type         text not null,
  field_mappings      jsonb,
  is_active           boolean not null default true,
  priority            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────
-- 9. FORWARDED_EMAILS
-- ───────────────────────────────────────────────────────────
create table public.forwarded_emails (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete cascade not null,
  from_address        text,
  subject             text,
  body_text           text,
  attachments_json    jsonb,
  vendor_id           uuid references public.vendor_registry(id) on delete set null,
  parsed_amount       numeric(12, 2),
  parsed_date         date,
  expense_id          uuid references public.expenses(id) on delete set null,
  processing_status   text not null default 'received'
                        check (processing_status in ('received', 'parsing', 'matched', 'failed')),
  received_at         timestamptz not null default now(),
  processed_at        timestamptz
);

-- ───────────────────────────────────────────────────────────
-- 10. NOTIFICATIONS
-- ───────────────────────────────────────────────────────────
create table public.notifications (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references public.users(id) on delete cascade not null,
  type     text not null
             check (type in ('unsubmitted_reminder', 'missing_receipt', 'expense_ready')),
  title    text not null,
  body     text,
  read     boolean not null default false,
  sent_at  timestamptz not null default now(),
  read_at  timestamptz
);

-- ═══════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════

create index on public.expenses (user_id);
create index on public.expenses (status);
create index on public.expenses (expense_date);
create index on public.expenses (user_id, status);
create index on public.receipts (user_id);
create index on public.receipts (expense_id);
create index on public.receipts (image_hash);
create index on public.calendar_events_cache (user_id);
create index on public.calendar_events_cache (expires_at);
create index on public.forwarded_emails (user_id);
create index on public.notifications (user_id, read);

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

alter table public.users               enable row level security;
alter table public.expenses            enable row level security;
alter table public.receipts            enable row level security;
alter table public.expense_line_items  enable row level security;
alter table public.attendees           enable row level security;
alter table public.calendar_events_cache enable row level security;
alter table public.forwarded_emails    enable row level security;
alter table public.vendor_registry     enable row level security;
alter table public.expense_reports     enable row level security;
alter table public.notifications       enable row level security;

-- users
create policy "users_select_own"  on public.users for select  using (auth.uid() = id);
create policy "users_insert_own"  on public.users for insert  with check (auth.uid() = id);
create policy "users_update_own"  on public.users for update  using (auth.uid() = id);

-- expenses
create policy "expenses_select_own" on public.expenses for select  using (auth.uid() = user_id);
create policy "expenses_insert_own" on public.expenses for insert  with check (auth.uid() = user_id);
create policy "expenses_update_own" on public.expenses for update  using (auth.uid() = user_id);
create policy "expenses_delete_own" on public.expenses for delete  using (auth.uid() = user_id);

-- receipts
create policy "receipts_select_own" on public.receipts for select  using (auth.uid() = user_id);
create policy "receipts_insert_own" on public.receipts for insert  with check (auth.uid() = user_id);
create policy "receipts_update_own" on public.receipts for update  using (auth.uid() = user_id);
create policy "receipts_delete_own" on public.receipts for delete  using (auth.uid() = user_id);

-- expense_line_items (inherit from parent expense)
create policy "line_items_select_own" on public.expense_line_items for select
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.user_id = auth.uid()
  ));
create policy "line_items_insert_own" on public.expense_line_items for insert
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.user_id = auth.uid()
  ));
create policy "line_items_delete_own" on public.expense_line_items for delete
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.user_id = auth.uid()
  ));

-- attendees
create policy "attendees_all_own" on public.attendees for all
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.user_id = auth.uid()
  ));

-- calendar cache
create policy "calendar_cache_all_own" on public.calendar_events_cache for all
  using (auth.uid() = user_id);

-- forwarded emails
create policy "forwarded_emails_all_own" on public.forwarded_emails for all
  using (auth.uid() = user_id);

-- vendor registry — any authenticated user can read
create policy "vendor_registry_read" on public.vendor_registry for select
  using (auth.role() = 'authenticated');

-- expense reports
create policy "expense_reports_all_own" on public.expense_reports for all
  using (auth.uid() = user_id);

-- notifications
create policy "notifications_all_own" on public.notifications for all
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: auto-create user profile on first sign-up
-- ═══════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: updated_at timestamps
-- ═══════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_users
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_updated_at_expenses
  before update on public.expenses
  for each row execute function public.set_updated_at();

create trigger set_updated_at_vendor_registry
  before update on public.vendor_registry
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- SEED: Vendor Registry (20 vendors)
-- ═══════════════════════════════════════════════════════════

insert into public.vendor_registry
  (vendor_name, vendor_category, sender_domains, subject_patterns, parser_type, priority)
values
  -- Tier 1: Custom parsers
  ('Uber',          'ride',    '["uber.com","uber-receipts.com"]',       '["Your .* trip with Uber","Your Uber receipt","Trip with Uber"]',                    'uber_ride',            100),
  ('Lyft',          'ride',    '["lyft.com","lyftmail.com"]',            '["Your Lyft ride","Lyft ride receipt","ride with Lyft"]',                            'lyft_ride',            100),
  ('Airbnb',        'hotel',   '["airbnb.com"]',                         '["reservation confirmed","Your trip to","Airbnb reservation"]',                      'airbnb_stay',           90),
  ('Booking.com',   'hotel',   '["booking.com"]',                        '["Booking confirmation","Your booking at","reservation"]',                           'booking_hotel',         90),
  ('Expedia',       'hotel',   '["expedia.com"]',                        '["booking confirmation","Your itinerary","Expedia booking"]',                        'expedia_generic',       80),
  ('Amazon Business','general','["amazon.com","amazon.ca"]',             '["order confirmation","Your Amazon order","Your order"]',                            'amazon_order',          80),
  -- Tier 2: Category parsers
  ('Hilton',        'hotel',   '["hilton.com"]',                         '["reservation","Hilton stay","Your stay at"]',                                       'hotel_generic',         70),
  ('Marriott',      'hotel',   '["marriott.com"]',                       '["reservation","Marriott stay","Your stay at"]',                                     'hotel_generic',         70),
  ('IHG',           'hotel',   '["ihg.com"]',                            '["reservation","IHG stay","Holiday Inn","Crowne Plaza"]',                            'hotel_generic',         70),
  ('Air Canada',    'airline', '["aircanada.ca","aircanada.com"]',       '["booking confirmation","eTicket receipt","Air Canada itinerary"]',                  'airline_generic',       70),
  ('United',        'airline', '["united.com"]',                         '["booking confirmation","eTicket receipt","United itinerary"]',                      'airline_generic',       70),
  ('Delta',         'airline', '["delta.com"]',                          '["booking confirmation","eTicket receipt","Delta itinerary"]',                       'airline_generic',       70),
  ('WestJet',       'airline', '["westjet.com"]',                        '["booking confirmation","eTicket","WestJet itinerary"]',                             'airline_generic',       70),
  ('Southwest',     'airline', '["southwest.com"]',                      '["flight confirmation","boarding pass","Southwest itinerary"]',                      'airline_generic',       70),
  -- Tier 3: Generic parsers
  ('DoorDash',      'food',    '["doordash.com"]',                       '["order confirmation","Your DoorDash order","DoorDash receipt"]',                   'food_delivery_generic', 60),
  ('Skip The Dishes','food',   '["skipthedishes.com"]',                  '["order confirmation","Skip order","Your order from"]',                              'food_delivery_generic', 60),
  ('Hotels.com',    'hotel',   '["hotels.com"]',                         '["booking confirmation","Your booking","Hotels.com reservation"]',                   'hotel_generic',         60),
  ('Uber Eats',     'food',    '["ubereats.com"]',                       '["Your Uber Eats order","order confirmation"]',                                      'food_delivery_generic', 60),
  ('Instacart',     'general', '["instacart.com"]',                      '["order confirmation","Your Instacart order"]',                                      'amazon_order',          50),
  ('FedEx',         'general', '["fedex.com"]',                          '["shipment confirmation","FedEx receipt","invoice"]',                                'amazon_order',          50);
