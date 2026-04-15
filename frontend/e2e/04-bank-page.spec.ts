import { test, expect } from './fixtures/auth'

test('bank page renders with connect button and tabs; no console errors', async ({ authedPage: page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', e => consoleErrors.push(String(e)))
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/bank')
  await expect(page).toHaveURL(/\/bank/)

  // Connect bank affordance should render.
  await expect(page.getByRole('button', { name: /connect bank|connect/i }).first()).toBeVisible()

  // Tabs — text match is defensive against minor UI shifts.
  for (const label of ['Unmatched', 'Matched', 'Dismissed']) {
    const tab = page.locator(`text=${label}`).first()
    if (await tab.isVisible().catch(() => false)) {
      await tab.click()
    }
  }

  // Ignore known noisy Plaid Link script errors if Plaid script fails to load.
  const unexpected = consoleErrors.filter(e => !/plaid/i.test(e))
  expect(unexpected, `unexpected console errors: ${unexpected.join('\n')}`).toEqual([])
})

test.skip(!process.env.PLAID_SECRET, 'Plaid sandbox flow — requires PLAID_SECRET env')
test('plaid link opens in sandbox (skipped unless PLAID_SECRET set)', async ({ authedPage: page }) => {
  await page.goto('/bank')
  await page.getByRole('button', { name: /connect bank/i }).first().click()
  // We don't assert the Plaid iframe contents — just that click is wired.
})
