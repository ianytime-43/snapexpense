-- Migration 011: GPS coordinates on expenses + tax rates lookup table
-- Part of Wave 1: GPS & Location Intelligence

-- Add GPS coordinates to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add tax rate that was applied to this expense
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS tax_rate_applied NUMERIC(7,5);

-- Create tax rates lookup table with effective dates
-- Rates are stored in database (not hardcoded) so they can be updated
-- without code deploys when provinces/states change rates
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,           -- 'CA' or 'US'
  region TEXT NOT NULL,            -- 'ON', 'BC', 'AB', 'NY', 'CA', etc.
  tax_type TEXT NOT NULL,          -- 'HST', 'GST', 'PST', 'QST', 'RST', 'STATE'
  rate NUMERIC(7,5) NOT NULL,      -- 0.09975 for 9.975% (7,5 for QST precision)
  effective_from DATE NOT NULL,
  effective_to DATE,               -- NULL = currently active
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by country + region + active date
CREATE INDEX IF NOT EXISTS idx_tax_rates_lookup
ON public.tax_rates (country, region, effective_from);

-- Seed Canadian provincial tax rates (verified to 2025)
-- Alberta: GST only
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'AB', 'GST', 0.05000, '2008-01-01');

-- British Columbia: GST + PST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'BC', 'GST', 0.05000, '2008-01-01'),
('CA', 'BC', 'PST', 0.07000, '2013-04-01');

-- Manitoba: GST + RST (RST increased to 8% Dec 2023)
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from, effective_to) VALUES
('CA', 'MB', 'RST', 0.07000, '2013-07-01', '2023-11-30');
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'MB', 'GST', 0.05000, '2008-01-01'),
('CA', 'MB', 'RST', 0.08000, '2023-12-01');

-- New Brunswick: HST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'NB', 'HST', 0.15000, '2016-07-01');

-- Newfoundland & Labrador: HST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'NL', 'HST', 0.15000, '2016-07-01');

-- Nova Scotia: HST (reduced from 15% to 14% April 2025)
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from, effective_to) VALUES
('CA', 'NS', 'HST', 0.15000, '2010-07-01', '2025-03-31');
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'NS', 'HST', 0.14000, '2025-04-01');

-- Ontario: HST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'ON', 'HST', 0.13000, '2010-07-01');

-- Prince Edward Island: HST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'PE', 'HST', 0.15000, '2013-04-01');

-- Quebec: GST + QST (QST = 9.975%, requires NUMERIC(7,5) for exact precision)
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'QC', 'GST', 0.05000, '2008-01-01'),
('CA', 'QC', 'QST', 0.09975, '2013-01-01');

-- Saskatchewan: GST + PST
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'SK', 'GST', 0.05000, '2008-01-01'),
('CA', 'SK', 'PST', 0.06000, '2017-03-23');

-- Territories: GST only
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('CA', 'NT', 'GST', 0.05000, '2008-01-01'),
('CA', 'NU', 'GST', 0.05000, '2008-01-01'),
('CA', 'YT', 'GST', 0.05000, '2008-01-01');

-- US states with NO sales tax (still insert with rate 0 for completeness)
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('US', 'DE', 'STATE', 0.00000, '2000-01-01'),
('US', 'MT', 'STATE', 0.00000, '2000-01-01'),
('US', 'NH', 'STATE', 0.00000, '2000-01-01'),
('US', 'OR', 'STATE', 0.00000, '2000-01-01');

-- US major state sales tax rates (state-level only, not county/city)
INSERT INTO public.tax_rates (country, region, tax_type, rate, effective_from) VALUES
('US', 'CA', 'STATE', 0.07250, '2017-01-01'),
('US', 'NY', 'STATE', 0.04000, '2005-06-01'),
('US', 'TX', 'STATE', 0.06250, '2002-01-01'),
('US', 'FL', 'STATE', 0.06000, '2002-01-01'),
('US', 'WA', 'STATE', 0.06500, '2017-01-01'),
('US', 'IL', 'STATE', 0.06250, '2002-01-01'),
('US', 'PA', 'STATE', 0.06000, '2004-01-01'),
('US', 'OH', 'STATE', 0.05750, '2005-01-01'),
('US', 'NJ', 'STATE', 0.06630, '2017-01-01'),
('US', 'MA', 'STATE', 0.06250, '2010-01-01'),
('US', 'GA', 'STATE', 0.04000, '2002-01-01'),
('US', 'NC', 'STATE', 0.04750, '2011-01-01'),
('US', 'MI', 'STATE', 0.06000, '2015-01-01'),
('US', 'VA', 'STATE', 0.05300, '2013-01-01'),
('US', 'AZ', 'STATE', 0.05600, '2002-01-01'),
('US', 'TN', 'STATE', 0.07000, '2002-01-01'),
('US', 'IN', 'STATE', 0.07000, '2008-01-01'),
('US', 'MO', 'STATE', 0.04230, '2002-01-01'),
('US', 'WI', 'STATE', 0.05000, '2002-01-01'),
('US', 'MN', 'STATE', 0.06880, '2009-01-01'),
('US', 'CO', 'STATE', 0.02900, '2002-01-01'),
('US', 'AL', 'STATE', 0.04000, '2002-01-01'),
('US', 'SC', 'STATE', 0.06000, '2007-01-01'),
('US', 'LA', 'STATE', 0.04450, '2018-01-01'),
('US', 'KY', 'STATE', 0.06000, '2002-01-01'),
('US', 'CT', 'STATE', 0.06350, '2011-01-01'),
('US', 'UT', 'STATE', 0.06100, '2009-01-01'),
('US', 'IA', 'STATE', 0.06000, '2002-01-01'),
('US', 'NV', 'STATE', 0.06850, '2017-01-01'),
('US', 'AR', 'STATE', 0.06500, '2004-01-01'),
('US', 'MS', 'STATE', 0.07000, '2002-01-01'),
('US', 'KS', 'STATE', 0.06500, '2015-01-01'),
('US', 'NM', 'STATE', 0.05130, '2021-07-01'),
('US', 'NE', 'STATE', 0.05500, '2002-01-01'),
('US', 'ID', 'STATE', 0.06000, '2006-01-01'),
('US', 'WV', 'STATE', 0.06000, '2016-01-01'),
('US', 'HI', 'STATE', 0.04000, '2002-01-01'),
('US', 'ME', 'STATE', 0.05500, '2013-01-01'),
('US', 'RI', 'STATE', 0.07000, '2012-01-01'),
('US', 'SD', 'STATE', 0.04500, '2016-01-01'),
('US', 'ND', 'STATE', 0.05000, '2005-01-01'),
('US', 'AK', 'STATE', 0.00000, '2000-01-01'),
('US', 'VT', 'STATE', 0.06000, '2007-01-01'),
('US', 'WY', 'STATE', 0.04000, '2002-01-01'),
('US', 'DC', 'STATE', 0.06000, '2015-01-01'),
('US', 'OK', 'STATE', 0.04500, '2002-01-01'),
('US', 'MD', 'STATE', 0.06000, '2011-01-01');

-- Enable RLS on tax_rates (read-only for all authenticated users)
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tax rates"
ON public.tax_rates FOR SELECT
USING (true);
