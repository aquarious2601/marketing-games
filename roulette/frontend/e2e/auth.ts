import type { APIRequestContext } from '@playwright/test'

/**
 * The account the end-to-end suite signs in as (F07 R17).
 *
 * Created by the global setup, in the suite's own database, which nothing
 * else uses. These credentials are deliberately in the repository: they are
 * worth nothing anywhere but here.
 */
export const E2E_ADMIN = {
  username: 'e2e-admin',
  password: 'end-to-end-password',
} as const

/**
 * Signs the given context in.
 *
 * Playwright has two separate cookie jars in play: the browser context (used
 * by `page`, and reachable as `page.request`) and the standalone `request`
 * fixture. A test that drives the page *and* calls the API directly needs
 * both, which is why this takes the context rather than assuming one.
 */
export async function signIn(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/login', { data: E2E_ADMIN })

  if (!response.ok()) {
    throw new Error(
      `The end-to-end suite could not sign in (${response.status()}). ` +
        'Check that global setup created the admin in the end-to-end database.',
    )
  }
}
