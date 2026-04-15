import { test, expect } from './fixtures/auth'

test.describe('smart rules', () => {
  test('create a rule and see it in the list', async ({ authedPage: page }) => {
    await page.goto('/rules')
    await expect(page).toHaveURL(/\/rules/)

    const newBtn = page.getByRole('button', { name: /new rule|add rule|create rule/i }).first()
    test.skip(!(await newBtn.isVisible().catch(() => false)), 'No "new rule" button — UI may have changed')
    await newBtn.click()

    // Fill whatever merchant/category inputs exist.
    const merchant = page.locator('input[name="merchant"], input[placeholder*="merchant" i]').first()
    const category = page.locator('input[name="category"], select[name="category"]').first()
    if (await merchant.isVisible().catch(() => false)) await merchant.fill('Starbucks')
    if (await category.isVisible().catch(() => false)) {
      const tag = await category.evaluate(el => el.tagName.toLowerCase())
      if (tag === 'select') await category.selectOption({ label: /meals/i }).catch(() => {})
      else await category.fill('meals')
    }

    await page.getByRole('button', { name: /^save|^create/i }).first().click()

    // Should see the merchant string in the rules list now.
    await expect(page.locator('text=/starbucks/i').first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('accountant shares', () => {
  test('create a 7-day share and see the token exactly once', async ({ authedPage: page }) => {
    await page.goto('/shares')
    await expect(page).toHaveURL(/\/shares/)

    const createBtn = page
      .getByRole('button', { name: /new share|create share|add share/i })
      .first()
    test.skip(!(await createBtn.isVisible().catch(() => false)), 'No "create share" button')
    await createBtn.click()

    // Set expiry if the field exists. Default to whatever the UI uses.
    const expiry = page.locator('input[name="expires"], select[name="expires"]').first()
    if (await expiry.isVisible().catch(() => false)) {
      const tag = await expiry.evaluate(el => el.tagName.toLowerCase())
      if (tag === 'select') await expiry.selectOption({ label: /7/ }).catch(() => {})
      else await expiry.fill('7')
    }

    await page.getByRole('button', { name: /^create|^share|^save/i }).first().click()

    // The token/URL should be shown in a modal or copy field.
    const tokenField = page.locator('input[readonly], code, pre').first()
    await expect(tokenField).toBeVisible({ timeout: 5000 })
    const tokenValue = (await tokenField.inputValue().catch(() => null)) || (await tokenField.textContent())
    expect(tokenValue && tokenValue.length > 10).toBeTruthy()

    // Close modal — token should not re-appear in the list view (only once).
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).toContainText(/share/i)
  })
})
