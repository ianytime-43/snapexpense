import React from 'react'
import { Link } from 'react-router-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-600 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-gray-900">
            <span className="text-green-600">Snap</span>Expense
          </Link>
          <Link to="/auth" className="text-sm text-gray-500 hover:text-gray-700">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: March 2026</p>

        <Section title="1. Data we collect">
          <p>We collect the following information to provide the SnapExpense service:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Account information:</strong> email address, name, company name (when provided)</li>
            <li><strong>Calendar events:</strong> read-only access to calendar events around expense dates</li>
            <li><strong>Email forwards:</strong> receipt emails you explicitly forward to your SnapExpense address</li>
            <li><strong>Receipt images:</strong> photos, PDFs, and screenshots you upload</li>
            <li><strong>Expense data:</strong> the structured data extracted from receipts</li>
          </ul>
        </Section>

        <Section title="2. Calendar data">
          <p>
            Calendar access is strictly <strong>read-only</strong>. We only fetch events within
            a window around your expense date to find matching meetings. Calendar data is cached
            for up to 24 hours to reduce API calls, then automatically purged.
            We never store your full calendar history.
          </p>
        </Section>

        <Section title="3. Email forwarding">
          <p>
            We only process emails that you explicitly forward to your personal SnapExpense
            forwarding address. We do not scan your inbox. Each forwarded email is processed
            to extract expense data and then stored only as structured expense records.
          </p>
        </Section>

        <Section title="4. Receipt images">
          <p>
            Receipt images are encrypted at rest using AES-256 and stored in isolated,
            user-specific Supabase Storage buckets. Only you can access your own images.
            We do not share receipt images with any third party except as necessary for
            OCR processing.
          </p>
        </Section>

        <Section title="5. AI processing">
          <p>
            We use <strong>Google Cloud Vision</strong> for OCR (text extraction from images)
            and <strong>Anthropic's Claude API</strong> for intelligent parsing of receipts and
            calendar event matching. Your data is sent to these providers solely to process
            your expenses. Neither provider uses your data to train their AI models.
          </p>
        </Section>

        <Section title="6. Analytics">
          <p>
            We collect anonymized product analytics (page views, feature usage) to improve
            the product. This data contains no personally identifiable information and is
            not linked to your account.
          </p>
        </Section>

        <Section title="7. Data deletion">
          <p>
            You can delete your account at any time. Upon deletion, all your data — including
            expenses, receipt images, and calendar cache — will be permanently purged
            within 30 days. Some data may be retained in encrypted backups for up to 90 days
            before being overwritten.
          </p>
        </Section>

        <Section title="8. Data export">
          <p>
            You own your data. You can export all your expense data at any time via the
            dashboard (PDF, Excel, or CSV). We do not lock in your data.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Questions about this policy? Email us at{' '}
            <a href="mailto:privacy@snapexpense.com" className="text-green-600 hover:underline">
              privacy@snapexpense.com
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="border-t border-gray-100 py-8 mt-8">
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-center gap-4 text-sm text-gray-400">
          <Link to="/" className="hover:text-gray-600">Home</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-gray-600">Terms of Service</Link>
          <span>·</span>
          <span>&copy; 2026 SnapExpense</span>
        </div>
      </footer>
    </div>
  )
}
