-- Migration 029: Additional merchant aliases for common Canadian retailers
-- Covers: Costco, grocery stores, Asian restaurants, gas stations, pharmacies, etc.

INSERT INTO public.merchant_aliases (raw_name, display_name, category) VALUES
  -- Costco (appears as many variations in OCR)
  ('COSTCO*',           'Costco',            'Office Supplies'),
  ('COSTCO WHOLESALE',  'Costco',            'Office Supplies'),
  ('COSTCO WHSE',       'Costco',            'Office Supplies'),
  ('COSTCO GAS',        'Costco Gas',        'Transportation'),
  ('COSTCO FUEL',       'Costco Gas',        'Transportation'),
  -- Walmart
  ('WAL-MART*',         'Walmart',           'Office Supplies'),
  ('WALMART*',          'Walmart',           'Office Supplies'),
  ('WM SUPERCENTER',    'Walmart',           'Office Supplies'),
  -- Canadian grocery stores
  ('LOBLAWS',           'Loblaws',           'Meals & Entertainment'),
  ('REAL CANADIAN*',    'Real Canadian Superstore', 'Meals & Entertainment'),
  ('SUPERSTORE',        'Real Canadian Superstore', 'Meals & Entertainment'),
  ('NO FRILLS',         'No Frills',         'Meals & Entertainment'),
  ('SHOPPERS DRUG*',    'Shoppers Drug Mart', 'Other'),
  ('SDM*',              'Shoppers Drug Mart', 'Other'),
  ('METRO INC',         'Metro',             'Meals & Entertainment'),
  ('SOBEYS',            'Sobeys',            'Meals & Entertainment'),
  ('SAFEWAY',           'Safeway',           'Meals & Entertainment'),
  ('SAVE-ON-FOODS',     'Save-On-Foods',     'Meals & Entertainment'),
  ('T&T SUPERMARKET',   'T&T Supermarket',   'Meals & Entertainment'),
  ('T & T*',            'T&T Supermarket',   'Meals & Entertainment'),
  -- H-Mart and Asian grocery
  ('H-MART',            'H-Mart',            'Meals & Entertainment'),
  ('H MART',            'H-Mart',            'Meals & Entertainment'),
  ('HMART*',            'H-Mart',            'Meals & Entertainment'),
  ('HAPPY TREE',        'Happy Tree',        'Meals & Entertainment'),
  -- Korean / Asian restaurants (common chains)
  ('POPEYES*',          'Popeyes',           'Meals & Entertainment'),
  ('SUBWAY*',           'Subway',            'Meals & Entertainment'),
  ('A&W*',              'A&W',               'Meals & Entertainment'),
  ('BOSTON PIZZA',       'Boston Pizza',      'Meals & Entertainment'),
  ('THE KEG',           'The Keg',           'Meals & Entertainment'),
  ('CACTUS CLUB',       'Cactus Club',       'Meals & Entertainment'),
  ('EARLS*',            'Earls',             'Meals & Entertainment'),
  ('WHITE SPOT',        'White Spot',        'Meals & Entertainment'),
  ('PIZZA HUT',         'Pizza Hut',         'Meals & Entertainment'),
  ('DOMINOS*',          'Dominos',           'Meals & Entertainment'),
  -- Gas stations (Canada)
  ('PETRO-CANADA*',     'Petro-Canada',      'Transportation'),
  ('PETRO CANADA*',     'Petro-Canada',      'Transportation'),
  ('SHELL*',            'Shell',             'Transportation'),
  ('ESSO*',             'Esso',              'Transportation'),
  ('HUSKY*',            'Husky',             'Transportation'),
  ('CHEVRON*',          'Chevron',           'Transportation'),
  ('PIONEER*',          'Pioneer',           'Transportation'),
  ('ULTRAMAR*',         'Ultramar',          'Transportation'),
  ('CANADIAN TIRE*',    'Canadian Tire',     'Other'),
  -- US grocery/retail
  ('WHOLE FOODS*',      'Whole Foods',       'Meals & Entertainment'),
  ('TRADER JOE*',       'Trader Joe''s',     'Meals & Entertainment'),
  ('TARGET*',           'Target',            'Office Supplies'),
  ('BEST BUY*',         'Best Buy',          'Office Supplies'),
  ('HOME DEPOT*',       'Home Depot',        'Other'),
  ('LOWES*',            'Lowe''s',           'Other'),
  -- US gas stations
  ('EXXON*',            'Exxon',             'Transportation'),
  ('BP*',               'BP',                'Transportation'),
  ('CIRCLE K*',         'Circle K',          'Transportation'),
  ('7-ELEVEN*',         '7-Eleven',          'Meals & Entertainment'),
  -- Payment platforms
  ('PAYPAL*',           'PayPal',            'Other'),
  ('STRIPE*',           'Stripe',            'Software'),
  ('SQ *',              'Square',            'Other'),
  ('SQUARE*',           'Square',            'Other')
ON CONFLICT (lower(raw_name)) DO NOTHING;
