import type { PrizeSubmission, WheelConfiguration } from './api'

/**
 * The editing model behind the admin form, kept free of React so that every
 * rule in F01 section 6 can be tested without rendering anything.
 *
 * These limits mirror the backend. The server is still the authority — the
 * client copy exists so the admin is told immediately rather than after a
 * round trip (F01 R17).
 */
export const MIN_PRIZES = 2
export const MAX_PRIZES = 12
export const MIN_PROBABILITY = 1
export const MAX_PROBABILITY = 100
export const REQUIRED_TOTAL = 100

export interface DraftPrize {
  /**
   * A stable React key. Not the database id: a newly added prize has no id,
   * and reordering must not make React remount every row and lose focus.
   */
  key: string
  id: number | null
  /** Held as text so the field can be empty mid-edit without becoming 0. */
  probability: string
  /**
   * F13 R7, F26 R1. Null only while a freshly added slice has not been given
   * one yet; `validate` refuses to let that be saved. Since F26 this is also
   * the slice's label, so it is the whole of its identity.
   */
  rewardId: number | null
}

export interface PrizeErrors {
  probability?: string
  rewardId?: string
}

export interface DraftValidation {
  prizeErrors: PrizeErrors[]
  /** null when a probability could not be read, so no honest total exists. */
  total: number | null
  totalError: string | null
  countError: string | null
  isValid: boolean
}

let keyCounter = 0

function nextKey(): string {
  keyCounter += 1

  return `draft-${keyCounter}`
}

export function fromConfiguration(configuration: WheelConfiguration): DraftPrize[] {
  return configuration.prizes.map((prize) => ({
    key: nextKey(),
    id: prize.id,
    probability: String(prize.probability),
    rewardId: prize.rewardId,
  }))
}

export function toSubmission(drafts: DraftPrize[]): PrizeSubmission[] {
  return drafts.map((draft) => ({
    id: draft.id,
    probability: Number(draft.probability),
    // Coerced here rather than guarded: `validate` has already refused a
    // draft with no reward, so nothing reaches this with a null.
    rewardId: draft.rewardId ?? 0,
  }))
}

export function createPrize(): DraftPrize {
  return { key: nextKey(), id: null, probability: '', rewardId: null }
}

export function canAddPrize(drafts: DraftPrize[]): boolean {
  return drafts.length < MAX_PRIZES
}

export function canRemovePrize(drafts: DraftPrize[]): boolean {
  return drafts.length > MIN_PRIZES
}

export function addPrize(drafts: DraftPrize[]): DraftPrize[] {
  return canAddPrize(drafts) ? [...drafts, createPrize()] : drafts
}

export function removePrize(drafts: DraftPrize[], index: number): DraftPrize[] {
  if (!canRemovePrize(drafts) || index < 0 || index >= drafts.length) {
    return drafts
  }

  return drafts.filter((_, i) => i !== index)
}

/**
 * Puts the losing slice at the top of the list (F14 R5).
 *
 * Applied to every change rather than only to the toggle, because a slice
 * can become the losing one three ways — the toggle adds it, a load brings
 * one back from the server, or an admin points an ordinary slice at the
 * losing reward from its dropdown — and the rule has to hold after all
 * three. A single place that re-asserts it cannot miss one.
 *
 * The order of the rest is preserved. `rewardId` of `null` never matches,
 * so a list with no losing slice comes back untouched and identical.
 */
export function pinLosingFirst(drafts: DraftPrize[], losingRewardId: number | null): DraftPrize[] {
  if (losingRewardId === null) {
    return drafts
  }

  const at = drafts.findIndex((draft) => draft.rewardId === losingRewardId)

  if (at <= 0) {
    return drafts
  }

  return movePrize(drafts, at, -at)
}

export function movePrize(drafts: DraftPrize[], index: number, offset: number): DraftPrize[] {
  const target = index + offset

  if (index < 0 || index >= drafts.length || target < 0 || target >= drafts.length) {
    return drafts
  }

  const moved = [...drafts]
  const [prize] = moved.splice(index, 1)
  moved.splice(target, 0, prize)

  return moved
}

export function updatePrize(
  drafts: DraftPrize[],
  index: number,
  change: Partial<Pick<DraftPrize, 'probability' | 'rewardId'>>,
): DraftPrize[] {
  return drafts.map((draft, i) => (i === index ? { ...draft, ...change } : draft))
}

/**
 * F01 R5. Only a string of digits is a probability: "2.5", "1e2", " 5 " and
 * "" are all refused rather than coerced, because Number() would quietly turn
 * several of them into something the admin did not type.
 */
function parseProbability(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }

  return Number(raw)
}

/**
 * F13 R7. Checked here rather than left to the server, so the Save button
 * is honest: a slice with nothing to give away is not a wheel that can be
 * saved, and the admin should see that before pressing.
 */
function rewardProblem(draft: DraftPrize): string | undefined {
  // English here, like every other message in this module: `validate` is a
  // pure function the tests call directly, and threading a translator
  // through it would make a rule about wheels depend on React. The admin
  // sees the server's translated violation on save; this one only has to
  // stop the button working.
  return draft.rewardId === null ? 'Choose what this slice gives away.' : undefined
}

export function validate(drafts: DraftPrize[]): DraftValidation {
  const prizeErrors: PrizeErrors[] = []

  let total = 0
  let everyProbabilityReadable = true

  for (const draft of drafts) {
    const errors: PrizeErrors = {}

    // F01 R4's name rules went with the field (F26 R10). A slice can no
    // longer fail to save because of a label, because it has none.

    // F01 R5
    const probability = parseProbability(draft.probability)

    if (probability === null) {
      errors.probability = 'A probability must be a whole number.'
      everyProbabilityReadable = false
    } else if (probability < MIN_PROBABILITY || probability > MAX_PROBABILITY) {
      errors.probability = `A probability must be between ${MIN_PROBABILITY} and ${MAX_PROBABILITY}.`
      everyProbabilityReadable = false
    } else {
      total += probability
    }

    // F13 R7
    const reward = rewardProblem(draft)

    if (reward !== undefined) {
      errors.rewardId = reward
    }

    prizeErrors.push(errors)
  }

  // F01 R1
  let countError: string | null = null

  if (drafts.length < MIN_PRIZES) {
    countError = `A wheel needs at least ${MIN_PRIZES} prizes.`
  } else if (drafts.length > MAX_PRIZES) {
    countError = `A wheel can have at most ${MAX_PRIZES} prizes.`
  }

  // F01 R8, R9. Reporting a total built from unreadable values would mislead.
  let totalError: string | null = null

  if (everyProbabilityReadable && total !== REQUIRED_TOTAL) {
    totalError = `The probabilities must total ${REQUIRED_TOTAL}. They currently total ${total}.`
  }

  // Any problem on any slice, rather than a list of the fields that can
  // have one: F13 added `rewardId` and this line had to be remembered,
  // which is exactly the kind of thing that gets forgotten next time.
  const hasPrizeError = prizeErrors.some((errors) => Object.keys(errors).length > 0)

  return {
    prizeErrors,
    total: everyProbabilityReadable ? total : null,
    totalError,
    countError,
    isValid: !hasPrizeError && totalError === null && countError === null,
  }
}

/** Whether the admin has changes worth warning about before leaving (F01 R21). */
export function isDirty(drafts: DraftPrize[], saved: DraftPrize[]): boolean {
  if (drafts.length !== saved.length) {
    return true
  }

  return drafts.some((draft, index) => {
    const original = saved[index]

    // rewardId is compared since F26: with the label gone it is the only
    // thing on a slice besides its odds, so a form that ignored it would
    // call a changed wheel unchanged.
    return (
      draft.id !== original.id ||
      draft.rewardId !== original.rewardId ||
      draft.probability !== original.probability
    )
  })
}
