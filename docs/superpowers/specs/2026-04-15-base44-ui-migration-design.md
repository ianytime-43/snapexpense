# SnapExpense UI Migration to Base44 Aesthetic

**Date:** 2026-04-15
**Owner:** Thomas Hong
**Type:** Frontend redesign, backend untouched
**Estimated effort:** 1.5–2 days focused work, executed via 4 parallel subagents
**Risk level:** Medium — touches every product page, but no backend or data changes

---

## 1. Goal

Adopt the Base44 reference app's visual language (shadcn/ui + emerald + Plus Jakarta Sans + framer-motion + react-query) across every in-app product page, while preserving 100% of SnapExpense's real backend, security posture, and tax/bank/calendar logic. Marketing landing page stays on its editorial Fraunces aesthetic — this migration is product-only.

## 2. Non-goals

- No backend changes. APIs, Supabase schema, Plaid/Mailgun/Gmail security, CRA/IRS tax engine — all untouched.
- No new user-facing features. This is pure redesign + small UX upgrades, not scope expansion.
- No migration of editorial LandingPage. That stays.
- No adoption of Base44's mock-backend patterns (`base44.entities.*` client, Base44 auth). We replace every such call with our real API.
- No invoice Kanban or province MapView from Base44 (Codex rejected both as scope creep / theater).
- No `.ics` upload CalendarSync — we already have real Google+Outlook OAuth, downgrading would be a regression.

## 3. Success criteria

1. Every product page (not landing) uses shadcn/ui primitives and the emerald palette.
2. `SettingsPage` 1,271-line god-component is split into focused sub-pages under `/settings/*`.
3. All 174 backend tests + 21 frontend tests still pass post-migration.
4. `npm run build` succeeds; bundle size does not regress beyond +15%.
5. Dark mode works on every migrated page.
6. Mobile nav + desktop sidebar both function; no dead routes.
7. One real user (the ASUS friend) can sign up, scan a receipt, connect a bank, view tax dashboard — without hitting any broken page.

## 4. Architecture

### 4.1 What changes

**Dependencies added:**
- `@radix-ui/*` primitives for shadcn/ui (accordion, dialog, select, tabs, tooltip, toast, sheet, etc.)
- `class-variance-authority`, `tailwind-merge`, `clsx` for shadcn utils
- `@tanstack/react-query` for data fetching + caching (replaces ad-hoc `useEffect` fetches)
- `framer-motion` for transitions
- `sonner` for toast notifications
- `lucide-react` (already in some form — verify)
- `recharts` (verify, may already be present)
- `date-fns` (verify)

**New layout:**
- `src/components/layout/AppLayout.tsx` — replaces current ad-hoc layout
- `src/components/layout/Sidebar.tsx` — desktop collapsible sidebar
- `src/components/layout/MobileNav.tsx` — mobile bottom nav (replaces current `BottomNav`)
- `src/components/layout/FloatingActionButton.tsx` — FAB with Scan/Upload/Invoice shortcuts

**Design system:**
- Fonts: Plus Jakarta Sans (display) + Inter (body) + JetBrains Mono (numbers)
- Palette: emerald primary (HSL 160 80% 24%), warm amber accent, shadcn new-york style
- CSS vars in `src/index.css` using HSL variables (existing dark/light class system stays)

**Pages (one-to-one remap — same routes, new components):**

| Route | Before (lines) | After strategy |
|---|---|---|
| `/dashboard` | `DashboardPage.tsx` (749) | Port Base44 Dashboard — SummaryCards + SpendingChart + TopMerchants + RecentTransactions wired to our API |
| `/expenses` | `ExpensePage.tsx` (1014) | Split into `ExpensesListPage` (Base44 Receipts-style) + inline `ReceiptDetailSheet` |
| `/upload` | `UploadPage.tsx` (489) | Port Base44 ReceiptCapture — drag/drop/paste + scan-line animation, wired to our real OCR+Claude |
| `/bank` | `BankMatchingPage.tsx` (559) | Redesign with shadcn Tabs + Dialog candidate picker; backend untouched |
| `/mileage` | `MilageagePage.tsx` (501) | Redesign using Base44 MileageTracker UX; our GPS watch + CRA rate calc stays |
| `/tax` | `TaxDashboardPage.tsx` (449) | Redesign as shadcn cards + progress bars; our CRA/IRS engine stays |
| `/quarterly` | `QuarterlyEstimatePage.tsx` (343) | Redesign; keep disclaimer on what-if simulator |
| `/home-office` | `HomeOfficePage.tsx` (481) | Redesign; fake "Add" button already removed |
| `/insights` | `InsightsPage.tsx` (330) | Redesign using Base44 `Expenses` page pattern (charts + category breakdown) |
| `/rules` | `SmartRulesPage.tsx` (new today) | Redesign in shadcn style |
| `/shares` | `AccountantSharesPage.tsx` (new today) | Redesign in shadcn style |
| `/accountant-view` | `AccountantViewPage.tsx` (new today) | Redesign in shadcn style (public route) |
| `/settings` | `SettingsPage.tsx` (1271) | **SPLIT** into `/settings`, `/settings/profile`, `/settings/tax`, `/settings/integrations`, `/settings/security`, `/settings/billing`, `/settings/data` |
| `/admin` | `AdminPage.tsx` (529) | Minimal restyling; owner-only, low user impact |
| `/status` | `StatusPage.tsx` (155) | Minimal restyling; owner-only |
| `/subscriptions` | `SubscriptionsPage.tsx` (366) | Redesign as shadcn pricing cards |
| `/onboarding` | `OnboardingPage.tsx` (423) | Redesign with shadcn Dialog + stepper |
| `/` (landing) | `LandingPage.tsx` (574 editorial) | **UNTOUCHED** — marketing keeps its own aesthetic |
| `/auth` | `AuthPage.tsx` (160) | Redesign with shadcn; brand consistency |
| `/submit-session` | `SubmitSessionPage.tsx` (393) | Redesign with shadcn |
| `/privacy`, `/terms` | existing | Minimal restyling |

**New pages (from Base44 that Codex said to adopt):**
- `/clients` — `ClientsPage.tsx` (Base44 Clients, simplified — only if we add a backend `clients` table; **deferred unless user confirms**)
- `/calendar` — `CalendarViewPage.tsx` (month grid; reuse our calendar data) — **deferred, Codex said low value**
- `/reports` — `ReportsPage.tsx` (dedicated exports surface, moved from Settings) — **include**

**Pages stays deleted:** `WarrantyPage`, `EnterpriseSubmitPage` (already removed this session).

### 4.2 Data layer

Replace ad-hoc `useEffect + useState` fetches with react-query:

```tsx
// Before
useEffect(() => { api.listExpenses().then(setExpenses); }, []);

// After
const { data: expenses = [] } = useQuery({
  queryKey: ['expenses'],
  queryFn: () => api.listExpenses(),
});
```

Mutations use `useMutation` with automatic cache invalidation. `QueryClientProvider` wraps `App.tsx`. No backend changes required.

### 4.3 Backend — untouched

Every `api.*` call in `frontend/src/lib/api.ts` still points to Railway FastAPI. Plaid, Mailgun, Gmail metadata, Outlook OAuth, tax engine, accountant shares, smart rules pipeline hook — all unchanged.

## 5. Execution plan (parallel subagents)

**Phase 1 — Infrastructure (1 agent, ~2 hrs, sequential):**
1. Install shadcn/ui + react-query + framer-motion + sonner + cva + tailwind-merge via npm
2. Run `npx shadcn-ui@latest init` targeting `src/components/ui/`
3. Add essential shadcn components: button, card, input, label, badge, select, dialog, sheet, tabs, tooltip, toast, skeleton, table, switch, separator, textarea, checkbox, radio-group, progress, alert-dialog, dropdown-menu, scroll-area
4. Update `tailwind.config.js` with emerald palette + Plus Jakarta Sans + Inter + JetBrains Mono font families
5. Update `src/index.css` with HSL vars from Base44 (both light and dark mode)
6. Wire `QueryClientProvider` into `App.tsx`
7. Add layout shell: `AppLayout.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `FAB.tsx` — ported from Base44 code
8. Verify landing page still renders unchanged
9. Commit: `feat(ui): shadcn infrastructure + layout shell`

**Phase 2 — Core flow pages (3 parallel agents, ~4 hrs each):**
- **Agent A:** Dashboard + Expenses list + ReceiptDetailSheet + Upload/Capture page
- **Agent B:** Bank matching + Mileage + Insights
- **Agent C:** Tax dashboard + Quarterly + Home office + Reports (new)

**Phase 3 — Settings split + auxiliary (2 parallel agents, ~3 hrs each):**
- **Agent D:** Split SettingsPage into 6 sub-pages under `/settings/*`
- **Agent E:** Rules + Shares + AccountantView + Subscriptions + Auth + Onboarding + Submit Session

**Phase 4 — Codex adversarial review (parallel with Phase 3):**
Codex reviews Phase 1 + Phase 2 output for: shadcn best practices, accessibility regressions, bundle size, dark-mode correctness, react-query cache key collisions.

**Phase 5 — Merge + verify + commit (main agent, ~1 hr):**
- Run full test suite (backend pytest + frontend vitest)
- Run `npm run build`
- Manual smoke test: landing, auth, dashboard, upload, expenses, bank, tax, mileage, rules, shares, settings sub-pages
- Resolve any merge conflicts (App.tsx, api.ts, locales)
- Commit per phase
- Delete old page files only after new versions verified

## 6. Testing

- **Automated:** existing 174 backend + 21 frontend tests must continue to pass. No new tests required (pure redesign).
- **Manual smoke:** main agent walks through every route in dev mode at the end.
- **Accessibility:** shadcn primitives are Radix-based → WCAG 2.1 AA by default. Keyboard nav + screen reader support inherited.
- **Dark mode:** every page verified in both light and dark.
- **Bundle size:** `npm run build` output checked vs. current 747 kB baseline. Acceptable ceiling: 900 kB (gzipped ~220 kB).

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundle size explodes past 1 MB | Medium | Code-split routes via `React.lazy`; lazy-load shadcn components where possible |
| Dark mode breaks on migrated pages | Medium | Every PR tested in both modes; shadcn has dark-mode built in |
| react-query cache keys collide | Low | Single convention: `['<entity>', ...filters]` everywhere |
| SettingsPage split loses a feature | Medium | Agent D produces a feature-parity checklist before deletion |
| Merge conflicts in App.tsx / api.ts | Medium | One agent owns App.tsx merges at Phase 5 |
| Radix + existing Tailwind classes conflict | Low | shadcn's new-york style is Tailwind-native |
| User hates the result | Low | Landing page aesthetic stays as fallback; can roll back frontend commits without touching backend |

## 8. Rollback

Every phase is one commit. If a phase regresses badly, `git revert <phase-commit>` on the frontend only. Backend is untouched throughout, so no database or API rollback needed.

## 9. Open questions / deferred decisions

1. **Clients page** — do we add this? It requires a new backend `clients` table. Deferred unless user confirms.
2. **Calendar month-grid view** — low value per Codex; deferred.
3. **QuickBooks export flow** — Base44 doesn't have it; ours is in Reports. Stays.
4. **Mobile PWA install prompt** — Base44 doesn't include it; we keep existing one.

## 10. Timeline

- Phase 1: 2 hours
- Phase 2: 4 hours (parallel, wall-clock)
- Phase 3: 3 hours (parallel, wall-clock)
- Phase 4: runs parallel with Phase 3 — no extra time
- Phase 5: 1 hour
- **Total wall-clock: ~10 hours**, spread over 1–2 focused days. Agent-hours: ~24.
