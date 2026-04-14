-- 031_plaid_access_token_encryption.sql
-- Add encrypted-at-rest column for Plaid access_tokens.
--
-- Strategy: Python-side Fernet encryption (cryptography.fernet), key held in
-- PLAID_ENCRYPTION_KEY env var. We avoid pgcrypto to stay portable across
-- Supabase tiers / local Postgres.
--
-- Migration plan:
--   1. (this migration) Add nullable text column for encrypted ciphertext.
--      Service layer dual-writes plaintext + encrypted for new rows and
--      prefers encrypted on read (falling back to plaintext for legacy rows).
--   2. One-time backfill script (not here) re-encrypts any rows that still
--      have plaintext-only access_token.
--   3. (follow-up migration) Drop the plaintext `access_token` column once
--      all rows have access_token_encrypted populated.
--
-- TODO: add migration 032 to DROP COLUMN access_token after backfill.

ALTER TABLE public.plaid_items
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;

-- The plaintext column stays NOT NULL for now to avoid breaking the legacy
-- insert path during rollout; it will be loosened / dropped in 032.
COMMENT ON COLUMN public.plaid_items.access_token IS
  'DEPRECATED — being replaced by access_token_encrypted (Fernet ciphertext). Will be dropped in migration 032 after backfill.';
COMMENT ON COLUMN public.plaid_items.access_token_encrypted IS
  'Fernet-encrypted Plaid access_token. Encrypted with PLAID_ENCRYPTION_KEY env var via cryptography.fernet.Fernet.';
