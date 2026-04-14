import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="paper min-h-screen text-ink font-sans selection:bg-sienna-500 selection:text-cream-50">
      {/* ───────────────── MASTHEAD ───────────────── */}
      <header className="relative">
        <div className="border-b hairline">
          <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-3 flex items-center justify-between text-[11px] tracking-[0.18em] uppercase">
            <span className="tabular-lining text-ink-soft hidden sm:inline">
              Vol. I · No. 01 · Est. 2026 · Toronto / New York
            </span>
            <span className="text-ink-soft">The Expense Ledger</span>
            <span className="tabular-lining text-ink-soft hidden md:inline">
              $0 to start · Cancel any hour · No receipt left behind
            </span>
          </div>
        </div>

        <nav className="max-w-[1280px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
          <a href="/" className="flex items-baseline gap-1.5 group">
            <span
              className="font-display font-semibold text-3xl tracking-editorial text-ink"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1' }}
            >
              Snap
            </span>
            <span
              className="font-display italic text-3xl tracking-editorial"
              style={{ color: 'var(--forest)', fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0' }}
            >
              Expense
            </span>
            <span className="ml-1 text-sienna-500 text-2xl leading-none">·</span>
          </a>

          <div className="hidden md:flex items-center gap-9 text-sm">
            <a href="#how" className="text-ink-soft hover:text-ink transition-colors">How it works</a>
            <a href="#proof" className="text-ink-soft hover:text-ink transition-colors">Proof</a>
            <a href="#pricing" className="text-ink-soft hover:text-ink transition-colors">Pricing</a>
            <a href="#faq" className="text-ink-soft hover:text-ink transition-colors">Questions</a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/auth"
              className="text-sm px-4 py-2 text-ink hover:text-sienna-600 transition-colors"
            >
              Sign in
            </a>
            <a
              href="/auth"
              className="group relative inline-flex items-center gap-2 text-sm font-medium bg-ink text-cream-50 px-5 py-2.5 rounded-full hover:bg-sienna-500 transition-all"
            >
              Start free
              <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </nav>
      </header>

      {/* ───────────────── HERO ───────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 lg:pt-16 pb-20 lg:pb-28 grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Eyebrow column */}
          <aside className={`lg:col-span-3 space-y-6 ${mounted ? 'animate-rise' : 'opacity-0'}`} style={{ animationDelay: '60ms' }}>
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.22em] uppercase text-sienna-500">
              <span className="inline-block w-5 h-px bg-sienna-500" />
              The receipt issue
            </div>
            <p className="text-sm leading-relaxed text-ink-soft max-w-[24ch]">
              A field report on small, persistent losses — and the quiet way to stop bleeding them.
            </p>
            <div className="pt-4 border-t hairline text-[11px] tracking-[0.18em] uppercase text-ink-soft">
              By the editors
              <br />
              <span className="tabular-lining normal-case tracking-normal text-ink-soft/70">
                For independents in&nbsp;🇨🇦&nbsp;&amp;&nbsp;🇺🇸
              </span>
            </div>
          </aside>

          {/* Headline column */}
          <div className={`lg:col-span-9 ${mounted ? 'animate-rise' : 'opacity-0'}`} style={{ animationDelay: '160ms' }}>
            <h1
              className="font-display font-medium text-ink leading-[0.92] tracking-tightest"
              style={{ fontSize: 'clamp(3rem, 8vw, 7.25rem)', fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 0' }}
            >
              The receipts
              <br />
              <span
                className="italic"
                style={{ color: 'var(--forest)', fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
              >
                already found
              </span>
              <span className="text-sienna-500">.</span>
              <br />
              You just confirm.
            </h1>

            <div className="mt-10 grid md:grid-cols-12 gap-8 md:gap-12 items-start">
              <p className="md:col-span-7 text-lg leading-relaxed text-ink-soft max-w-[56ch] drop-cap">
                SnapExpense pulls receipts from your email, matches them to the right meeting, files them under the right tax category — CRA or IRS — and waits for a one-tap confirm. It is the accountant you never hired, working in the quiet hours so your Sundays stay yours.
              </p>

              <div className="md:col-span-5 space-y-4">
                <a
                  href="/auth"
                  className="group relative flex items-center justify-between w-full bg-ink text-cream-50 px-6 py-5 rounded-xl hover:bg-sienna-500 transition-colors"
                >
                  <div className="text-left">
                    <div className="font-display text-xl tracking-editorial">Begin free trial</div>
                    <div className="text-xs text-cream-300 mt-0.5 tracking-[0.1em] uppercase">
                      25 receipts/mo · no card
                    </div>
                  </div>
                  <span className="font-display text-2xl transition-transform group-hover:translate-x-1">→</span>
                </a>

                <div className="flex items-center gap-4 text-xs tracking-[0.14em] uppercase text-ink-soft">
                  <div className="flex -space-x-2">
                    <div className="w-7 h-7 rounded-full bg-forest-600 border-2 border-cream-50" />
                    <div className="w-7 h-7 rounded-full bg-sienna-500 border-2 border-cream-50" />
                    <div className="w-7 h-7 rounded-full bg-gold-500 border-2 border-cream-50" />
                  </div>
                  <span>Used by professionals at ASUS &amp; more</span>
                </div>
              </div>
            </div>

            {/* Stat ribbon */}
            <div className="mt-16 pt-8 rule-top grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
              {[
                ['14 sec', 'Median time-to-confirm'],
                ['68%', 'Auto-matched to calendar'],
                ['$2,140', 'Avg. deductions recovered / yr'],
                ['2', 'Countries, one ledger'],
              ].map(([stat, label]) => (
                <div key={label}>
                  <div className="font-display text-3xl md:text-4xl tabular-lining text-ink" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>
                    {stat}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.16em] uppercase text-ink-soft">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── TICKER ───────────────── */}
      <section className="border-y hairline bg-cream-100/60 overflow-hidden">
        <div className="flex whitespace-nowrap animate-ticker py-3 text-sm tracking-[0.18em] uppercase text-ink-soft">
          {Array.from({ length: 2 }).flatMap((_, i) =>
            [
              'Uber · $24.10 · Toronto → Pearson',
              'Starbucks · $6.85 · Client prep',
              'Marriott · $312.44 · IRS Cat. 18',
              'Air Canada · $487.00 · QC→ON',
              'Cellphone · 50% business use',
              'Home office · 12% · Detailed method',
              'Stationery · $14.12 · GST/HST $1.84 ITC',
            ].map((t, j) => (
              <span key={`${i}-${j}`} className="flex items-center gap-6 px-8">
                <span className="text-sienna-500">◆</span>
                <span>{t}</span>
              </span>
            ))
          )}
        </div>
      </section>

      {/* ───────────────── HOW IT WORKS — LEDGER STYLE ───────────────── */}
      <section id="how" className="max-w-[1280px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-end justify-between mb-14">
          <div>
            <div className="text-[11px] tracking-[0.22em] uppercase text-sienna-500 mb-3">Section I</div>
            <h2 className="font-display text-5xl lg:text-6xl tracking-tightest text-ink" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40' }}>
              The <span className="italic" style={{ color: 'var(--forest)' }}>quiet</span> ledger.
            </h2>
          </div>
          <p className="hidden lg:block text-sm text-ink-soft max-w-xs">
            Three movements. Each happens in the background while you are doing something that actually matters.
          </p>
        </div>

        <ol className="divide-y hairline border-y hairline">
          {[
            {
              n: '01',
              title: 'Intake',
              body: 'Receipts arrive from email forwarding, Gmail metadata, Outlook, PayPal, bank transactions, and plain old photographs. Your phone becomes a scanner that knows when you have taken a bad picture.',
              detail: 'Gmail · Outlook · Mailgun · Plaid · Album',
            },
            {
              n: '02',
              title: 'Meaning',
              body: 'Claude parses the vendor, the items, the tax lines, the currency. Your calendar supplies the context — who you met, why, where — so the expense is not an orphan in a spreadsheet.',
              detail: 'OCR · Claude Haiku · Google / Outlook Calendar',
            },
            {
              n: '03',
              title: 'Disposition',
              body: 'CRA or IRS, province or state, GST/HST/QST or state sales tax. ITCs where eligible, alcohol split off when it matters, personal flagged when your pharmacy snuck in with your client dinner.',
              detail: 'Dual-jurisdiction tax engine · ITC · Export',
            },
          ].map((step) => (
            <li key={step.n} className="grid grid-cols-12 gap-6 py-10 group hover:bg-cream-100/50 transition-colors px-2 -mx-2 rounded">
              <div className="col-span-2 md:col-span-1 font-mono text-sm text-sienna-500 pt-2 tabular-lining">
                {step.n}
              </div>
              <div className="col-span-10 md:col-span-4">
                <h3 className="font-display text-3xl md:text-4xl text-ink tracking-editorial" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 0' }}>
                  {step.title}
                </h3>
              </div>
              <div className="col-span-12 md:col-span-5 text-ink-soft leading-relaxed">
                {step.body}
              </div>
              <div className="col-span-12 md:col-span-2 text-[11px] tracking-[0.14em] uppercase text-ink-soft/70 md:text-right pt-2">
                {step.detail}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────────────── PULL QUOTE ───────────────── */}
      <section className="bg-forest-700 text-cream-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-grain opacity-30 pointer-events-none" />
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-24 lg:py-32 text-center relative">
          <div className="text-[11px] tracking-[0.22em] uppercase text-gold-500 mb-6">A correspondent writes</div>
          <blockquote
            className="font-display text-4xl md:text-6xl leading-[1.06] tracking-editorial"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50, "WONK" 1' }}
          >
            <span className="text-sienna-500">“</span>
            I used to keep a shoebox. Then a spreadsheet. Then a guilty conscience. This one{' '}
            <span className="italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}>actually</span>{' '}
            does the thing.
            <span className="text-sienna-500">”</span>
          </blockquote>
          <div className="mt-10 text-sm tracking-[0.14em] uppercase text-cream-300">
            — J. Park · Account executive · Toronto
          </div>
        </div>
      </section>

      {/* ───────────────── THE NINE ───────────────── */}
      <section id="proof" className="max-w-[1280px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="mb-14 grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8">
            <div className="text-[11px] tracking-[0.22em] uppercase text-sienna-500 mb-3">Section II</div>
            <h2 className="font-display text-5xl lg:text-7xl tracking-tightest text-ink leading-[0.95]" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40' }}>
              Nine things <span className="italic" style={{ color: 'var(--forest)' }}>no one else</span> does.
            </h2>
          </div>
          <p className="lg:col-span-4 text-sm text-ink-soft">
            We are not adding checkboxes to a feature matrix. These are specific behaviors we built because no other expense app bothered.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 border-l border-t hairline">
          {[
            ['GPS → tax rate', 'A receipt captured in Quebec is taxed at Quebec rates. The phone knows where it was. So should your books.'],
            ['Work-hours intuition', 'A 9 p.m. meal on a weekday near a client is probably business. 11 a.m. Saturday coffee is probably not. You can override either.'],
            ['Alcohol split', 'A business dinner with wine is not fully deductible in either country. We split the line automatically.'],
            ['Calendar attribution', 'The meeting you were in becomes the "why" on the expense. Attendees become the "who".'],
            ['Three-way tagging', 'Business. Employee (reimbursable). Personal. Not just a binary.'],
            ['Blur rejection', 'We refuse to accept a photograph you will hate in two weeks when your accountant asks.'],
            ['Dual-country ledger', 'CRA and IRS in one app. Move provinces. Move states. Move countries. The books keep up.'],
            ['Haptic receipts', 'A small, satisfying confirmation every time the app quietly saves you money.'],
            ['Undo, always', 'Every destructive action is reversible for thirty seconds. Because you are going to mistap. We all do.'],
          ].map(([title, body], i) => (
            <article
              key={title}
              className="group border-r border-b hairline p-7 lg:p-9 hover:bg-cream-100/70 transition-colors relative"
            >
              <div className="flex items-start gap-3 mb-4">
                <span className="font-mono text-xs text-sienna-500 pt-1 tabular-lining">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="font-display text-2xl tracking-editorial text-ink" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 40, "WONK" 0' }}>
                  {title}
                </h3>
              </div>
              <p className="text-sm text-ink-soft leading-relaxed pl-7">{body}</p>
              <div className="absolute top-0 right-0 w-0 h-0.5 bg-sienna-500 group-hover:w-full transition-all duration-500" />
            </article>
          ))}
        </div>
      </section>

      {/* ───────────────── PRICING ───────────────── */}
      <section id="pricing" className="bg-cream-100 border-y hairline">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
          <div className="grid lg:grid-cols-12 gap-10 items-start mb-16">
            <div className="lg:col-span-6">
              <div className="text-[11px] tracking-[0.22em] uppercase text-sienna-500 mb-3">Section III</div>
              <h2 className="font-display text-5xl lg:text-7xl tracking-tightest text-ink leading-[0.95]" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40' }}>
                Priced like a <span className="italic" style={{ color: 'var(--forest)' }}>subscription</span>, not a guilt trip.
              </h2>
            </div>
            <p className="lg:col-span-5 lg:col-start-8 text-ink-soft leading-relaxed">
              Free forever for light use. Pro when you cross the line into "this is my livelihood." Teams when you have a team. Cancel in a single tap, with zero email obstacle course.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-0 border-t hairline">
            {[
              {
                name: 'Free',
                price: '0',
                tag: 'the curious',
                features: ['25 receipts / month', 'Photo + email capture', 'Basic tax categories', 'CSV export'],
                cta: 'Start free',
                accent: false,
              },
              {
                name: 'Pro',
                price: '9',
                tag: 'the independents',
                features: [
                  'Unlimited receipts',
                  'Calendar attribution',
                  'CRA + IRS tax engine',
                  'GPS tax rates',
                  'Bank auto-match (Plaid)',
                  'Quarterly estimates',
                  'PDF / Excel / QuickBooks',
                ],
                cta: 'Begin Pro trial',
                accent: true,
              },
              {
                name: 'Team',
                price: '19',
                tag: 'per head',
                features: ['Everything in Pro', 'Shared groups & splits', 'Admin console', 'Priority support', 'Accountant sharing'],
                cta: 'Contact sales',
                accent: false,
              },
            ].map((p) => (
              <div
                key={p.name}
                className={`
                  border-r border-b hairline p-10 lg:p-12 relative
                  ${p.accent ? 'bg-ink text-cream-50 -mt-6 lg:-mt-10 pt-16 lg:pt-20 pb-14 lg:pb-16 z-10 shadow-xl' : ''}
                `}
              >
                {p.accent && (
                  <div className="absolute top-5 right-5 text-[10px] tracking-[0.22em] uppercase text-gold-500 flex items-center gap-2">
                    <span className="w-4 h-px bg-gold-500" /> Most chosen
                  </div>
                )}
                <div className={`text-[11px] tracking-[0.22em] uppercase mb-6 ${p.accent ? 'text-gold-500' : 'text-sienna-500'}`}>
                  For {p.tag}
                </div>
                <div className="flex items-baseline gap-2 mb-8">
                  <span
                    className={`font-display tabular-lining ${p.accent ? 'text-cream-50' : 'text-ink'}`}
                    style={{ fontSize: 'clamp(3.5rem, 6vw, 5.25rem)', fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', lineHeight: 1 }}
                  >
                    <span className="text-lg align-top mr-1">$</span>{p.price}
                  </span>
                  <span className={`text-sm ${p.accent ? 'text-cream-300' : 'text-ink-soft'}`}>/ mo</span>
                </div>
                <h3 className="font-display text-3xl mb-6 tracking-editorial">{p.name}</h3>
                <ul className={`space-y-2.5 text-sm mb-10 ${p.accent ? 'text-cream-100' : 'text-ink-soft'}`}>
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className={p.accent ? 'text-gold-500' : 'text-sienna-500'}>—</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/auth"
                  className={`
                    inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors
                    ${p.accent
                      ? 'bg-cream-50 text-ink hover:bg-gold-500 hover:text-ink'
                      : 'border hairline text-ink hover:bg-ink hover:text-cream-50 hover:border-ink'}
                  `}
                >
                  {p.cta} <span>→</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── FAQ ───────────────── */}
      <section id="faq" className="max-w-[900px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="text-center mb-14">
          <div className="text-[11px] tracking-[0.22em] uppercase text-sienna-500 mb-3">Section IV</div>
          <h2 className="font-display text-5xl lg:text-6xl tracking-tightest text-ink" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40' }}>
            Fair <span className="italic" style={{ color: 'var(--forest)' }}>questions</span>.
          </h2>
        </div>

        <div className="divide-y hairline border-y hairline">
          {[
            {
              q: 'Is my financial data actually safe?',
              a: 'Receipts live in Supabase (Postgres, Canadian region available). OAuth tokens are encrypted at rest. Plaid access tokens use Fernet encryption. Webhooks are signature-verified (Mailgun HMAC, Plaid JWT). We do not sell data. We do not have ads to sell.',
            },
            {
              q: 'CRA or IRS — does it really handle both?',
              a: 'Yes. GST, HST, QST, PST, and provincial rules on the Canadian side. Federal + state sales tax, self-employment tax, and Schedule C categories on the US side. If you move from one to the other mid-year, the app keeps both ledgers.',
            },
            {
              q: 'Can I import from Gmail?',
              a: 'At launch, metadata-only (sender, subject, date) — you forward receipts via a dedicated Mailgun inbox. Full Gmail body import returns after CASA compliance certification, a deliberate pause for your security, not ours.',
            },
            {
              q: 'What about QuickBooks, Xero, Concur?',
              a: 'Exports available. Live bidirectional sync is in Wave 3 and shipping this year.',
            },
            {
              q: 'Does it work offline?',
              a: 'Capture yes, sync later. It is a PWA — install to home screen.',
            },
            {
              q: 'Android or iOS?',
              a: 'Both, because it is a PWA. Native wrappers are on the roadmap.',
            },
            {
              q: 'Cancel anytime?',
              a: 'Yes. One tap in settings. Data export is free.',
            },
            {
              q: 'Why should I trust a solo-built app?',
              a: 'Because every line of it is legible, tested (148+ tests), and shipped by someone who actually has to use it. No VC wants us to grow at your expense.',
            },
          ].map((item, i) => (
            <details key={item.q} className="group py-6 cursor-pointer">
              <summary className="flex items-start justify-between gap-6 list-none">
                <div className="flex items-start gap-5">
                  <span className="font-mono text-xs text-sienna-500 pt-1 tabular-lining">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-xl md:text-2xl text-ink tracking-editorial" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 40' }}>
                    {item.q}
                  </h3>
                </div>
                <span className="font-display text-2xl text-ink-soft group-open:rotate-45 transition-transform pt-1">
                  +
                </span>
              </summary>
              <p className="mt-4 pl-11 text-ink-soft leading-relaxed max-w-[60ch]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ───────────────── CLOSING CTA ───────────────── */}
      <section className="relative overflow-hidden bg-ink text-cream-50">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(184, 71, 43, 0.25), transparent 50%), radial-gradient(circle at 80% 70%, rgba(184, 146, 60, 0.15), transparent 50%)',
        }} />
        <div className="relative max-w-[1280px] mx-auto px-6 lg:px-10 py-28 lg:py-36">
          <div className="grid lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-8">
              <div className="text-[11px] tracking-[0.22em] uppercase text-gold-500 mb-6">Coda</div>
              <h2
                className="font-display leading-[0.9] tracking-tightest"
                style={{ fontSize: 'clamp(3rem, 9vw, 8rem)', fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 0' }}
              >
                Reclaim the hours
                <br />
                <span
                  className="italic text-sienna-500"
                  style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 1' }}
                >
                  you spend on this.
                </span>
              </h2>
            </div>
            <div className="lg:col-span-4 space-y-5">
              <a
                href="/auth"
                className="group flex items-center justify-between w-full bg-cream-50 text-ink px-7 py-6 rounded-xl hover:bg-gold-500 transition-colors"
              >
                <div>
                  <div className="font-display text-2xl tracking-editorial">Start free — now</div>
                  <div className="text-xs text-ink-soft tracking-[0.14em] uppercase mt-1">
                    Ten seconds · No card
                  </div>
                </div>
                <span className="font-display text-3xl transition-transform group-hover:translate-x-1">→</span>
              </a>
              <p className="text-sm text-cream-300 leading-relaxed">
                Or keep doing it the old way. You do have a spreadsheet that works, probably. Mostly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── COLOPHON / FOOTER ───────────────── */}
      <footer className="bg-cream-50 border-t hairline">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-14 lg:py-16">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-5">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-display font-semibold text-4xl tracking-editorial text-ink"
                  style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1' }}
                >
                  Snap
                </span>
                <span
                  className="font-display italic text-4xl tracking-editorial"
                  style={{ color: 'var(--forest)', fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
                >
                  Expense
                </span>
              </div>
              <p className="mt-5 text-sm text-ink-soft leading-relaxed max-w-sm">
                The expense ledger for people who do the actual work. Built on bootstrapped resolve. Still no VC. Probably ever.
              </p>
              <p className="mt-6 text-[11px] tracking-[0.18em] uppercase text-ink-soft/60">
                Printed daily in Toronto &amp; New York
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] tracking-[0.22em] uppercase text-ink-soft mb-4">Product</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#how" className="hover:text-sienna-500 transition-colors">How it works</a></li>
                <li><a href="#pricing" className="hover:text-sienna-500 transition-colors">Pricing</a></li>
                <li><a href="/status" className="hover:text-sienna-500 transition-colors">System status</a></li>
                <li><a href="/auth" className="hover:text-sienna-500 transition-colors">Sign in</a></li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] tracking-[0.22em] uppercase text-ink-soft mb-4">Legal</div>
              <ul className="space-y-2 text-sm">
                <li><a href="/privacy" className="hover:text-sienna-500 transition-colors">Privacy</a></li>
                <li><a href="/terms" className="hover:text-sienna-500 transition-colors">Terms</a></li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <div className="text-[11px] tracking-[0.22em] uppercase text-ink-soft mb-4">Colophon</div>
              <p className="text-xs text-ink-soft leading-relaxed">
                Set in <em>Fraunces</em>, <em>Instrument Sans</em>, and <em>JetBrains Mono</em>. Colors mixed on cream paper. Every pixel bootstrapped.
              </p>
            </div>
          </div>

          <div className="mt-14 pt-6 rule-top flex flex-wrap items-center justify-between gap-4 text-xs text-ink-soft">
            <span className="tabular-lining">© 2026 SnapExpense — Vol. I · No. 01</span>
            <span>🇨🇦 Toronto · 🇺🇸 New York</span>
            <span>v2.0 — The Quiet Ledger edition</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
