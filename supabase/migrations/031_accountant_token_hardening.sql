-- Harden accountant_access token storage:
--   * Store only sha256(token) — never plaintext
--   * Add expiry, revoked_at, last_used_at
--   * Add accountant_access_log for per-request audit trail
--   * Since the feature has been unused so far (tokens are random UUIDs returned
--     only once), we can DROP existing rows and recreate clean rather than attempt
--     a plaintext → hash backfill.

-- Wipe any existing tokens — they're effectively unrecoverable once we drop the
-- plaintext column, and the feature has not been rolled out.
DELETE FROM public.accountant_access;

ALTER TABLE public.accountant_access
  DROP COLUMN IF EXISTS access_token;

ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT ARRAY['read_expenses','comment']::TEXT[],
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Keep legacy last_accessed_at column if present for backward-compat reads.
-- (We write to last_used_at going forward.)

ALTER TABLE public.accountant_access
  ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accountant_access_token_hash_idx
  ON public.accountant_access(token_hash);

CREATE INDEX IF NOT EXISTS accountant_access_user_idx
  ON public.accountant_access(user_id);

-- Per-request audit log. One row per successful token resolution.
CREATE TABLE IF NOT EXISTS public.accountant_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id UUID NOT NULL REFERENCES public.accountant_access(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  path TEXT,
  status_code INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accountant_access_log_access_idx
  ON public.accountant_access_log(access_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_access_log_user_idx
  ON public.accountant_access_log(user_id, created_at DESC);

ALTER TABLE public.accountant_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own accountant access log" ON public.accountant_access_log
  FOR SELECT USING (auth.uid() = user_id);
