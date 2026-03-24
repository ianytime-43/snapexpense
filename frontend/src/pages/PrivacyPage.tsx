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
            <li><strong>Account information:</strong> email address, name, and company name (when provided)</li>
            <li><strong>Receipt images:</strong> photos, PDFs, and screenshots you upload for expense processing</li>
            <li><strong>Financial data:</strong> amounts, merchant names, dates, categories, and other data extracted from receipts</li>
            <li><strong>GPS / location data:</strong> if you grant location permission when uploading a receipt, we capture your coordinates at the time of upload to help identify the merchant and verify the expense location. You can deny this permission and the app will continue to function normally.</li>
            <li><strong>Calendar events:</strong> read-only access to calendar events around expense dates, used only to suggest meeting attendees and business purpose</li>
            <li><strong>Email metadata:</strong> when you use the inbox scan feature, we access the subject lines, sender addresses, and dates of emails matching receipt-related keywords. We do not read email body content through this feature.</li>
            <li><strong>Forwarded emails:</strong> receipt emails you explicitly forward to your personal SnapExpense forwarding address, including their full content and attachments</li>
            <li><strong>Bank connection data:</strong> if you connect a bank account via Plaid, we receive transaction data (amounts, dates, merchant names) to match against your receipts. We do not store your banking credentials.</li>
          </ul>
        </Section>

        <Section title="2. How we use your data">
          <p>Your data is used solely to provide and improve the SnapExpense service:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Receipt images are sent to <strong>Google Cloud Vision</strong> for OCR (optical character recognition) to extract text</li>
            <li>Extracted text and receipt metadata are sent to <strong>Anthropic's Claude API</strong> for intelligent parsing — identifying amounts, merchants, dates, categories, and business purpose</li>
            <li>Calendar events are fetched from Google Calendar or Microsoft Outlook and matched against your expense dates to suggest meeting attendees and business purpose</li>
            <li>GPS coordinates are used to cross-reference against the merchant address extracted from the receipt</li>
            <li>Forwarded email content is parsed using the same OCR and AI pipeline as uploaded receipts</li>
            <li>Vendor history is stored locally per-user to accelerate future categorization of repeat merchants</li>
          </ul>
          <p>
            We do not use your data for advertising, we do not sell your data, and we do not
            share it with third parties except as described in Section 3.
          </p>
        </Section>

        <Section title="3. Third-party services">
          <p>SnapExpense uses the following third-party services to operate:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Supabase</strong> — database, authentication, and file storage. Your data is
              stored in Supabase's managed PostgreSQL and object storage. Supabase is SOC 2 Type II
              certified. Receipt images are encrypted at rest using AES-256 and stored in
              user-isolated storage buckets. Only you can access your own files.
            </li>
            <li>
              <strong>Google Cloud Vision</strong> — OCR processing. Receipt images are sent to
              Google's Vision API for text extraction. Google does not use this data to train
              its models under our enterprise agreement.
            </li>
            <li>
              <strong>Anthropic Claude API</strong> — AI parsing. Extracted text from receipts
              and relevant calendar event titles are sent to Anthropic's Claude API for structured
              data extraction. Anthropic does not use API inputs to train its models.
            </li>
            <li>
              <strong>Plaid</strong> — bank account connection (optional). If you connect a bank
              account, Plaid handles the secure credential flow. We receive only transaction data,
              not your banking credentials. Plaid is subject to its own{' '}
              <a
                href="https://plaid.com/legal/privacy-statement/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong>Google Calendar / Microsoft Outlook</strong> — calendar access (optional,
              read-only). If you connect a calendar, we fetch events in a narrow window around
              each expense date. Calendar data is cached for up to 24 hours and then purged.
              We never store your full calendar history.
            </li>
          </ul>
        </Section>

        <Section title="4. Email scanning disclosure">
          <p>
            The inbox scan feature searches your Gmail or Outlook inbox for emails that appear
            to be receipts or invoices. We do this by filtering on:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Known receipt sender addresses (e.g. receipts@uber.com)</li>
            <li>Subject line keywords (e.g. "receipt", "invoice", "payment confirmation")</li>
          </ul>
          <p>
            We access only the <strong>subject line, sender address, and date</strong> of matching
            emails — we do not read the body of emails discovered this way. If you choose to
            forward an email to your SnapExpense address, the full content of that specific email
            is then processed.
          </p>
          <p>
            Inbox scan results (subject, sender, date) are shown to you in the Settings screen
            and are not stored on our servers. We do not retain any inbox metadata after your
            session ends.
          </p>
        </Section>

        <Section title="5. GPS and location data">
          <p>
            When you upload a receipt via the mobile or web app, you may be prompted to share
            your location. This is <strong>optional</strong>. If granted:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Your GPS coordinates at the moment of upload are stored alongside the expense record</li>
            <li>Coordinates are used to help verify the merchant location and populate the expense address field</li>
            <li>Location data is included in your data export and deleted when you delete your account</li>
            <li>We do not track your location continuously — only at the moment of a receipt upload</li>
          </ul>
          <p>
            You can revoke location permission in your browser or device settings at any time.
            SnapExpense will continue to work without location access.
          </p>
        </Section>

        <Section title="6. Data retention">
          <p>
            Your data is retained for as long as your account is active. Specifically:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Receipt images:</strong> stored until you delete the expense or delete your account</li>
            <li><strong>Expense records:</strong> stored until deleted by you or upon account deletion</li>
            <li><strong>Calendar cache:</strong> purged automatically after 24 hours</li>
            <li><strong>Inbox scan results:</strong> not stored server-side; session-only</li>
            <li><strong>Backup retention:</strong> encrypted backups may retain your data for up to 90 days after account deletion before being overwritten</li>
          </ul>
        </Section>

        <Section title="7. Your rights (PIPEDA and CCPA)">
          <p>
            You have the following rights with respect to your personal data:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Access and portability:</strong> you can export all your data at any time
              as a ZIP file from{' '}
              <Link to="/settings" className="text-green-600 hover:underline">Settings → Your Data</Link>.
              The export includes your profile, all expenses, receipts metadata, attendees, and
              vendor history. OAuth tokens are excluded for security.
            </li>
            <li>
              <strong>Deletion:</strong> you can permanently delete your account and all associated
              data from{' '}
              <Link to="/settings" className="text-green-600 hover:underline">Settings → Your Data</Link>.
              Deletion is irreversible and cascades to all related records.
            </li>
            <li>
              <strong>Correction:</strong> you can edit any expense record directly in the app.
              To correct profile information, contact us at{' '}
              <a href="mailto:privacy@snapexpense.com" className="text-green-600 hover:underline">
                privacy@snapexpense.com
              </a>.
            </li>
            <li>
              <strong>Withdrawal of consent:</strong> you can disconnect calendar access or bank
              connections at any time from Settings. You can deny location permission in your
              browser or device settings.
            </li>
          </ul>
          <p>
            Residents of Canada are entitled to these rights under PIPEDA (Personal Information
            Protection and Electronic Documents Act). Residents of California are entitled to
            these rights under the CCPA (California Consumer Privacy Act). We honour these
            rights for all users regardless of jurisdiction.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            We use <strong>essential cookies only</strong>. These cookies are required for the app
            to function (authentication session, theme preference). We do not use tracking cookies,
            advertising cookies, or any third-party analytics cookies.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We take reasonable technical measures to protect your data, including:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>AES-256 encryption at rest for all stored files</li>
            <li>TLS encryption in transit for all API calls</li>
            <li>Row-level security policies in the database ensuring users can only access their own data</li>
            <li>OAuth tokens stored encrypted; never returned to the client</li>
            <li>Multi-factor authentication available via Supabase Auth</li>
          </ul>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about this policy, data access requests, or deletion requests? Email us at{' '}
            <a href="mailto:privacy@snapexpense.com" className="text-green-600 hover:underline">
              privacy@snapexpense.com
            </a>
            . We will respond within 30 days.
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
