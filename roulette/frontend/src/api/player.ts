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

export interface SpinResult {
  prize: PlayerPrize
  spunAt: string
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

export interface PhoneLookup {
  known: boolean
  /** The canonical form the server derived from what was typed (F08 R3). */
  phone: string
  player: PlayerIdentity | null
}

export interface Registration {
  phone: string
  firstName: string
  lastName: string
  birthday: string
}

/**
 * Who the server thinks it is talking to, or nobody (F08 R12, R13).
 *
 * The page asks rather than remembering: identification lives in a cookie it
 * cannot read, which is what stops a browser claiming to be a player. A `200`
 * with a null player is the ordinary answer here, not an error — see F08
 * section 8 for why this is not a 401.
 */
export async function fetchIdentity(options?: RequestOptions): Promise<PlayerIdentity | null> {
  const { player } = await apiGet<{ player: PlayerIdentity | null }>('/player/me', options)

  return player
}

/** F08 R5. A known number is identified by this call; an unknown one is not. */
export async function identifyPhone(phone: string, options?: RequestOptions): Promise<PhoneLookup> {
  return apiPost<PhoneLookup>('/player/identify', { phone }, options)
}

/** F08 R6, R7. */
export async function registerPlayer(
  registration: Registration,
  options?: RequestOptions,
): Promise<PlayerIdentity> {
  const { player } = await apiPost<{ player: PlayerIdentity }>(
    '/player/register',
    registration,
    options,
  )

  return player
}

/** F08 R14: the next person to pick up a stall phone is not this one. */
export async function forgetPlayer(options?: RequestOptions): Promise<void> {
  await apiPost<null>('/player/forget', undefined, options)
}
