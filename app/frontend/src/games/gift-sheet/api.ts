import type { Branding } from '../../api/branding'
import { apiGet, apiPost, apiPut, type RequestOptions } from '../../api/client'

/** One line of a sheet before it is given away (F28 §8): no code yet. */
export interface SheetGift {
  name: string
  type: 'free_product' | 'percent_off' | 'amount_off' | 'nothing'
  value: number | null
}

/** The same line once it has been given away, with its own code (F28 R10). */
export interface IssuedGift extends SheetGift {
  /** F16 R2's rule per line: a reward with nothing to claim carries none. */
  code: string | null
}

export interface IssuedSheet {
  sheetId: string
  gifts: IssuedGift[]
}

export interface Sheet {
  gifts: SheetGift[]
  branding: Branding
  /**
   * This session's own sheet, or null when it has not been given one.
   *
   * F28 R18 keeps a *stranger's* codes off the screen; this is the page the
   * same session was already looking at, which a reload must not lose.
   */
  issued: IssuedSheet | null
}

export async function fetchSheet(options?: RequestOptions): Promise<Sheet> {
  return apiGet<Sheet>('/sheet', options)
}

/** F28 R9: one request, and the codes are minted by it. */
export async function issueSheet(options?: RequestOptions): Promise<IssuedSheet> {
  return apiPost<IssuedSheet>('/sheet', {}, options)
}

// ----------------------------------------------------------------- the admin

/** F28 R21. A gift is a reward and a place in the order, and nothing else. */
export interface GiftRow {
  id: number | null
  rewardId: number
  /** F28 R4: the reward's name, so a preview needs no second lookup. */
  name: string
  position: number
}

export interface AdminSheet {
  gifts: GiftRow[]
  maxGifts: number
}

export interface GiftSubmission {
  rewardId: number
}

export async function fetchSheetGifts(
  gameId: number,
  options?: RequestOptions,
): Promise<AdminSheet> {
  return apiGet<AdminSheet>(`/admin/games/${gameId}/sheet`, options)
}

export async function saveSheetGifts(
  gameId: number,
  gifts: GiftSubmission[],
  options?: RequestOptions,
): Promise<AdminSheet> {
  return apiPut<AdminSheet>(`/admin/games/${gameId}/sheet`, { gifts }, options)
}
