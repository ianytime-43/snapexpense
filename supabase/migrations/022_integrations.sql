CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  company_name TEXT,
  settings JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  UNIQUE(user_id, platform)
);
CREATE TABLE IF NOT EXISTS public.category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  snap_category TEXT NOT NULL,
  platform_category TEXT NOT NULL,
  platform_code TEXT,
  UNIQUE(user_id, platform, snap_category)
);
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integrations" ON public.integration_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own mappings" ON public.category_mappings FOR ALL USING (auth.uid() = user_id);
