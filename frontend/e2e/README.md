# SnapExpense E2E tests (Playwright)

End-to-end tests that exercise critical user flows: auth, upload → confirm,
delete with undo, bank page, rules, and accountant shares.

## Why these exist
A bug shipped because `frontend/src/pages/DashboardPage.tsx:218` (and :268)
silently swallowed a failing `deleteExpense` call in the undo-expiry handler.
The UI showed success; the row persisted server-side. `03-delete-expense.spec.ts`
reloads the page after delete and re-checks the list — that round-trip catches
silent-catch bugs that unit tests cannot.

## Local setup

1. Install deps (once):
   ```bash
   cd frontend
   npm install
   npx playwright install --with-deps chromium
   ```
2. Create one dedicated test user in your Supabase project:
   - Supabase dashboard → Authentication → Users → Invite user.
   - Email: e.g. `e2e-test@snapexpense.local`
   - Set a strong password; confirm the user so it can log in.
3. Copy the env template and fill it in:
   ```bash
   cp .env.e2e.example .env.e2e
   # edit .env.e2e — set E2E_TEST_EMAIL, E2E_TEST_PASSWORD,
   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   ```
4. Run the suite:
   ```bash
   npm run test:e2e           # headless
   npm run test:e2e:ui        # Playwright UI mode
   ```

The config auto-starts `npm run dev` on port 5173; if your dev server is
already running it will be reused.

## CI setup (GitHub Actions)

Workflow lives at `.github/workflows/e2e.yml`. It runs on every push and PR
and needs these repo secrets:

- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Add them under: GitHub → repo → Settings → Secrets and variables → Actions.

## What each test covers

| File | Covers |
| --- | --- |
| `01-auth.spec.ts` | Landing + `/auth` render; invalid creds show error |
| `02-upload-and-confirm.spec.ts` | Upload fixture image → save → land on `/dashboard` |
| `03-delete-expense.spec.ts` | **Round-trip delete** — the silent-catch regression guard |
| `04-bank-page.spec.ts` | `/bank` renders; no console errors; tabs switch; Plaid sandbox test skipped unless `PLAID_SECRET` set |
| `05-rules-and-shares.spec.ts` | Create a smart rule; create an accountant share with token |

## Fixtures

- `fixtures/auth.ts` — Playwright fixture that signs in via Supabase JS and
  injects the session into `localStorage` under `sb-<project-ref>-auth-token`.
- `fixtures/sample-receipt.png` — 10x10 red PNG, committed. OCR will not
  extract real data from it; the upload test therefore asserts on the flow,
  not on parsed content.

## Troubleshooting

- **"Missing env var ..."** — you forgot `.env.e2e`. See setup above.
- **"Supabase sign-in failed"** — create the test user in Supabase or update
  the password in `.env.e2e`.
- **Port 5173 already in use** — Playwright will reuse your running `npm run
  dev`. That's fine.
- **Slow first run** — Chromium download. Subsequent runs cache.
