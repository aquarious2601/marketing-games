import { apiGet, apiPut, type RequestOptions } from './client'

/** F01 section 7. A prize as the API reports it. */
export interface WheelPrize {
  id: number | null
  name: string
  probability: number
  position: number
  colour: string
  /** F13 R7: what this slice gives away. */
  rewardId: number | null
}

export interface WheelConfiguration {
  id: number | null
  updatedAt: string
  totalProbability: number
  /** F13 R11. */
  includesLosingSlice: boolean
  prizes: WheelPrize[]
}

/** What the client sends back: the full list, in the order wanted. */
export interface PrizeSubmission {
  id: number | null
  name: string
  probability: number
  /** F13 R7: required — a slice pointing at nothing cannot be honoured. */
  rewardId: number
}

export async function fetchWheel(options?: RequestOptions): Promise<WheelConfiguration> {
  return apiGet<WheelConfiguration>('/admin/wheel', options)
}

/**
 * Throws ApiValidationError when the server rejects the configuration, so the
 * caller can place each message against the field that caused it.
 */
export async function saveWheel(
  prizes: PrizeSubmission[],
  includesLosingSlice: boolean,
  options?: RequestOptions,
): Promise<WheelConfiguration> {
  return apiPut<WheelConfiguration>('/admin/wheel', { prizes, includesLosingSlice }, options)
}
