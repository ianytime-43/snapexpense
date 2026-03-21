export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">
            <span className="text-green-600">Snap</span>Expense
          </span>
          <a
            href="/auth"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Sign in
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-24 text-center">
        <div className="inline-block bg-green-50 text-green-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
          Built for consultants &amp; sales reps
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Stop losing money on<br />forgotten receipts.
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          SnapExpense captures receipts and fills in the business context from your calendar.
          You just confirm and submit.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/auth"
            className="bg-green-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-green-700 transition-colors shadow-sm"
          >
            Get Started Free
          </a>
          <span className="text-sm text-gray-400">No credit card required</span>
        </div>
      </section>

      {/* Pain points */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">
            Sound familiar?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                emoji: '😩',
                title: "Can't remember who was at that dinner",
                desc: 'Three weeks ago, the client dinner — you remember the restaurant, but not the client name. Now your expense report is stuck.',
              },
              {
                emoji: '🧾',
                title: 'Ziplock bag of receipts',
                desc: 'Every quarter it\'s the same: hunt through your bag, decipher faded thermal paper, type everything in manually.',
              },
              {
                emoji: '⏱️',
                title: 'Retyping into ChromeRiver takes hours',
                desc: 'Copy merchant name. Copy date. Copy amount. Repeat 40 times. There has to be a better way.',
              },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="text-3xl mb-3">{emoji}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 max-w-4xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '1',
              title: 'Snap or forward receipts',
              desc: 'Take a photo, upload a PDF, or forward an email receipt. We extract all the details with OCR + AI.',
            },
            {
              step: '2',
              title: 'We match to your calendar',
              desc: 'SnapExpense looks up your calendar events around the receipt date and auto-fills client, purpose, and attendees.',
            },
            {
              step: '3',
              title: 'Copy into your expense system',
              desc: 'One click copies each field. Works with ChromeRiver, Concur, Coupa, and any other system.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                {step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-10 opacity-40">
          <div className="h-px flex-1 bg-gray-300 max-w-[100px]" />
          <span className="text-2xl">→</span>
          <div className="h-px flex-1 bg-gray-300 max-w-[100px]" />
          <span className="text-2xl">→</span>
          <div className="h-px flex-1 bg-gray-300 max-w-[100px]" />
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Built for people who expense a lot</h2>
          <p className="text-gray-500 mb-8">
            If you're regularly dining with clients, travelling for work, or tracking business purchases,
            SnapExpense saves you hours every month.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Sales reps', 'Consultants', 'Account managers',
              'Business owners', 'Freelancers', 'Field technicians',
              'Recruiters', 'Real estate agents',
            ].map((role) => (
              <span key={role} className="bg-white border border-gray-200 text-gray-700 text-sm px-3 py-1.5 rounded-full">
                {role}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 text-center px-4">
        <p className="text-gray-500 mb-2 text-sm">Your next client dinner receipt is waiting.</p>
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Don't lose it.</h2>
        <a
          href="/auth"
          className="inline-block bg-green-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-green-700 transition-colors shadow-sm"
        >
          Get Started Free
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span>&copy; 2026 SnapExpense</span>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-gray-600 hover:underline">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-gray-600 hover:underline">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
