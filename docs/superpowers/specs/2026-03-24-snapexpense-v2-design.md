# SnapExpense V2 — Full Product Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** 70 features across 3 waves, Canada + US market, $0 launch

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Architecture](#architecture)
3. [Wave 1: Scanning Just Works](#wave-1-scanning-just-works)
4. [Wave 2: My Taxes Are Handled](#wave-2-my-taxes-are-handled)
5. [Wave 3: Everything Connects](#wave-3-everything-connects)
6. [Compliance & Legal](#compliance--legal)
7. [Timeline](#timeline)
8. [Feature Rankings](#feature-rankings)
9. [Database Migrations](#database-migrations)
10. [File Map](#file-map)

---

## Product Vision

**One-liner:** "Scan, tap, done" — the best individual expense app for Canadian + US users.

**Positioning:** No competitor combines scanner-app-quality capture + tax intelligence + both CRA and IRS support + modern UX. SnapExpense fills the gap between Wave (good Canadian tax, terrible scanning) and Expensify (good scanning, no Canadian tax).

**9 unique features no competitor offers at any price:**
1. GPS → province/state → tax rate auto-applied
2. Work hours prediction (business vs personal suggestion)
3. Alcohol line-item detection + auto-split
4. CRA + IRS in one app
5. Calendar meeting → expense context matching (already built)
6. 3-way tags (Business / Work / Personal)
7. Blur detection before capture
8. Haptic feedback on expense actions
9. Undo after destructive actions

**Target users:**
- Self-employed / business owners (Canada + US)
- Employees submitting reimbursements
- Freelancers mixing business + personal spending

**North star metric:** Confirm an expense in under 15 seconds.

---

## Architecture

**Approach: Modular monolith** — same simple deployment (Railway + Vercel), organized into domain modules.

```
backend/app/
├── core/              # auth, database, config, pipeline
├── modules/
│   ├── capture/       # camera, album, gmail scan, chrome ext
│   ├── expense/       # CRUD, bulk ops, splits, templates
│   ├── tax/           # CRA/IRS engine, province rates, ITC
│   ├── intel/         # GPS, work hours, vendor memory, calendar
│   ├── export/        # reports, formats, Concur push, Zapier
│   ├── integrations/  # QuickBooks, Xero, Plaid, PayPal, Concur
│   └── user/          # onboarding, settings, profiles
└── services/          # existing: ocr, ai_parser, pipeline, etc.
```

**Frontend stays the same:** React + TypeScript + Tailwind CSS on Vercel (PWA).

**Key principle:** Most features are invisible to the user. GPS, vendor memory, tax rates, work hours prediction — all happen silently. The user sees "scan, tap, done." The complexity lives in the backend.

---

## Wave 1: Scanning Just Works

**32 features. Goal: Make receipt capture so effortless users scan everything.**
**Overall score: 93/100** (after all fixes applied)

### 1.1 Auto-Scan Camera + Back-to-Back Mode

User opens camera → sees viewfinder with guide box → edge detection finds rectangle → green border appears → text verification confirms readable content (~0.5s) → auto-capture with haptic → receipt thumbnail slides to corner → counter: "1 receipt scanned" → camera immediately ready for next → user taps "Done (5)" → batch processing begins.

**Technology:**
- Edge detection: OpenCV.js (WASM) in browser
- Text verification: Tesseract.js lightweight check (confirms text exists, not what it says)
- Image enhancement: auto-crop to detected edges, perspective correction, contrast boost, thermal receipt enhancement, shadow removal (all client-side before upload)
- Back-to-back UX: receipt thumbnails stack in bottom bar with count badge

**Files:**
- NEW: `frontend/src/components/ScannerMode.tsx`
- NEW: `frontend/src/lib/imageEnhance.ts`
- MODIFY: `frontend/src/pages/UploadPage.tsx` — add "Scanner Mode" toggle
- MODIFY: `frontend/src/components/CameraCapture.tsx` — feed video frames to ScannerMode

### 1.2 Blur Detection + Receipt Quality Feedback

Real-time blur overlay on viewfinder. Red zones = blurry. Laplacian variance algorithm running on-device. "Hold steady" prompt with haptic warning. Blocks capture if critical text regions are unreadable.

**Built into:** `ScannerMode.tsx`

### 1.3 GPS Capture + Album GPS Extraction

**Live GPS:** `navigator.geolocation.getCurrentPosition()` on every scan. Silent, one-time permission prompt.

**Album EXIF:** `exif-js` npm package reads GPS + timestamp from photos before upload (~5KB).

**Reverse geocode:** Google Maps Geocoding API (server-side, free tier). Coordinates → city, province/state.

**Tax rate lookup:** Province/state → GST/HST/PST or state sales tax rate from `tax_rates` database table.

**Fallback chain:** Live GPS → EXIF GPS → merchant address → user's home province.

**Files:**
- NEW: `frontend/src/lib/gps.ts` — GPS capture + EXIF extraction
- NEW: `backend/app/modules/tax/rates.py` — province/state tax rate lookup
- MODIFY: `frontend/src/components/ScannerMode.tsx` — capture GPS
- MODIFY: `frontend/src/pages/UploadPage.tsx` — send GPS coords with upload
- MODIFY: `backend/app/routers/receipts.py` — accept GPS, pass to pipeline
- MODIFY: `backend/app/services/pipeline.py` — reverse geocode, look up tax rate
- NEW: `supabase/migrations/011_gps_columns.sql` — add latitude, longitude to expenses

### 1.4 Email Scanning (Metadata-Only at Launch)

**Launch approach:** Gmail metadata scope (`gmail.metadata`) — reads subject lines + senders only. No CASA assessment needed. $0.

**Flow:** Settings → "Scan Email" → shows list of emails matching receipt/invoice senders or subjects → "We found 23 emails that look like receipts. Forward these to your SnapExpense address?" → one-tap forwarding.

**Full body scanning (Wave 2):** Requires `gmail.readonly` + CASA assessment ($500-$25K). Deferred until revenue exists.

**Email forwarding (existing):** Kept as fallback. Mailgun inbound already works.

**Both Gmail + Outlook supported.** Same UI, different APIs.

**Files:**
- NEW: `backend/app/routers/gmail_scan.py` — metadata-only scan endpoint
- NEW: `backend/app/routers/outlook_scan.py` — Outlook metadata scan
- NEW: `backend/app/services/gmail_scanner.py` — Gmail API metadata search
- NEW: `backend/app/services/outlook_scanner.py` — Microsoft Graph metadata search
- MODIFY: `backend/app/main.py` — register routers
- MODIFY: `frontend/src/pages/SettingsPage.tsx` — scan UI + consent dialog
- MODIFY: `frontend/src/lib/api.ts` — add scan functions
- MODIFY: `frontend/src/types.ts` — add ScanResult type
- MODIFY: `frontend/src/pages/PrivacyPage.tsx` — update privacy policy

### 1.5 Album Scanning with AI Receipt Detection

User taps "Scan Album" → app reads photo metadata (3/6/12 month range) → TensorFlow.js lite model filters receipts from regular photos (client-side, ~2MB) → shows grid with confidence badges + GPS locations → user selects which to import → extracts EXIF GPS → batch sends to pipeline.

**Fallback:** If TF.js unavailable, show all photos and let user pick manually.

**Files:**
- NEW: `frontend/src/components/AlbumScanner.tsx`
- NEW: `frontend/src/lib/receiptDetector.ts` — TF.js receipt classification
- MODIFY: `frontend/src/pages/UploadPage.tsx` — add "Scan Album" button

### 1.6 Business / Work / Personal Tags

**Onboarding (new steps):**
1. "How do you use SnapExpense?" — multi-select: Business / Work / Personal
2. "What are your typical work hours?" — time picker + day selector
3. "Which country?" — Canada (→ province) / US (→ state) / Other (basic mode)

**One-tap tagging:** After scan, pre-selects best guess:
- Calendar match found → Business/Work (high confidence, pre-selected)
- During work hours, no calendar → Business/Work (medium, pre-selected dimmer)
- Outside work hours, no calendar → Personal (medium)
- Weekend, no calendar → Personal
- Alcohol detected + employee mode → warning + split prompt

**Never auto-confirms.** Always user's final call.

**Currency auto-set from country.** Canada → CAD, US → USD. Overridable in Settings.

**Database:**
- `expense_tag` on expenses: 'business' | 'work' | 'personal'
- `expense_categories` on users: JSON array of enabled tags
- `work_hours_start`, `work_hours_end` on users
- `work_days` on users: JSON array [1,2,3,4,5]
- `country`, `region` on users

**Files:**
- NEW: `backend/app/modules/intel/work_hours.py`
- NEW: `supabase/migrations/013_expense_tags.sql`
- MODIFY: `frontend/src/pages/OnboardingPage.tsx` — add new steps
- MODIFY: `frontend/src/pages/ExpensePage.tsx` — add one-tap tag buttons
- MODIFY: `frontend/src/types.ts` — update types
- MODIFY: `backend/app/services/pipeline.py` — generate tag suggestion
- MODIFY: `backend/app/routers/users.py` — accept new profile fields

### 1.7 Vendor Memory

App learns from user corrections. After 2-3 times: Tim Hortons auto-fills Meals & Entertainment, Business, HST 13%. Remembers: merchant → category, tag, tax rate, payment method, split ratio.

**Cross-user fallback (future):** Anonymous aggregate — "90% of users categorize Starbucks as Meals."

**Files:**
- NEW: `backend/app/modules/intel/vendor_memory.py`
- NEW: `supabase/migrations/014_vendor_memory.sql`
- MODIFY: `backend/app/services/pipeline.py` — check vendor memory after AI parse
- MODIFY: `backend/app/routers/expenses.py` — upsert vendor memory on confirm/update

### 1.8 Document Type Detection + Alcohol Detection

**Upgrade to existing AI parser prompt.** Claude Haiku returns additional fields:

```json
{
  "document_type": "receipt | invoice | subscription | payment_confirmation",
  "alcohol_items": [{"description": "Draft Beer", "amount": 8.50}],
  "alcohol_total": 24.00
}
```

**Document type behavior:**
- Receipt → normal flow
- Invoice → shows due date, "Mark as paid" button
- Subscription → tracks monthly, flags price changes
- Payment confirmation → tries to match to existing invoice

**Alcohol behavior:**
- Employee mode → warning: "Includes alcohol ($24). Split to personal?" with one-tap split
- Business owner → info: "Full amount is 50% deductible under CRA/IRS rules"
- Personal → no prompt

**Files:**
- MODIFY: `backend/app/services/ai_parser.py` — add document_type + alcohol to prompt
- MODIFY: `frontend/src/pages/ExpensePage.tsx` — document type badge + alcohol prompt
- MODIFY: `frontend/src/types.ts` — add fields
- NEW: `supabase/migrations/015_document_type.sql`

### 1.9 PayPal Integration

Same pattern as email scanning. OAuth → read-only transaction history → results UI → user picks which to import.

**Files:**
- NEW: `backend/app/routers/paypal.py`
- NEW: `backend/app/services/paypal_scanner.py`
- NEW: `supabase/migrations/016_payment_tokens.sql`
- MODIFY: `frontend/src/pages/SettingsPage.tsx` — Connected Accounts section
- MODIFY: `frontend/src/lib/api.ts` — PayPal functions
- MODIFY: `backend/app/main.py` — register router

### 1.10 Biometric Lock

Web Authentication API (`navigator.credentials`). Face ID / fingerprint. PIN fallback. Toggle in Settings, off by default. Configurable timeout (immediately, 1 min, 5 min).

**Files:**
- NEW: `frontend/src/components/BiometricLock.tsx`
- MODIFY: `frontend/src/pages/SettingsPage.tsx` — biometric toggle

### 1.11 Bulk Confirm / Bulk Edit

Long-press expense → selection mode → checkboxes appear → "Select all drafts" button → bottom bar: "Confirm 12 expenses" → one tap. Also supports bulk re-tag, bulk re-categorize, bulk delete.

**Smart select:** Select all from vendor, select all in date range, select all uncategorized. Preview changes before applying.

**Files:**
- NEW: `frontend/src/components/BulkActions.tsx`
- MODIFY: `frontend/src/pages/DashboardPage.tsx` — bulk selection mode
- MODIFY: `backend/app/routers/expenses.py` — add `PATCH /api/expenses/bulk`

### 1.12 UX Polish Package

**Dark mode:** OLED true black, auto-switch with system, semantic color tokens. Receipt images stay white.

**Skeleton loading:** Replace ALL spinners with content-shaped shimmer placeholders.

**Swipe actions:** Right-swipe = confirm, left-swipe = delete. Haptic at threshold. Partial swipe reveals action buttons.

**Bottom sheets:** Category picker, date picker, filters, quick actions. Draggable. Stacked max 2 deep.

**Haptic feedback:** Light tap on scan capture, medium on confirm, buzz on error, tick on tag select, thunk on swipe action.

**Undo:** Gmail-style 10-second toast after any destructive action. Audit trail for reverting past undo window.

**Files:**
- MODIFY: Multiple frontend components for dark mode, skeletons, swipe, bottom sheets, haptics

### 1.13 Onboarding Redesign

**Value-first:** Let users scan one receipt BEFORE creating an account. Show the magic first.

**3 steps max initially:** Sign up → country → done. Ask work hours, expense types, connected accounts later contextually.

**Every step skippable.**

**Celebration:** Confetti animation on first successful receipt scan.

### 1.14 Proactive Notifications

- "You have 3 unsubmitted receipts from your Toronto trip"
- "Weekly: 12 captured, 3 need review, 2 missing receipts"
- Smart timing — never at midnight

### 1.15 Offline Improvements

Full offline-first scanning. Queue all receipts. Sync indicator: "5 receipts waiting to sync." Multi-device sync status: "Last synced: 2 min ago." Conflict-free sync (last-write-wins with conflict UI).

### 1.16 Permission Flow

Ask contextually, never upfront:
- Camera → when they tap Scan
- GPS → when first receipt processes
- Photo library → when they tap Scan Album
- Google/Microsoft → when they tap Connect

### 1.17 Notification Preferences

Settings → Notifications. Toggle push/SMS/email per notification type. Users control everything.

### 1.18 Compliance (Built-In, $0)

- Privacy policy (comprehensive, written into app)
- Terms of Service (18+ age gate, tax disclaimers, liability)
- MFA via Supabase Auth
- Encryption at rest (Supabase) + in transit (HTTPS)
- Cookie consent banner
- Data export button ("Download all my data" → ZIP)
- Delete account button (permanent, purges all data)
- Tax disclaimer on every estimate screen

---

## Wave 2: My Taxes Are Handled

**20 features. Goal: Turn scanned receipts into tax-ready intelligence.**
**Overall score: 95/100**

### 2.1 Tax Engine (Backend Foundation)

Core calculation engine. Invisible to users, powers everything.

**CRA T2125 line mapping:**

| Category | T2125 Line | Deduction % |
|----------|-----------|-------------|
| Advertising | 8521 | 100% |
| Meals & Entertainment | 8523 | 50% |
| Insurance | 8690 | 100% |
| Interest & bank charges | 8710 | 100% |
| Office expenses | 8810 | 100% |
| Professional fees | 8860 | 100% |
| Rent | 8910 | 100% |
| Repairs & maintenance | 8960 | 100% |
| Salaries & wages | 9060 | 100% |
| Travel | 9200 | 100% |
| Telephone & utilities | 9220 | 100% |
| Vehicle expenses | 9281 | Business-use % |
| Other expenses | 9270 | 100% |

**IRS Schedule C mapping:**

| Category | Schedule C Line | Deduction % |
|----------|----------------|-------------|
| Advertising | 8 | 100% |
| Car & truck | 9 | Business-use % |
| Contract labor | 11 | 100% |
| Insurance | 15 | 100% |
| Interest (mortgage) | 16a | 100% |
| Interest (other) | 16b | 100% |
| Legal & professional | 17 | 100% |
| Office supplies | 18 | 100% |
| Rent (vehicles/equipment) | 20a | 100% |
| Rent (other property) | 20b | 100% |
| Repairs | 21 | 100% |
| Supplies | 22 | 100% |
| Travel | 24a | 100% |
| Meals | 24b | 50% |
| Utilities | 25 | 100% |
| Other | 27b | 100% |

**Country-specific rules:**
- CRA: Meals 50%, Entertainment 50%, Long-haul truckers 80%
- IRS: Meals 50%, Entertainment 0% (post-TCJA 2017), Employer meals 0% (2026+)
- CRA mileage: $0.70/km first 5,000 then $0.64/km (2025 — verify 2026 rate)
- IRS mileage: $0.725/mile (2026)
- CRA home office: Detailed method only (flat rate discontinued after 2022, T2200 required)
- IRS home office: Simplified $5/sq ft max $1,500 OR actual method
- CRA retention: 6 years
- IRS retention: 7 years (safe default)

**Provincial/state tax rates in database table with effective dates:**

```sql
CREATE TABLE tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  tax_type TEXT NOT NULL,
  rate NUMERIC(6,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Canadian rates (verified to 2025):**

| Province | Tax | Rate |
|----------|-----|------|
| AB | GST | 5% |
| BC | GST+PST | 5%+7% |
| MB | GST+RST | 5%+8% |
| NB | HST | 15% |
| NL | HST | 15% |
| NS | HST | 14% (changed April 2025) |
| ON | HST | 13% |
| PE | HST | 15% |
| QC | GST+QST | 5%+9.975% |
| SK | GST+PST | 5%+6% |
| NT, NU, YT | GST | 5% |

US state rates: 50 states stored in table. No-tax states: AK (local only), DE, MT, NH, OR.

**IMPORTANT:** All rates are in database, not hardcoded. Updated annually via config, not code deploy. Effective dates handle mid-year changes.

**Files:**
- NEW: `backend/app/modules/tax/engine.py`
- NEW: `backend/app/modules/tax/cra_categories.py`
- NEW: `backend/app/modules/tax/irs_categories.py`
- NEW: `backend/app/modules/tax/rates.py`
- NEW: `supabase/migrations/017_tax_engine.sql`

### 2.2 Tax Dashboard

**5 cards:**
1. **Tax savings** — "$1,247 in ITCs recovered" + completeness progress bar + "12 need review" link + quarter-over-quarter comparison
2. **Jurisdiction breakdown** — province/state rows with amounts + expense counts + mini expense location map (dots on Canada/US map)
3. **Category spend** — interactive horizontal bars + deduction % inline + month-over-month arrows + tappable drill-down (tap category → expenses → tap expense → detail) + period toggle (this Q vs last Q)
4. **Deduction summary** — total → deductions → deductible → ITC + T2125/Schedule C line mapping + "what-if" simulator ("If you buy $5K equipment, deduction increases by $X")
5. **Tax-loss insights (AI)** — "You may have missed $340 in deductions" + specific one-tap reclassify suggestions + home office deduction prompt

**Country-aware labels:** "ITCs recovered" (CA) vs "Deductions tracked" (US).

**Files:**
- NEW: `frontend/src/pages/TaxDashboardPage.tsx`
- NEW: `backend/app/routers/tax.py`
- NEW: `backend/app/modules/tax/insights.py`
- MODIFY: `frontend/src/App.tsx` — add `/tax` route
- MODIFY: `frontend/src/pages/DashboardPage.tsx` — add tax dashboard link

### 2.3 Spending Insights & Trends

Monthly trend chart (toggleable: All/Business/Work/Personal) + anomaly alerts ("Meals up 34%", "New subscription: Figma $18/mo") + top vendors with period comparison + forecast ("At current pace, Q2 travel exceeds budget by 15%") + optional category budgets.

**Files:**
- NEW: `frontend/src/pages/InsightsPage.tsx`
- NEW: `backend/app/routers/insights.py`
- NEW: `backend/app/modules/intel/anomaly_detector.py`
- NEW: `backend/app/modules/intel/forecaster.py`
- NEW: `supabase/migrations/018_budgets.sql`

### 2.4 Split Expenses

**Percentage slider or dollar amount.** "Remember this split for Phone Bill" (vendor memory). Common shortcuts: 50/50, 75/25.

**Alcohol auto-split:** Employee mode → "Includes alcohol ($24). Split to personal?" with proportional tip splitting. Business mode → "50% deductible" info note.

**Live tax impact:** As slider moves, shows "Dragging to 80% business = $X more deductible."

**Database:** `split_from_id` + `split_percentage` on expenses. Original → children linked.

**Files:**
- NEW: `frontend/src/components/SplitExpense.tsx`
- NEW: `backend/app/routers/splits.py`
- NEW: `supabase/migrations/019_splits.sql`
- MODIFY: `frontend/src/pages/ExpensePage.tsx`
- MODIFY: `backend/app/modules/intel/vendor_memory.py`

### 2.5 Quarterly Tax Estimates

Both CRA (March/June/Sept/Dec 15) and IRS (April/June/Sept 15, Jan 15). Shows federal + provincial/state + CPP/SE tax. Instalment deadlines with reminders.

**What-if simulator:** "If I buy $5,000 equipment this quarter..." → "Your estimated tax drops by $1,350."

**Income input:** Manual entry (or accounting software sync in Wave 3).

**Disclaimer on every screen:** "These are estimates. Consult your accountant."

**Files:**
- NEW: `frontend/src/pages/QuarterlyEstimatePage.tsx`
- NEW: `backend/app/modules/tax/estimator.py`
- MODIFY: `backend/app/routers/tax.py`

### 2.6 Home Office Calculator

Square footage input → auto-calculate business-use %. Method comparison: Canada (detailed only, T2200 required) vs US (simplified $5/sq ft OR actual — shows which saves more). Auto-pulls utility expenses from vendor memory (Rogers Internet, Enbridge Gas, etc.).

**Files:**
- NEW: `frontend/src/pages/HomeOfficePage.tsx`
- NEW: `backend/app/modules/tax/home_office.py`

### 2.7 Mileage & Gas Tracking

GPS auto-tracking (background) + manual entry. Swipe-to-categorize trips (Business/Personal — QBSE style). Counter + map visualization. Smart commute detection (same route every weekday = excluded). Calendar matching (trip to client site matches "Meeting with ASUS" event). Method comparison (standard rate vs actual vehicle expenses).

**CRA rates:** $0.70/km first 5,000, $0.64/km after (2025 — verify 2026).
**IRS rate:** $0.725/mile (2026).

**Files:**
- NEW: `frontend/src/pages/MileagePage.tsx`
- NEW: `frontend/src/components/TripTracker.tsx`
- NEW: `backend/app/modules/tax/mileage.py`
- NEW: `backend/app/routers/mileage.py`
- NEW: `supabase/migrations/020_mileage.sql`

### 2.8 Additional Wave 2 Features

**Tip intelligence:** Apply same deduction % as meal. Proportional split if expense is split. Employee mode: flag if tip exceeds policy threshold.

**Attendee cost splitting:** Auto-pull from calendar. Per-person cost calculation. Policy flag if over threshold.

**Scheduled auto-submit reports:** Weekly/monthly. Only auto-submits when all receipts attached + no violations.

**Per diem calculator:** CRA NJC + IRS GSA rates by city. Auto-detect travel dates from Gmail/calendar. Compare per diem vs actual receipts — shows which is better.

**Full Gmail/Outlook body scanning:** Requires CASA assessment. Deferred until revenue exists. When ready: searches inbox for vendor senders + receipt/invoice subject keywords, extracts body + attachments, runs through AI pipeline, user reviews and selects which to import.

**French language UI:** Quebec legal requirement. i18n framework.

**Rate limiting:** Graceful throttling for Gmail scan, album scan, batch operations.

**Spending alerts:** "You've spent $450 on meals this month — 30% above your average."

---

## Wave 3: Everything Connects

**18 features. Goal: Integrations, automation, and polish.**
**Overall score: 93/100**

### 3.1 Accounting Software Export

QuickBooks Online, Xero, Wave, FreshBooks, Sage. OAuth connect → smart category mapping (auto-match, user reviews once) → auto-sync or manual sync. Syncs: expenses, receipt images, tax amounts, splits, currency conversion. Two-way sync (pull transactions, match to receipts). Zapier as catch-all for unsupported platforms. Sync conflict resolution UI. Batch sync history log.

**Files:**
- NEW: `backend/app/modules/integrations/quickbooks.py`
- NEW: `backend/app/modules/integrations/xero.py`
- NEW: `backend/app/modules/integrations/wave_sync.py`
- NEW: `backend/app/modules/integrations/base.py`
- NEW: `backend/app/routers/integrations.py`
- NEW: `supabase/migrations/022_integrations.sql`

### 3.2 Bank Transaction Matching

Plaid integration. Fuzzy matching: amount (40%), date (25%), merchant name (25%), currency (10%). Auto-match at 90%+ confidence. "Possible match — confirm?" at 60-89%. Three sections: matched, unmatched transactions (need receipts), unmatched receipts (cash payments?). Receipt coverage percentage. IRS $75 rule: under $75 can create expense without receipt.

**Files:**
- NEW: `backend/app/modules/integrations/plaid.py`
- NEW: `backend/app/modules/intel/transaction_matcher.py`
- NEW: `frontend/src/pages/BankMatchingPage.tsx`
- NEW: `backend/app/routers/bank.py`
- NEW: `supabase/migrations/023_bank_transactions.sql`

### 3.3 Recurring Expense Detection

Auto-detect subscriptions from bank feed + email. Dashboard: active subscriptions with amounts, renewal dates, tags. Alerts: price changes ("AWS up $14"), trial conversions ("Figma trial converts in 3 days"), duplicate services ("Canva + Adobe — both design?"), annual renewal countdown with cancel-by date.

**Files:**
- NEW: `backend/app/modules/intel/recurring_detector.py`
- NEW: `frontend/src/pages/SubscriptionsPage.tsx`
- NEW: `backend/app/routers/subscriptions.py`
- NEW: `supabase/migrations/024_subscriptions.sql`

### 3.4 Enterprise Submit (Concur + ChromeRiver + Others)

**Employee profile fields (set once):** employee_id, cost_center, default_gl_code, manager_email.

**Per-expense optional fields:** cost_center_override, project_code, gl_code, pre_approval_number, hotel_check_in/out.

**Platform adapters:**
- SAP Concur: OAuth API, auto-pull company policy, push expenses + receipts
- ChromeRiver: Email-based submission (structured email + receipt attachments)
- Workday: Worktag mapping, conditional fields (attendees for meals, dates for hotel)
- Expensify: Amount in cents, tag-based cost center, category matching
- Coupa: Line-item + allocation format
- NetSuite: Minimal format, multi-currency support
- Custom template: User pastes company format, AI learns layout

**Pre-submit compliance check:** Lists all missing fields with fix links. "Employee ID ✓, Cost Center ✓, Missing: Project code on 2 expenses."

**Files:**
- NEW: `backend/app/modules/integrations/adapters/base.py`
- NEW: `backend/app/modules/integrations/adapters/concur.py`
- NEW: `backend/app/modules/integrations/adapters/chromeriver.py`
- NEW: `backend/app/modules/integrations/adapters/workday.py`
- NEW: `backend/app/modules/integrations/adapters/expensify.py`
- NEW: `backend/app/modules/integrations/adapters/coupa.py`
- NEW: `backend/app/modules/integrations/adapters/netsuite.py`
- NEW: `frontend/src/pages/EnterpriseSubmitPage.tsx`
- NEW: `backend/app/routers/enterprise.py`
- NEW: `supabase/migrations/025_enterprise.sql`
- NEW: `supabase/migrations/029_enterprise_fields.sql`

### 3.5 Accountant Access + Annual Tax Package

Read-only invite via email. Accountant can: view all expenses, see receipt images, access tax dashboard, leave comments, mark as "Reviewed." Cannot: edit, delete, submit.

**Annual tax package (one-click):** Expense summary by T2125/Schedule C line + ITC worksheet + receipt images by category + mileage log + home office worksheet + per diem comparison + subscription summary + split details. PDF bundle or ZIP with images. Flags items needing review before export.

**Files:**
- NEW: `backend/app/routers/accountant.py`
- NEW: `frontend/src/pages/AccountantView.tsx`
- NEW: `backend/app/modules/export/tax_package.py`
- NEW: `supabase/migrations/026_accountant.sql`

### 3.6 Chrome Extension

Detects receipt-like content on web pages (Gmail, Amazon orders, airline confirmations, SaaS billing). Side panel: "Save to SnapExpense" with pre-filled merchant, amount, date, category. Right-click any image → "Send to SnapExpense."

**Files:**
- NEW: `chrome-extension/` directory (manifest, content script, popup, side panel)

### 3.7 Zapier / Make Integration

**Triggers:** expense created, expense confirmed, report submitted, budget exceeded, receipt missing 48h+, subscription price changed.

**Actions:** create expense, categorize, approve, export.

Webhook API for custom integrations.

**Files:**
- NEW: `backend/app/routers/zapier.py`

### 3.8 Natural Language Search (Claude-Powered)

Search bar on dashboard. User types: "uber rides over $30 in january" → Claude parses → SQL query → results. Examples: "biggest expense last month", "all meals with clients in toronto", "unconfirmed receipts from last week."

**Files:**
- NEW: `backend/app/modules/intel/nl_search.py`
- NEW: `backend/app/routers/search.py`
- MODIFY: `frontend/src/pages/DashboardPage.tsx` — add search bar

### 3.9 Additional Wave 3 Features

**Missing receipt alerts:** Tiered: push notification (instant) → SMS (24h) → email digest (72h) → weekly summary.

**PDF statement import:** Upload bank/credit card PDF → Claude extracts transactions → matches to existing expenses → highlights gaps.

**Smart duplicate detection:** Same amount + merchant + date from different sources (camera + Gmail + bank feed) = flagged. "This might be a duplicate. Merge?"

**Warranty tracking + return window alerts:** AI parser detects product purchases → looks up warranty/return period → sets expiry reminders.

**Spend forecasting:** "Based on last 6 months, Q2 estimate: $8,890. If you prepay annual Adobe ($840), deduct full amount this quarter."

**Business card scanning:** Scan card → extract name/title/company/email → add as attendee to expense → save to contacts.

**Expense templates:** "I take the same $5.50 subway every day" → one tap to log without scanning.

**Shared access (spouse/partner):** Invite with full read/write access. Simpler than accountant portal.

**Spanish language UI:** US market expansion.

**SOC 2 certification process:** Start during Wave 3 development. Type I ($15-25K from revenue). Type II ($30-50K from enterprise contracts).

---

## Compliance & Legal

### $0 Launch Compliance Checklist

| Item | Status | Notes |
|------|--------|-------|
| Privacy Policy | Build ourselves | Covers: AI processing, GPS, email metadata, bank data (future), all third parties |
| Terms of Service | Build ourselves | 18+ age gate, liability limitations, tax disclaimers |
| Tax disclaimers | Every estimate screen | "Not tax advice. Consult a professional." |
| PIPEDA compliance | Built into app | Consent flows, data handling, breach notification plan |
| GLBA basics | Supabase + HTTPS + MFA | Encryption at rest/transit, MFA, designated security officer |
| CAN-SPAM / CASL | Unsubscribe links + address | On all marketing emails |
| Cookie consent | Free library | Banner + preferences |
| Data export | Build it | "Download all my data" → ZIP |
| Account deletion | Build it | Permanent purge, all data |
| Age gate | Checkbox on signup | Eliminates COPPA |
| Google API | Metadata scope only | No CASA needed, $0 |
| Microsoft API | Publisher verification | Free |

### Paid Compliance (From Revenue)

| Item | When | Cost |
|------|------|------|
| E&O + Cyber insurance | When revenue exists | $2-5K/yr |
| Google CASA (full Gmail) | Wave 2 launch | $500-25K |
| SOC 2 Type I | Before enterprise sales | $15-25K |
| SOC 2 Type II | For Fortune 500 | $30-50K |
| Concur App Center listing | Wave 3 | $0-5K |

### Not Required

- Money transmitter license (read-only integrations)
- CPA license (software estimation ≠ practice before IRS)
- IRS Circular 230 (does not apply to software)
- FINTRAC registration (not a money services business)
- OSFI regulation (not a financial institution)
- COPPA (18+ age gate)

---

## Timeline

```
Month 1-4: WAVE 1 BUILD + LAUNCH
├── Build all Wave 1 features (32 features)
├── Privacy policy + Terms of Service
├── Compliance built into app ($0)
├── Google metadata verification (free)
├── Microsoft Publisher verification (free)
└── LAUNCH — $0 cost

Month 5-8: WAVE 2 BUILD
├── Tax engine + dashboard
├── Spending insights + trends
├── Split expenses + alcohol detection
├── Quarterly estimates + home office + mileage
├── French language UI (Quebec)
├── Full Gmail/Outlook scanning (if revenue covers CASA)
└── WAVE 2 LAUNCH

Month 9-12: WAVE 3 BUILD
├── Accounting software integrations
├── Bank transaction matching
├── Enterprise submit (Concur, ChromeRiver, etc.)
├── Chrome extension + Zapier
├── Natural language search
├── Get insurance ($2-5K from revenue)
└── WAVE 3 LAUNCH

Month 12+: ENTERPRISE
├── SOC 2 Type I (from enterprise contract revenue)
├── Concur App Center certification
├── SOC 2 Type II observation period
└── ENTERPRISE TIER LAUNCH
```

---

## Feature Rankings (All 70 Features)

| Rank | Score | Feature | Wave |
|------|-------|---------|------|
| 1 | 97 | Gmail receipt/invoice scanning (full) | 2 |
| 2 | 97 | Tax savings number (quarter-over-quarter) | 2 |
| 3 | 96 | Auto-scan camera (edge detect + text verify + haptic) | 1 |
| 4 | 95 | Back-to-back scanning mode | 1 |
| 5 | 95 | GPS capture → province/state → tax rate | 1 |
| 6 | 95 | Blur detection + retake prompt | 1 |
| 7 | 95 | Alcohol detection + smart auto-split | 1 |
| 8 | 95 | Tax jurisdiction breakdown (GPS-powered) | 2 |
| 9 | 95 | Compliance ($0 launch package) | 1 |
| 10 | 94 | Split expenses (slider + auto-split + tax impact) | 2 |
| 11 | 93 | Tax deduction summary (T2125 + Schedule C lines) | 2 |
| 12 | 93 | Tax-loss insights (AI reclassify suggestions) | 2 |
| 13 | 92 | Business/Work/Personal tags (3-way + smart suggestions) | 1 |
| 14 | 92 | Album scanning with AI receipt detection | 1 |
| 15 | 92 | Category spend charts (drill-down + period toggle) | 2 |
| 16 | 91 | Country selection (CA/US) with adaptive tax rules | 1 |
| 17 | 91 | Quarterly tax estimates (CRA + IRS + what-if) | 2 |
| 18 | 90 | Work hours prediction | 1 |
| 19 | 90 | Dark mode (OLED black + auto-switch) | 1 |
| 20 | 90 | Skeleton loading (replace all spinners) | 1 |
| 21 | 90 | Haptic feedback (scan, confirm, swipe, error) | 1 |
| 22 | 90 | Undo after destructive actions (10-second toast) | 1 |
| 23 | 90 | Album GPS extraction (EXIF metadata) | 1 |
| 24 | 89 | Province-aware tax rates (database with effective dates) | 2 |
| 25 | 88 | Image enhancement (crop, perspective, contrast, thermal, shadow) | 1 |
| 26 | 88 | Vendor memory (learn category + tax + tag + split ratio) | 1 |
| 27 | 88 | Offline scanning (full offline-first + sync indicator) | 1 |
| 28 | 88 | Enterprise submit (Concur API + 6 platform adapters) | 3 |
| 29 | 88 | Reimbursement format templates (pre-built + custom) | 3 |
| 30 | 86 | Natural language search (Claude-powered) | 3 |
| 31 | 85 | CRA-aligned categories (T2125 line mapping) | 2 |
| 32 | 85 | IRS-aligned categories (Schedule C mapping) | 2 |
| 33 | 85 | Home office calculator (method comparison + auto-pull) | 2 |
| 34 | 85 | Onboarding redesign (value-first, 3 steps, celebration) | 1 |
| 35 | 85 | Swipe actions + bottom sheets | 1 |
| 36 | 85 | Document type detection (receipt/invoice/subscription/payment) | 1 |
| 37 | 85 | Bulk confirm / bulk edit (smart select) | 1 |
| 38 | 85 | Payment platform sync (PayPal first, Stripe second) | 1/3 |
| 39 | 85 | French language UI (Quebec) | 2 |
| 40 | 84 | Spending insights & trends (anomaly alerts + vendor rankings) | 2 |
| 41 | 84 | Accounting software export (5 platforms + smart mapping) | 3 |
| 42 | 83 | Bank transaction matching (Plaid + fuzzy matching) | 3 |
| 43 | 83 | Proactive notifications (trip-based + weekly digest) | 1 |
| 44 | 83 | Rate limiting + graceful throttling | 2 |
| 45 | 82 | ITC summary report (CRA-ready quarterly) | 2 |
| 46 | 82 | Biometric lock (Face ID / fingerprint + timeout) | 1 |
| 47 | 82 | Notification preferences (toggle per type) | 1 |
| 48 | 81 | Recurring expense detection (subscription dashboard) | 3 |
| 49 | 81 | Missing receipt alerts (tiered escalation) | 3 |
| 50 | 80 | Mileage & gas tracking (GPS + swipe + method comparison) | 2 |
| 51 | 80 | Chrome extension (auto-detect + right-click capture) | 3 |
| 52 | 80 | Accountant/bookkeeper access (read-only + comments) | 3 |
| 53 | 80 | Scan streak / gamification (streaks + badges + health score) | 3 |
| 54 | 80 | Warranty tracking (auto-detect + expiry alerts) | 3 |
| 55 | 79 | Annual tax package (one-click bundle for accountant) | 3 |
| 56 | 78 | Home office expense auto-pull (utilities from vendor memory) | 2 |
| 57 | 78 | Per diem calculator (CRA NJC + IRS GSA rates) | 2 |
| 58 | 77 | Expense policy alerts ("over $75 meal limit") | 2 |
| 59 | 77 | Zapier / Make integration (triggers + actions) | 3 |
| 60 | 76 | Spend forecasting ("Q2 travel will exceed by 15%") | 3 |
| 61 | 75 | Tip intelligence (deductibility + policy + proportional split) | 2 |
| 62 | 75 | Attendee cost splitting ($200 ÷ 4 = $50/person) | 2 |
| 63 | 75 | Biometric lock configurable timeout | 1 |
| 64 | 75 | Spanish language UI | 3 |
| 65 | 75 | Return window alerts (store policy + countdown) | 3 |
| 66 | 74 | Scheduled auto-submit reports (weekly/monthly) | 2 |
| 67 | 74 | Shared access (spouse/partner) | 3 |
| 68 | 73 | Expense templates (recurring manual entry) | 3 |
| 69 | 73 | Investment fee detection (trading/advisory/crypto fees) | 3 |
| 70 | 71 | Business card scanning (scan → contact → attendee) | 3 |

---

## Database Migrations

| # | Migration | Wave |
|---|-----------|------|
| 011 | GPS columns (latitude, longitude on expenses) | 1 |
| 012 | Payment platform tokens | 1 |
| 013 | Expense tags + user work hours + country/region | 1 |
| 014 | Vendor memory table | 1 |
| 015 | Document type + alcohol columns | 1 |
| 016 | Payment platform OAuth tokens | 1 |
| 017 | Tax engine (deductible amount, ITC, tax category line) | 2 |
| 018 | Budgets table | 2 |
| 019 | Split expense columns (split_from_id, split_percentage) | 2 |
| 020 | Mileage/trips table | 2 |
| 021 | Auto-submit preferences | 2 |
| 022 | Integration connections + category mappings | 3 |
| 023 | Bank transactions table | 3 |
| 024 | Recurring/subscriptions table | 3 |
| 025 | Enterprise connection settings | 3 |
| 026 | Accountant access + expense comments | 3 |
| 027 | Warranties table | 3 |
| 028 | Contacts table (business card data) | 3 |
| 029 | Enterprise fields (employee_id, cost_center, GL codes) | 3 |

---

## File Map

### New Files (Wave 1)
```
frontend/src/components/ScannerMode.tsx
frontend/src/components/AlbumScanner.tsx
frontend/src/components/BiometricLock.tsx
frontend/src/components/BulkActions.tsx
frontend/src/lib/imageEnhance.ts
frontend/src/lib/gps.ts
frontend/src/lib/receiptDetector.ts
backend/app/routers/gmail_scan.py
backend/app/routers/outlook_scan.py
backend/app/routers/paypal.py
backend/app/services/gmail_scanner.py
backend/app/services/outlook_scanner.py
backend/app/services/paypal_scanner.py
backend/app/modules/intel/work_hours.py
backend/app/modules/intel/vendor_memory.py
backend/app/modules/tax/rates.py
```

### New Files (Wave 2)
```
frontend/src/pages/TaxDashboardPage.tsx
frontend/src/pages/InsightsPage.tsx
frontend/src/pages/QuarterlyEstimatePage.tsx
frontend/src/pages/HomeOfficePage.tsx
frontend/src/pages/MileagePage.tsx
frontend/src/components/SplitExpense.tsx
frontend/src/components/TripTracker.tsx
frontend/src/components/PerDiemCalculator.tsx
backend/app/routers/tax.py
backend/app/routers/insights.py
backend/app/routers/mileage.py
backend/app/routers/splits.py
backend/app/modules/tax/engine.py
backend/app/modules/tax/cra_categories.py
backend/app/modules/tax/irs_categories.py
backend/app/modules/tax/estimator.py
backend/app/modules/tax/home_office.py
backend/app/modules/tax/mileage.py
backend/app/modules/tax/per_diem.py
backend/app/modules/tax/insights.py
backend/app/modules/intel/anomaly_detector.py
backend/app/modules/intel/forecaster.py
backend/app/services/auto_submit.py
```

### New Files (Wave 3)
```
frontend/src/pages/BankMatchingPage.tsx
frontend/src/pages/SubscriptionsPage.tsx
frontend/src/pages/EnterpriseSubmitPage.tsx
frontend/src/pages/AccountantView.tsx
frontend/src/pages/WarrantyPage.tsx
frontend/src/components/BusinessCardScanner.tsx
chrome-extension/ (manifest, content script, popup, side panel)
backend/app/routers/integrations.py
backend/app/routers/bank.py
backend/app/routers/subscriptions.py
backend/app/routers/enterprise.py
backend/app/routers/accountant.py
backend/app/routers/zapier.py
backend/app/routers/search.py
backend/app/modules/integrations/base.py
backend/app/modules/integrations/quickbooks.py
backend/app/modules/integrations/xero.py
backend/app/modules/integrations/wave_sync.py
backend/app/modules/integrations/plaid.py
backend/app/modules/integrations/adapters/base.py
backend/app/modules/integrations/adapters/concur.py
backend/app/modules/integrations/adapters/chromeriver.py
backend/app/modules/integrations/adapters/workday.py
backend/app/modules/integrations/adapters/expensify.py
backend/app/modules/integrations/adapters/coupa.py
backend/app/modules/integrations/adapters/netsuite.py
backend/app/modules/intel/transaction_matcher.py
backend/app/modules/intel/recurring_detector.py
backend/app/modules/intel/smart_duplicate.py
backend/app/modules/intel/warranty_tracker.py
backend/app/modules/intel/nl_search.py
backend/app/modules/intel/missing_receipt_alerts.py
backend/app/modules/intel/pdf_statement_parser.py
backend/app/modules/export/tax_package.py
```

---

*This spec was designed through collaborative brainstorming with 70 features ranked, compared against 12 competitors (Expensify, Dext, QuickBooks SE, Wave, FreshBooks, Zoho Expense, Ramp, Fyle, Shoeboxed, SAP Concur, Navan, Brex), verified against CRA and IRS tax rules, and validated against PIPEDA, CCPA, GLBA, and other compliance requirements.*

*SnapExpense launches at #3 in the market (Wave 1, 76/100), reaches #1 for individual CA+US users at Wave 2 (88/100), and achieves 93/100 at Wave 3 — with 9 features no competitor offers at any price.*
