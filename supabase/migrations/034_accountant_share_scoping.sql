-- Scope accountant shares by date range and content type.
--
-- Extends accountant_access with:
--   * label            — human-friendly name for the share
--   * date_from / date_to — allowed expense date range (inclusive)
--   * include_receipts / include_invoices / include_mileage — content toggles
--   * view_count       — number of times the share was resolved
--
-- Also adds a /public endpoint that returns read-only expenses scoped by
-- the recipient-chosen date range, which must lie inside the share window.

ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS date_from DATE,
  ADD COLUMN IF NOT EXISTS date_to DATE,
  ADD COLUMN IF NOT EXISTS include_receipts BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_invoices BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_mileage BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
