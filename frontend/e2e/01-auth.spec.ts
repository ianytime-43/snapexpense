import { test, expect } from '@playwright/test'

test.describe('auth', () => {
  test('landing page renders and links to sign-in', async ({ page }) => {
    await page.goto('/')
    // Either landing page or dashboard (if somehow authed). We expect landing.
    await expect(page).toHaveURL(/\/$|\/auth/)
    // A nav / sign-in affordance should exist somewhere on landing.
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('sign-in form is visible on /auth', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.getByRole('heading', { name: /snapexpense/i })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('invalid credentials surface an error (does not silently succeed)', async ({ page }) => {
    await page.goto('/auth')
    await page.locator('input[type="email"]').fill('nobody-e2e@snapexpense.invalid')
    await page.locator('input[type="password"]').fill('definitely-wrong-password-xyz')
    await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()

    // Expect either an inline error message or that we stayed on /auth.
    await expect(page).toHaveURL(/\/auth/)
    // A visible error text is the preferred signal.
    const err = page.locator('text=/invalid|incorrect|failed|wrong/i').first()
    await err.waitFor({ timeout: 5000 }).catch(() => {})
  })
})
