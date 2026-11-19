import { apiGet, type RequestOptions } from './client'

/**
 * What the game costs and what it brings (F32).
 *
 * Aggregates only. Nothing here can be traced back to one customer, which
 * is deliberate: the screen about a person is the counter's (F31).
 */
export interface StatsFigures {
  /** F32 R12: people, counted as people (F19), not as spins. */
  customers: number
  /** R13: a first play ever falling inside the stretch. */
  newCustomers: number
  /** R13: and everybody else who played in it. The two add up. */
  returningCustomers: number
  plays: number
  wins: number
  /** R14: stated, so nobody has to subtract to find it. */
  wonNothing: number
  /** R15: what the stretch's wins were worth — the shop's liability. */
  issuedCost: number
  /** R20: how many of those could not be priced at all. */
  unpricedIssued: number
  /** R15: how many prizes were handed over in the stretch. */
  collected: number
  /** R15: and what they cost, counted on the day they went out. */
  collectedCost: number
  unpricedCollected: number
  /** R15: of the stretch's wins, how many are still owed. */
  outstanding: number
  /**
   * R16, R21. The share of the stretch's wins collected **as of now**, or
   * null when there were no wins to collect — never a zero, which would
   * read as "nobody came back".
   */
  collectionRate: number | null
}

export interface StatsDay extends StatsFigures {
  /** The store's day (R18), as `YYYY-MM-DD`. */
  day: string
}

export interface StatsTotals extends StatsFigures {
  /** R17: the median wait before a collection, or null if nobody has. */
  medianDelaySeconds: number | null
}

export interface Stats {
  from: string
  to: string
  totals: StatsTotals
  /** R24, R25: one row per day, newest first, zeros included. */
  days: StatsDay[]
  /** R26: the store's currency, so the page keeps no table of symbols. */
  currency: string
  currencySymbol: string
  /** R6: null means a percentage cannot be priced, which R20 reports. */
  averageBasket: number | null
  /** R19: the games to read separately. */
  games: Array<{ id: number; name: string }>
}

/**
 * R23. How many days back, ending with the store's today.
 *
 * A number of days rather than a pair of dates: the days are the store's
 * (R18) and this page does not know which zone that is, so naming a first
 * date would mean guessing at the shop's today. The server holds the zone
 * and works the dates out; it still accepts `from` and `to` for a caller
 * that genuinely has them.
 */
export async function fetchStats(
  days: number | null = null,
  game: number | null = null,
  options?: RequestOptions,
): Promise<Stats> {
  const parameters = new URLSearchParams()

  if (days !== null) {
    parameters.set('days', String(days))
  }

  if (game !== null) {
    parameters.set('game', String(game))
  }

  const query = parameters.toString()

  return apiGet<Stats>(`/admin/stats${query === '' ? '' : `?${query}`}`, options)
}
