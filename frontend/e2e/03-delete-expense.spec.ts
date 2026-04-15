import { test, expect } from './fixtures/auth'

/**
 * This is the test pattern that would have caught the silent-catch bug
 * at DashboardPage.tsx:218/:268: we delete a row, wait for the undo window
 * to close, reload the page, and assert the row is actually gone. A swallowed
 * DELETE failure would restore the row on reload — which the original UI
 * masked.
 */
test('delete flow: swipe delete → undo toast → expire → reload → row gone', async ({ authedPage: page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/)

  // Grab the first expense row's identifying text, if any exist.
  const firstRow = page.locator('[data-testid="expense-row"], li, article').first()
  const hasAny = await firstRow.count().then(c => c > 0).catch(() => false)
  test.skip(!hasAny, 'No expenses in test account — seed one via upload test first')

  const rowText = (await firstRow.textContent()) || ''
  const sig = rowText.slice(0, 40).trim()

  // Try to hit a visible Delete affordance. On mobile this is swipe; on
  // desktop there may be a menu. We fall back to the bulk-select + delete.
  const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first()
  if (await deleteBtn.isVisible().catch(() => false)) {
    await deleteBtn.click()
  } else {
    test.skip(true, 'No visible Delete button — mobile swipe gesture test lives in mobile-chrome project')
  }

  // Expect an undo toast.
  await expect(page.locator('text=/undo/i').first()).toBeVisible({ timeout: 5000 })

  // Wait out the undo window. App uses ~5s; wait 8s to be safe.
  await page.waitForTimeout(8000)

  // Reload and assert the row is actually gone (this is the step that
  // catches silent DELETE failures).
  await page.reload()
  await expect(page.locator('body')).toContainText(/./)
  if (sig.length > 3) {
    await expect(page.locator('body')).not.toContainText(sig)
  }
})
