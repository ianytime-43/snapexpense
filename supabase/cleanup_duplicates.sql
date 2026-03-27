-- STEP 1: View duplicates (run this first to see what will be deleted)
SELECT merchant_name, amount_total, expense_date, COUNT(*) as copies,
       array_agg(id ORDER BY created_at ASC) as expense_ids
FROM public.expenses
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
GROUP BY merchant_name, amount_total, expense_date
HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- STEP 2: Delete duplicates, keeping the OLDEST one in each group
-- First delete related records
DELETE FROM public.receipts WHERE expense_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY COALESCE(merchant_name, ''), COALESCE(amount_total::text, ''), COALESCE(expense_date::text, '')
      ORDER BY created_at ASC
    ) as rn
    FROM public.expenses
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
  ) sub WHERE rn > 1
);

DELETE FROM public.attendees WHERE expense_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY COALESCE(merchant_name, ''), COALESCE(amount_total::text, ''), COALESCE(expense_date::text, '')
      ORDER BY created_at ASC
    ) as rn
    FROM public.expenses
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
  ) sub WHERE rn > 1
);

DELETE FROM public.expense_line_items WHERE expense_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY COALESCE(merchant_name, ''), COALESCE(amount_total::text, ''), COALESCE(expense_date::text, '')
      ORDER BY created_at ASC
    ) as rn
    FROM public.expenses
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
  ) sub WHERE rn > 1
);

DELETE FROM public.expenses WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY COALESCE(merchant_name, ''), COALESCE(amount_total::text, ''), COALESCE(expense_date::text, '')
      ORDER BY created_at ASC
    ) as rn
    FROM public.expenses
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
  ) sub WHERE rn > 1
);

-- STEP 3: Verify no more duplicates
SELECT COUNT(*) as remaining_duplicates FROM (
  SELECT merchant_name, amount_total, expense_date
  FROM public.expenses
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomastom92@gmail.com')
  GROUP BY merchant_name, amount_total, expense_date
  HAVING COUNT(*) > 1
) sub;
