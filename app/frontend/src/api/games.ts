import { apiDelete, apiGet, apiPost, apiPut, apiUpload, type RequestOptions } from './client'

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
  /** F30 R1. One of the themes below; never null and never inherited. */
  theme: string
  /**
   * F35 R2. The palette `custom` borrows. It says nothing while the theme
   * is one of the six, and is kept rather than cleared when a game leaves
   * custom (R5), so this screen can put the choice back where it was.
   */
  themeBase: string
  /**
   * F35 R6. The uploaded picture, or null when the game has none.
   *
   * Sent whenever the file is really there, whatever the theme — unlike the
   * player's payload, which also asks whether the game is on custom. This
   * screen is the one that can put a game back on custom, and it should be
   * able to show what it would be putting back.
   */
  backgroundUrl: string | null
  linkKey: string
  /**
   * F27 R41. The path, not the whole URL.
   *
   * The server cannot know where the page is served from — in development
   * it is not even the same host — so the page puts its own origin in front
   * of this. `playUrlOf` below is the one place that does it.
   */
  playPath: string
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

/** F30 R14. The themes a game may be, named in the admin's language. */
export interface ThemeOption {
  value: string
  label: string
}

export interface GamesIndex {
  games: GameSummary[]
  /** F27 R39: the kinds a new game may be, named in the admin's language. */
  types: GameTypeOption[]
  /** F30 R14: and the looks one may wear. */
  themes: ThemeOption[]
  /**
   * F35 R2: the looks that have colours of their own, which is `themes`
   * without `custom` in it. Built by the server, because which themes have
   * a palette is the server's fact and not a word this page should match on.
   */
  themeBases: ThemeOption[]
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
  /** F30 R1. Always sent; an empty value is read as `plain`. */
  theme: string
  /** F35 R2. Always sent; an empty value is read as `plain`, and `custom` is refused. */
  themeBase: string
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

/**
 * F37 R1. Gone, with its wheel and prizes or its gifts and its picture.
 *
 * Refused with a sentence to show when the game has been played or is still
 * live (R2, R3) — the page hides the control in both cases, and the server
 * is what actually decides (R9).
 */
export async function deleteGame(id: number, options?: RequestOptions): Promise<void> {
  return apiDelete<void>(`/admin/games/${id}`, options)
}

/**
 * F35 R6, R11. One picture per game; uploading another replaces it.
 *
 * The whole game comes back rather than just the URL, because the screen
 * that called this is showing the game and the picture is now part of it.
 */
export async function uploadGameBackground(
  id: number,
  file: File,
  options?: RequestOptions,
): Promise<GameSummary> {
  const form = new FormData()
  form.append('background', file)

  return apiUpload<GameSummary>(`/admin/games/${id}/background`, form, options)
}

/** F35 R12. The game stays on custom and falls back to its base. */
export async function removeGameBackground(
  id: number,
  options?: RequestOptions,
): Promise<GameSummary> {
  return apiDelete<GameSummary>(`/admin/games/${id}/background`, options)
}

/** F27 R42. Reversible, and refused with a reason when the game is not ready. */
export async function setGameLive(
  id: number,
  live: boolean,
  options?: RequestOptions,
): Promise<GameSummary> {
  return apiPut<GameSummary>(`/admin/games/${id}/live`, { live }, options)
}
