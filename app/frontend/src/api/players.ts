import { apiGet, apiPut, type RequestOptions } from './client'

/**
 * A player as the admin may see them (F08 R20).
 *
 * Everything that was collected, which is the difference between this and
 * `PlayerIdentity` in `player.ts`: the admin screen is the only place the
 * last name and the birthday ever appear, and it is behind an account
 * (F08 R23).
 */
export interface AdminPlayer {
  id: number
  phone: string
  firstName: string
  lastName: string
  /** `YYYY-MM-DD`. A calendar date, deliberately not an instant. */
  birthday: string
  createdAt: string
  spinCount: number
}

/**
 * One win on a customer's page (F31 R11, R12).
 *
 * A win rather than a spin: the counter hands prizes over, and a losing
 * spin has none to hand (F13 R15). The ones that lost are the two counts on
 * `CustomerDetail`, not rows here (R13).
 */
export interface CustomerWin {
  id: number
  /** The spin's own snapshot (F02 R10), so a deleted prize still has a name. */
  prizeName: string
  spunAt: string
  rewardType: 'free_product' | 'percent_off' | 'amount_off' | 'nothing'
  rewardValue: number | null
  /** F16 R5: null for a win recorded before codes existed. */
  code: string | null
  /** F13 R21: null until somebody at the counter hands it over. */
  claimedAt: string | null
  /** F31 R19, R22: null for a claim nobody signed, shown as a dash. */
  claimedBy: string | null
  /** F27 R44: which promotion it was won on, by name. */
  game: string
  /** F28 R19: the sheet this win was part of, or null for a wheel spin. */
  sheetId: string | null
}

export interface PlayerList {
  players: AdminPlayer[]
  /**
   * F31 R7. True when nothing matched *because* the code names a win that
   * belongs to nobody — one from before F08, or one whose customer was
   * deleted. The shop still owes somebody that prize, so the page says
   * where it can still be handed over instead of reporting a flat nothing.
   */
  winWithoutCustomer: boolean
  /**
   * How many players match, which is **not** `players.length` (F09 R21): the
   * list is capped server-side, so the two differ as soon as a shop has more
   * players than the cap.
   */
  total: number
}

/** Enough of a player to identify them on a log row (F09 R14). */
export interface SpinPlayer {
  id: number
  phone: string
  firstName: string
  lastName: string
}

export interface LoggedSpin {
  id: number
  /** The spin's own snapshot (F02 R10), so a deleted prize still has a name. */
  prizeName: string
  spunAt: string
  /** F13 R25: what was won, as it was at the moment it was won. */
  rewardType: 'free_product' | 'percent_off' | 'amount_off' | 'nothing'
  rewardValue: number | null
  /** F13 R19: null for a free product and for a losing item. */
  code: string | null
  /** F13 R24: false for a losing item, which has nothing to hand over. */
  claimable: boolean
  /** F13 R21: null until somebody at the counter says otherwise. */
  claimedAt: string | null
  /** F31 R19, R22: the account that handed it over, or null for a dash. */
  claimedBy: string | null
  /** F27 R44: which promotion this row came from, by name. */
  game: string
  /**
   * Null for an anonymous spin (F09 R15) — one from before F08, or one whose
   * player has been deleted. The spin still happened and the prize still
   * left the shop, so it is listed rather than hidden.
   */
  player: SpinPlayer | null
}

/** F31 R25. Everything, what is still owed, or what has been given. */
export type ClaimState = 'all' | 'open' | 'claimed'

export interface SpinLog {
  spins: LoggedSpin[]
  /** As above: how many match, not how many came back (F09 R16). */
  total: number
  /**
   * F31 R24. How many of the matching spins won nothing — the rows the list
   * no longer carries (R23). On screen beside the list, because a list that
   * leaves rows out has to say so.
   */
  wonNothing: number
  /** Which view the server answered with, so the page cannot disagree. */
  status: ClaimState
  /** F27 R44: the games to filter by, so the page needs no second call. */
  games: Array<{ id: number; name: string }>
}

/**
 * Marking a reward handed over, or taking that back (F13 R22, R23).
 *
 * The state wanted rather than two verbs, because staff press the same
 * control to correct a mistake as to make one.
 */
export async function setSpinClaimed(
  id: number,
  claimed: boolean,
  options?: RequestOptions,
): Promise<LoggedSpin> {
  const { spin } = await apiPut<{ spin: LoggedSpin }>(
    `/admin/spins/${id}/claim`,
    { claimed },
    options,
  )

  return spin
}

/** F09 R13, R18. */
/**
 * F16 R7. `search`, not `phone`: the one box takes a phone number or a
 * reward code, and the server decides which of the two it was given.
 */
/** F27 R44. `game` is a game's id, or null for every game. */
export async function fetchSpinLog(
  search: string,
  game: number | null = null,
  status: ClaimState = 'all',
  options?: RequestOptions,
): Promise<SpinLog> {
  const parameters = new URLSearchParams()

  if (search.trim() !== '') {
    parameters.set('search', search.trim())
  }

  if (game !== null) {
    parameters.set('game', String(game))
  }

  // F31 R25. Sent only when it is not the default, so the common URL stays
  // the short one a shop may bookmark.
  if (status !== 'all') {
    parameters.set('status', status)
  }

  const query = parameters.toString()

  return apiGet<SpinLog>(`/admin/spins${query === '' ? '' : `?${query}`}`, options)
}

/** One customer and everything they are owed (F31 R10-R14). */
export interface CustomerDetail {
  player: AdminPlayer
  wins: CustomerWin[]
  /**
   * F34 R17. The card this customer keeps, so staff can show it to somebody
   * who lost the photograph.
   *
   * On this response and not on the list (R18): a screen full of other
   * people's cards is a screen worth photographing.
   */
  card: string
  /** F31 R13: how many times they played, wins and losses together. */
  played: number
  /** And how many of those won something, which is `wins.length`. */
  won: number
}

/**
 * F08 R20, R21 with F31 R1. `search` matches any part of the stored number
 * — the last four digits off a receipt — or the start of a code off a
 * ticket. The server decides which of the two it was given.
 */
export async function fetchPlayers(search: string, options?: RequestOptions): Promise<PlayerList> {
  const query = search.trim() === '' ? '' : `?search=${encodeURIComponent(search.trim())}`

  return apiGet<PlayerList>(`/admin/players${query}`, options)
}

/** F08 R22, F31 R10. */
export async function fetchCustomer(
  id: number,
  options?: RequestOptions,
): Promise<CustomerDetail> {
  return apiGet<CustomerDetail>(`/admin/players/${id}`, options)
}
