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

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: March 2026</p>

        <Section title="1. Service description">
          <p>
            SnapExpense is an expense capture and organization tool. It helps you extract
            data from receipts using OCR and AI, match expenses to calendar events, and
            copy data into your expense management system.
          </p>
          <p>
            <strong>SnapExpense is NOT accounting software, tax preparation software,
            or a financial advisor.</strong> It is a productivity tool to help you capture
            and organize expense information.
          </p>
        </Section>

        <Section title="2. Accuracy disclaimer">
          <p>
            OCR and AI technologies can make errors. Receipt data extracted by SnapExpense
            — including amounts, dates, merchant names, and categories — <strong>may contain
            mistakes</strong>. You are responsible for reviewing and verifying all expense
            data before submitting it to your employer, tax authority, or any other party.
          </p>
          <p>
            SnapExpense makes no warranty that extracted data is accurate, complete, or
            suitable for any particular purpose.
          </p>
        </Section>

        <Section title="3. Data ownership">
          <p>
            You own your data. The expense records, receipt images, and any other information
            you provide remain yours. We do not sell or license your data to third parties.
            See our <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link> for details.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to use SnapExpense to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Submit fraudulent, falsified, or inflated expense claims</li>
            <li>Process receipts for expenses that were not legitimately incurred</li>
            <li>Circumvent or undermine your employer's expense policies</li>
            <li>Violate any applicable law or regulation</li>
          </ul>
          <p>
            Misuse of the service may result in termination of your account.
          </p>
        </Section>

        <Section title="5. Liability limitation">
          <p>
            SnapExpense and its operators are not liable for:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Expense claims rejected by your employer due to errors in extracted data</li>
            <li>Missed tax deductions resulting from incorrect categorization</li>
            <li>Any financial loss arising from reliance on SnapExpense data</li>
            <li>Service interruptions or data loss</li>
          </ul>
          <p>
            Your use of SnapExpense is at your own risk. We provide the service "as is"
            without warranty of any kind.
          </p>
        </Section>

        <Section title="6. Changes to terms">
          <p>
            We may update these terms from time to time. If we make material changes,
            we will notify you by email or through the app. Continued use of SnapExpense
            after changes constitutes acceptance of the updated terms.
          </p>
        </Section>
      </main>

      <footer className="border-t border-gray-100 py-8 mt-8">
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-center gap-4 text-sm text-gray-400">
          <Link to="/" className="hover:text-gray-600">Home</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
          <span>·</span>
          <span>&copy; 2026 SnapExpense</span>
        </div>
      </footer>
    </div>
  )
}
