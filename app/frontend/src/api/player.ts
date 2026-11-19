import type { Branding } from './branding'
import { apiGet, apiPost, type RequestOptions } from './client'

/**
 * A prize as a player may see it: no probability, ever (F02 R2).
 */
export interface PlayerPrize {
  id: number | null
  name: string
  position: number
  colour: string
}

export interface PlayerWheel {
  prizes: PlayerPrize[]
  /** Arrives with the wheel so the page loads in one request (F04 §8). */
  branding: Branding
}

/**
 * What was won, beside the slice it was won on (F13 R20).
 *
 * The type and value are here rather than parsed out of the prize's name,
 * because that name is the admin's words and may say anything (F13 R8).
 */
export interface SpinReward {
  type: 'free_product' | 'percent_off' | 'amount_off' | 'nothing'
  value: number | null
  /** F16 R1, R2: every win carries one; only a losing spin has none. */
  code: string | null
}

export interface SpinResult {
  prize: PlayerPrize
  reward: SpinReward
  spunAt: string
}

/**
 * What a link resolves to (F27 R20).
 *
 * Calling this is what binds the session to a game, so every request after
 * it — the wheel, the identification, the spin — is about that game and
 * nothing the page sends can change which (R27).
 */
export interface ResolvedGame {
  type: string
  branding: PlayerWheel['branding']
}

/**
 * F27 R24, R25. A game that is not live and a key that never existed both
 * answer 404 with the same body, so the page shows one screen for both and
 * cannot leak which it was.
 */
/**
 * F27 R26. The game `/` serves, when exactly one is live.
 *
 * The same shape `resolvePlay` answers, so the page has one question and two
 * ways of asking it. 409 when there is no single live game.
 */
export async function fetchGameType(options?: RequestOptions): Promise<ResolvedGame> {
  return apiGet<ResolvedGame>('/game', options)
}

export async function resolvePlay(key: string, options?: RequestOptions): Promise<ResolvedGame> {
  return apiGet<ResolvedGame>(`/play/${encodeURIComponent(key)}`, options)
}

export async function fetchPlayerWheel(options?: RequestOptions): Promise<PlayerWheel> {
  return apiGet<PlayerWheel>('/wheel', options)
}

/**
 * The server draws the prize and records the play (F02 R4). Nothing here
 * decides anything — the browser is told the result and animates to it.
 */
export async function spin(options?: RequestOptions): Promise<SpinResult> {
  return apiPost<SpinResult>('/spin', undefined, options)
}

/**
 * The identified player, as the player's own page may see them (F08 R11).
 *
 * The first name and the number, and nothing else. The last name and the
 * birthday are collected and stored and never sent back to a browser, so
 * there is nothing here to leave them out of.
 */
export interface PlayerIdentity {
  firstName: string
  phone: string
}

/**
 * What this identification has already won (F20 R5).
 *
 * The prize *name* rather than the slice, because this is the spin's own
 * snapshot and the slice may have been renamed or deleted since (F02 R10).
 * No position: nothing is animated when this arrives — the wheel is at rest
 * and the result is simply on screen.
 */
export interface PendingSpin {
  prizeName: string
  reward: SpinReward
  spunAt: string
}

/**
 * Everything the server will say about this browser (F08 R12, F20 R5): who it
 * is talking to, and whether that identification has had its spin.
 */
export interface PlayerState {
  player: PlayerIdentity | null
  spin: PendingSpin | null
  /**
   * How many spins this *person* has left today, or null when the campaign
   * has no limit and when nobody is identified (F23 R12).
   *
   * Null rather than a large number, so "no limit" can never be rendered as
   * a count and `spinsLeft === 0` is the whole test for an exhausted day.
   * It is about this person, never about the campaign's rule: the page is
   * not told what the limit is (F23 R18).
   */
  spinsLeft: number | null
}

/** A player the server has just identified, and their day (F23 R13). */
export interface Identified {
  player: PlayerIdentity
  spinsLeft: number | null
}

export interface PhoneLookup {
  known: boolean
  /** The canonical form the server derived from what was typed (F08 R3). */
  phone: string
  player: PlayerIdentity | null
  /** F23 R13. Null for a number nobody has registered. */
  spinsLeft: number | null
}

export interface Registration {
  phone: string
  firstName: string
  lastName: string
  birthday: string
}

/**
 * Who the server thinks it is talking to, or nobody (F08 R12, R13), and what
 * that identification has already won (F20 R5).
 *
 * The page asks rather than remembering: identification lives in a cookie it
 * cannot read, which is what stops a browser claiming to be a player. A `200`
 * with a null player is the ordinary answer here, not an error — see F08
 * section 8 for why this is not a 401.
 *
 * The spin comes back here rather than being remembered by the page, for the
 * same reason the identity does: a reload has no page state left, and this is
 * the call that rebuilds the screen from what the server knows.
 */
export async function fetchIdentity(options?: RequestOptions): Promise<PlayerState> {
  return apiGet<PlayerState>('/player/me', options)
}

/** F08 R5. A known number is identified by this call; an unknown one is not. */
export async function identifyPhone(phone: string, options?: RequestOptions): Promise<PhoneLookup> {
  return apiPost<PhoneLookup>('/player/identify', { phone }, options)
}

/** F08 R6, R7. */
export async function registerPlayer(
  registration: Registration,
  options?: RequestOptions,
): Promise<Identified> {
  /*
   * F23 R13. The day comes back with the player because registering may
   * return somebody who already exists (F08 R7) and has played today — so
   * this cannot assume a full allowance.
   */
  return apiPost<Identified>('/player/register', registration, options)
}

/** F08 R14: the next person to pick up a stall phone is not this one. */
export async function forgetPlayer(options?: RequestOptions): Promise<void> {
  await apiPost<null>('/player/forget', undefined, options)
}
