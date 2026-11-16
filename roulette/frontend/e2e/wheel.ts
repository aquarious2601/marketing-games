import type { APIRequestContext } from '@playwright/test'

/**
 * The wheel every read-only spec expects to find (F01 R2).
 *
 * The first slice is the losing one: its *label* is "Try again" and the
 * reward it points at is called "Maybe next time" (F13 R8), which is why
 * this maps a slice to a reward by name rather than assuming the two match.
 */
export const DEFAULT_PRIZES = [
  { name: 'Try again', probability: 40, reward: 'Maybe next time' },
  { name: '5% off your next order', probability: 25, reward: '5% off your next order' },
  { name: '10% off your next order', probability: 15, reward: '10% off your next order' },
  { name: 'Free sample', probability: 10, reward: 'Free sample' },
  { name: 'Free gift', probability: 7, reward: 'Free gift' },
  { name: 'Grand prize', probability: 3, reward: 'Grand prize' },
] as const

/**
 * Puts the wheel back exactly as a fresh database would have it.
 *
 * Every slice has to name a reward (F13 R7) — a restore that leaves it out
 * is refused with a 422, and a clean-up that fails silently leaves the next
 * spec reading a wheel the spec before it mangled. That is precisely what
 * happened after F13: one broken `afterEach` failed four later tests that
 * had nothing wrong with them.
 *
 * `includesLosingSlice` is sent because the first slice is the losing one
 * (F13 R11), and the toggle and the list may not disagree (F14 R6).
 */
export async function restoreDefaultWheel(request: APIRequestContext): Promise<void> {
  const catalogue = await rewardIdsByName(request)

  const response = await request.put('/api/admin/wheel', {
    data: {
      includesLosingSlice: true,
      prizes: DEFAULT_PRIZES.map(({ name, probability, reward }) => ({
        name,
        probability,
        rewardId: rewardId(catalogue, reward),
      })),
    },
  })

  if (!response.ok()) {
    throw new Error(
      `The end-to-end suite could not restore the default wheel (${response.status()}): ` +
        `${await response.text()}`,
    )
  }
}

/** @returns the catalogue's ids, keyed by reward name. */
export async function rewardIdsByName(
  request: APIRequestContext,
): Promise<Map<string, number>> {
  const response = await request.get('/api/admin/rewards')

  if (!response.ok()) {
    throw new Error(`The end-to-end suite could not read the catalogue (${response.status()}).`)
  }

  const body = await response.json()

  return new Map<string, number>(
    (body.rewards as Array<{ id: number; name: string }>).map((reward) => [reward.name, reward.id]),
  )
}

export function rewardId(catalogue: Map<string, number>, name: string): number {
  const id = catalogue.get(name)

  if (id === undefined) {
    throw new Error(
      `The catalogue has no reward called "${name}". It holds: ${[...catalogue.keys()].join(', ')}.`,
    )
  }

  return id
}
