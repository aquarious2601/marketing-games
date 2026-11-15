import type { PrizeSubmission, WheelConfiguration } from '../api/wheel'

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
export const NAME_MAX_LENGTH = 40
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
  name: string
  /** Held as text so the field can be empty mid-edit without becoming 0. */
  probability: string
}

export interface PrizeErrors {
  name?: string
  probability?: string
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
    name: prize.name,
    probability: String(prize.probability),
  }))
}

export function toSubmission(drafts: DraftPrize[]): PrizeSubmission[] {
  return drafts.map((draft) => ({
    id: draft.id,
    name: draft.name.trim(),
    probability: Number(draft.probability),
  }))
}

export function createPrize(): DraftPrize {
  return { key: nextKey(), id: null, name: '', probability: '' }
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
  change: Partial<Pick<DraftPrize, 'name' | 'probability'>>,
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

export function validate(drafts: DraftPrize[]): DraftValidation {
  const prizeErrors: PrizeErrors[] = []

  let total = 0
  let everyProbabilityReadable = true

  for (const draft of drafts) {
    const errors: PrizeErrors = {}

    // F01 R4
    const name = draft.name.trim()

    if (name === '') {
      errors.name = 'A prize needs a name.'
    } else if (name.length > NAME_MAX_LENGTH) {
      errors.name = `A prize name can be at most ${NAME_MAX_LENGTH} characters.`
    }

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

  const hasPrizeError = prizeErrors.some((errors) => errors.name !== undefined || errors.probability !== undefined)

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

    return (
      draft.id !== original.id ||
      draft.name !== original.name ||
      draft.probability !== original.probability
    )
  })
}
