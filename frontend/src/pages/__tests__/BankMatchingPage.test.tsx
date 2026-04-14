import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import BankMatchingPage from '../BankMatchingPage'

vi.mock('react-plaid-link', () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: false }),
}))

vi.mock('../../lib/api', () => ({
  getBankTransactions: vi.fn().mockResolvedValue([]),
  getBankCoverage: vi.fn().mockResolvedValue(null),
  getPlaidStatus: vi.fn().mockResolvedValue({ configured: false, items: [] }),
  createPlaidLinkToken: vi.fn(),
  exchangePlaidToken: vi.fn(),
  syncBank: vi.fn(),
  removePlaidItem: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchTransactionToExpense: vi.fn(),
  convertTransactionToExpense: vi.fn(),
  dismissTransaction: vi.fn(),
  importBankCsv: vi.fn(),
}))

describe('BankMatchingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page header and Plaid-not-configured warning when not set up', async () => {
    const session = { access_token: 'fake-token' } as never
    render(<BankMatchingPage session={session} />)

    expect(screen.getByText('Bank Matching')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText(/Plaid is not configured/)).toBeTruthy()
    })
  })

  it('shows the unmatched empty state by default', async () => {
    const session = { access_token: 'fake-token' } as never
    render(<BankMatchingPage session={session} />)

    await waitFor(() => {
      expect(screen.getByText(/Connect a bank or import a CSV/)).toBeTruthy()
    })
  })
})
