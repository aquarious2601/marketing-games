import { apiGet, type RequestOptions } from './client'

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

export interface PlayerSpin {
  id: number
  /** The spin's own snapshot (F02 R10), so a deleted prize still has a name. */
  prizeName: string
  spunAt: string
}

export interface PlayerList {
  players: AdminPlayer[]
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
  /**
   * Null for an anonymous spin (F09 R15) — one from before F08, or one whose
   * player has been deleted. The spin still happened and the prize still
   * left the shop, so it is listed rather than hidden.
   */
  player: SpinPlayer | null
}

export interface SpinLog {
  spins: LoggedSpin[]
  /** As above: how many match, not how many came back (F09 R16). */
  total: number
}

/** F09 R13, R18. */
export async function fetchSpinLog(phone: string, options?: RequestOptions): Promise<SpinLog> {
  const query = phone.trim() === '' ? '' : `?phone=${encodeURIComponent(phone.trim())}`

  return apiGet<SpinLog>(`/admin/spins${query}`, options)
}

export interface PlayerHistory {
  player: AdminPlayer
  spins: PlayerSpin[]
}

/**
 * F08 R20, R21. `phone` matches any part of the stored number, so the admin
 * can type the last four digits off a receipt.
 */
export async function fetchPlayers(phone: string, options?: RequestOptions): Promise<PlayerList> {
  const query = phone.trim() === '' ? '' : `?phone=${encodeURIComponent(phone.trim())}`

  return apiGet<PlayerList>(`/admin/players${query}`, options)
}

/** F08 R22. */
export async function fetchPlayerHistory(
  id: number,
  options?: RequestOptions,
): Promise<PlayerHistory> {
  return apiGet<PlayerHistory>(`/admin/players/${id}`, options)
}
