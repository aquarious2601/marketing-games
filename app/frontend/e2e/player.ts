import type { APIRequestContext } from '@playwright/test'

/**
 * The player the end-to-end suite plays as (F08).
 *
 * Nothing spins until the server knows who is spinning (F08 R16), so the
 * specs about the wheel have to be identified before they can reach it. They
 * identify through the API rather than by typing the step, so that a spec
 * about the spin animation stays a spec about the spin animation — the
 * identity step itself is checked by hand.
 */
export const E2E_PLAYER = {
  phone: '0912345678',
  firstName: 'Anh',
  lastName: 'Le',
  birthday: '1994-03-12',
} as const

/**
 * Registers the player if they are new and identifies the given context
 * either way (F08 R7), so this is safe to call from every test however many
 * times the suite has already run against this database.
 *
 * Takes the context for the same reason `signIn` does: Playwright keeps the
 * browser context's cookie jar (`page.request`) separate from the standalone
 * `request` fixture, and the session cookie has to land in the one that is
 * going to spin.
 */
export async function identifyPlayer(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/player/register', { data: E2E_PLAYER })

  if (!response.ok()) {
    throw new Error(
      `The end-to-end suite could not identify a player (${response.status()}). ` +
        'Check that global setup migrated the player table into the end-to-end database.',
    )
  }
}
