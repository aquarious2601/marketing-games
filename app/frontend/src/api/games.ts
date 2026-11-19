import { apiGet, apiPost, apiPut, type RequestOptions } from './client'

/**
 * One of the store's games (F27 R38).
 *
 * What the game *gives away* is not here: a wheel's prizes and a sheet's
 * gifts are loaded by their own endpoints, because they are the part that
 * differs per type.
 */
export interface GameSummary {
  id: number
  name: string
  type: string
  /** What the admin set, or null while the type's default is in use. */
  ownTagline: string | null
  /** The effective phrase, so a list can show what a player would read. */
  defaultTagline: string
  /** F27 R29. Null means no limit. */
  dailyLimit: number | null
  linkKey: string
  /** F27 R41. The whole URL, because what gets copied goes on a poster. */
  playUrl: string
  isLive: boolean
  plays: number
  /**
   * F27 R43. Why this game cannot go live, or null when it can. A sentence
   * rather than a flag, so the list can say what is missing instead of
   * greying a control out and leaving the admin to guess.
   */
  notReady: string | null
}

export interface GameTypeOption {
  value: string
  label: string
}

export interface GamesIndex {
  games: GameSummary[]
  /** F27 R39: the kinds a new game may be, named in the admin's language. */
  types: GameTypeOption[]
  maxDailyLimit: number
}

/** F27 R39. A name and a type, and nothing else. */
export interface NewGame {
  name: string
  type: string
}

/** F27 R40. The game's own fields; its rewards are saved separately. */
export interface GameSubmission {
  name: string
  tagline: string | null
  dailyLimit: number | null
}

export async function fetchGames(options?: RequestOptions): Promise<GamesIndex> {
  return apiGet<GamesIndex>('/admin/games', options)
}

export async function createGame(game: NewGame, options?: RequestOptions): Promise<GameSummary> {
  return apiPost<GameSummary>('/admin/games', game, options)
}

export async function fetchGame(id: number, options?: RequestOptions): Promise<GameSummary> {
  return apiGet<GameSummary>(`/admin/games/${id}`, options)
}

export async function saveGame(
  id: number,
  submission: GameSubmission,
  options?: RequestOptions,
): Promise<GameSummary> {
  return apiPut<GameSummary>(`/admin/games/${id}`, submission, options)
}

/** F27 R42. Reversible, and refused with a reason when the game is not ready. */
export async function setGameLive(
  id: number,
  live: boolean,
  options?: RequestOptions,
): Promise<GameSummary> {
  return apiPut<GameSummary>(`/admin/games/${id}/live`, { live }, options)
}
