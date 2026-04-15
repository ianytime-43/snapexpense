import { test as base, expect, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

type AuthFixtures = {
  authedPage: Page
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var ${name} — set it in frontend/.env.e2e`)
  return v
}

/**
 * Signs in to Supabase with the E2E test user, then injects the resulting
 * session into localStorage so Vite-loaded Supabase picks it up on first render.
 *
 * Requires in .env.e2e: E2E_TEST_EMAIL, E2E_TEST_PASSWORD, VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY.
 */
export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page, baseURL }, use) => {
    const url = requireEnv('VITE_SUPABASE_URL')
    const anon = requireEnv('VITE_SUPABASE_ANON_KEY')
    const email = requireEnv('E2E_TEST_EMAIL')
    const password = requireEnv('E2E_TEST_PASSWORD')

    const supa = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supa.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      throw new Error(
        `Supabase sign-in failed for ${email}: ${error?.message || 'no session'}. ` +
          'Create the user in Supabase Auth first (see e2e/README.md).',
      )
    }

    // supabase-js stores sessions under a project-scoped key.
    // Example: sb-<ref>-auth-token
    const ref = url.replace(/^https?:\/\//, '').split('.')[0]
    const storageKey = `sb-${ref}-auth-token`
    const session = data.session

    // Navigate to app origin first so localStorage is on the right domain,
    // then set the token and reload.
    await page.goto(baseURL || 'http://localhost:5173/')
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: storageKey, value: JSON.stringify(session) },
    )
    await page.reload()
    await use(page)
  },
})

export { expect }
