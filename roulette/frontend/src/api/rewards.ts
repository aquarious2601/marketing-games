import { apiDelete, apiGet, apiPost, apiPut, type RequestOptions } from './client'

/** F13 R2. The four the catalogue knows about. */
export const REWARD_TYPES = ['free_product', 'percent_off', 'amount_off', 'nothing'] as const

export type RewardType = (typeof REWARD_TYPES)[number]

export interface Reward {
  id: number
  name: string
  type: RewardType
  /** Null for a free product and for nothing (F13 R3). */
  value: number | null
  createdAt: string
  /**
   * The labels of the slices using this reward (F13 R6).
   *
   * Names rather than a count, so the list can say *which* slice is in the
   * way before the admin presses delete and is told no.
   */
  usedBy: string[]
}

export interface RewardTypeOption {
  value: RewardType
  /** Already translated by the server, in the admin's language (F12 R16). */
  label: string
}

export interface RewardCatalogue {
  rewards: Reward[]
  types: RewardTypeOption[]
}

export interface RewardDraft {
  name: string
  type: RewardType
  /** Omitted for the types that take none; sending one is rejected (F13 R3). */
  value?: number
  /**
   * F15 R9: the campaign's currency, saved with the amount it counts.
   *
   * Sent only for `amount_off` — the server ignores it on any other type,
   * and sending one the admin was never shown would be this page choosing
   * for them.
   */
  currency?: string
}

/** F13 R5. */
export async function fetchRewards(options?: RequestOptions): Promise<RewardCatalogue> {
  return apiGet<RewardCatalogue>('/admin/rewards', options)
}

export async function createReward(draft: RewardDraft, options?: RequestOptions): Promise<Reward> {
  const { reward } = await apiPost<{ reward: Reward }>('/admin/rewards', draft, options)

  return reward
}

export async function updateReward(
  id: number,
  draft: RewardDraft,
  options?: RequestOptions,
): Promise<Reward> {
  const { reward } = await apiPut<{ reward: Reward }>(`/admin/rewards/${id}`, draft, options)

  return reward
}

/** F13 R6: refused with a 422 when a slice is using it. */
export async function deleteReward(id: number, options?: RequestOptions): Promise<void> {
  await apiDelete<null>(`/admin/rewards/${id}`, options)
}

/** F13 R3: only two of the four carry a number. */
export function takesValue(type: RewardType): boolean {
  return type === 'percent_off' || type === 'amount_off'
}

/** F15 R7: and only one of those is counted in money. */
export function takesCurrency(type: RewardType): boolean {
  return type === 'amount_off'
}

/**
 * A reward's value as a person reads it (F13 R28).
 *
 * The currency is the campaign's, which is why it has to be passed in — a
 * reward does not know what it is counted in, and neither should this.
 */
export function formatValue(
  reward: Pick<Reward, 'type' | 'value'>,
  currencySymbol: string,
): string {
  if (reward.value === null) {
    return '—'
  }

  if (reward.type === 'percent_off') {
    return `${reward.value}%`
  }

  // Grouped with thin spaces rather than commas or dots, because which of
  // those means "thousands" depends on the country. Matches the backend's
  // Currency::format.
  const grouped = reward.value.toLocaleString(undefined, { useGrouping: true })

  return `${grouped}${currencySymbol}`
}
