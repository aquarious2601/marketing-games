import type { APIRequestContext } from '@playwright/test'

/**
 * The wheel every read-only spec expects to find (F01 R2).
 *
 * The first slice is the losing one: its *label* is "Try again" and the
 * reward it points at is called "Maybe next time" (F13 R8), which is why
 * this maps a slice to a reward by name rather than assuming the two match.
 */
/**
 * F26 R1: no `name` beside the reward any more. A slice reads whatever its
 * reward is called, so one column says both what it gives and what it says.
 * The first slice used to be labelled "Try again" while giving "Maybe next
 * time" — the divergence F26 removed.
 */
export const DEFAULT_PRIZES = [
  { probability: 40, reward: 'Maybe next time' },
  { probability: 25, reward: '5% off your next order' },
  { probability: 15, reward: '10% off your next order' },
  { probability: 10, reward: 'Free sample' },
  { probability: 7, reward: 'Free gift' },
  { probability: 3, reward: 'Grand prize' },
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

  const response = await request.put(await wheelUri(request), {
    data: {
      includesLosingSlice: true,
      // F26 R12, R13: a slice is its reward and its odds. A name would be
      // ignored rather than refused, but sending one would suggest it still
      // meant something.
      prizes: DEFAULT_PRIZES.map(({ probability, reward }) => ({
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

/**
 * The store's one game (F27 R26, R32), which is what an upgraded
 * installation has and therefore what these specs may assume.
 *
 * Looked up rather than hard-coded: the id depends on what the database has
 * been through, and F27 moved every admin path for a game underneath it.
 */
export async function theGame(
  request: APIRequestContext,
): Promise<{ id: number; linkKey: string }> {
  const response = await request.get('/api/admin/games')

  if (!response.ok()) {
    throw new Error(`The end-to-end suite could not read the games (${response.status()}).`)
  }

  const body = await response.json()
  const game = body.games[0]

  if (game === undefined) {
    throw new Error('The end-to-end suite found no game to run against.')
  }

  return { id: game.id, linkKey: game.linkKey }
}

/** F27 R40: a wheel is reached through the game whose wheel it is. */
export async function wheelUri(request: APIRequestContext): Promise<string> {
  return `/api/admin/games/${(await theGame(request)).id}/wheel`
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
