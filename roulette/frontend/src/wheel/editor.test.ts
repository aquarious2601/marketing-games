import { describe, expect, it } from 'vitest'
import type { WheelConfiguration } from '../api/wheel'
import {
  MAX_PRIZES,
  addPrize,
  canAddPrize,
  canRemovePrize,
  createPrize,
  fromConfiguration,
  isDirty,
  movePrize,
  pinLosingFirst,
  removePrize,
  toSubmission,
  updatePrize,
  validate,
  type DraftPrize,
} from './editor'

/**
 * A slice with a reward on it (F13 R7), because that is the normal case —
 * the tests about a *missing* reward say so explicitly.
 */
function draft(name: string, probability: string, id: number | null = null): DraftPrize {
  return { ...createPrize(), id, name, probability, rewardId: 1 }
}

/** A valid two-prize wheel, the smallest thing that can be saved. */
function validDrafts(): DraftPrize[] {
  return [draft('Try again', '60', 1), draft('Free gift', '40', 2)]
}

function manyDrafts(count: number): DraftPrize[] {
  return Array.from({ length: count }, (_, index) =>
    draft(`Prize ${index}`, index === 0 ? String(100 - (count - 1)) : '1'),
  )
}

describe('fromConfiguration', () => {
  it('turns an API configuration into editable rows', () => {
    const configuration: WheelConfiguration = {
      id: 1,
      updatedAt: '2026-11-14T20:00:00+00:00',
      totalProbability: 100,
      includesLosingSlice: false,
      prizes: [
        { id: 7, name: 'Try again', probability: 60, position: 0, colour: '#475569', rewardId: 1 },
        { id: 8, name: 'Free gift', probability: 40, position: 1, colour: '#E11D48', rewardId: 1 },
      ],
    }

    const drafts = fromConfiguration(configuration)

    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ id: 7, name: 'Try again', probability: '60' })
    expect(drafts[1]).toMatchObject({ id: 8, name: 'Free gift', probability: '40' })
  })

  it('gives every row a distinct key so reordering does not remount them', () => {
    const drafts = fromConfiguration({
      id: 1,
      updatedAt: '',
      totalProbability: 100,
      includesLosingSlice: false,
      prizes: [
        { id: 1, name: 'A', probability: 50, position: 0, colour: '#000000', rewardId: 1 },
        { id: 2, name: 'A', probability: 50, position: 1, colour: '#000000', rewardId: 1 },
      ],
    })

    expect(drafts[0].key).not.toBe(drafts[1].key)
  })
})

describe('toSubmission', () => {
  it('trims names and converts probabilities to numbers', () => {
    const submission = toSubmission([draft('  Free gift  ', '40', 3)])

    expect(submission).toEqual([{ id: 3, name: 'Free gift', probability: 40, rewardId: 1 }])
  })
})

describe('adding and removing', () => {
  it('allows adding below the maximum', () => {
    expect(canAddPrize(validDrafts())).toBe(true)
    expect(addPrize(validDrafts())).toHaveLength(3)
  })

  // F01 R19
  it('refuses to add beyond the maximum', () => {
    const full = manyDrafts(MAX_PRIZES)

    expect(canAddPrize(full)).toBe(false)
    expect(addPrize(full)).toHaveLength(MAX_PRIZES)
  })

  it('adds an empty row', () => {
    const added = addPrize(validDrafts())

    expect(added[2]).toMatchObject({ id: null, name: '', probability: '' })
  })

  it('allows removing above the minimum', () => {
    const three = manyDrafts(3)

    expect(canRemovePrize(three)).toBe(true)
    expect(removePrize(three, 1)).toHaveLength(2)
  })

  // F01 R20
  it('refuses to remove at the minimum', () => {
    const two = validDrafts()

    expect(canRemovePrize(two)).toBe(false)
    expect(removePrize(two, 0)).toHaveLength(2)
  })

  it('removes the row at the given index', () => {
    const three = [draft('A', '34'), draft('B', '33'), draft('C', '33')]

    expect(removePrize(three, 1).map((d) => d.name)).toEqual(['A', 'C'])
  })

  it('ignores an index that does not exist', () => {
    const three = manyDrafts(3)

    expect(removePrize(three, 99)).toBe(three)
  })
})

describe('reordering', () => {
  it('moves a prize down', () => {
    const drafts = [draft('A', '34'), draft('B', '33'), draft('C', '33')]

    expect(movePrize(drafts, 0, 1).map((d) => d.name)).toEqual(['B', 'A', 'C'])
  })

  it('moves a prize up', () => {
    const drafts = [draft('A', '34'), draft('B', '33'), draft('C', '33')]

    expect(movePrize(drafts, 2, -1).map((d) => d.name)).toEqual(['A', 'C', 'B'])
  })

  it('refuses to move the first prize up or the last one down', () => {
    const drafts = [draft('A', '50'), draft('B', '50')]

    expect(movePrize(drafts, 0, -1)).toBe(drafts)
    expect(movePrize(drafts, 1, 1)).toBe(drafts)
  })

  it('keeps row identity so inputs do not lose focus', () => {
    const drafts = [draft('A', '50'), draft('B', '50')]
    const moved = movePrize(drafts, 0, 1)

    expect(moved[1].key).toBe(drafts[0].key)
  })
})

describe('updatePrize', () => {
  it('changes only the row addressed', () => {
    const drafts = [draft('A', '50'), draft('B', '50')]
    const updated = updatePrize(drafts, 1, { name: 'Changed' })

    expect(updated[0].name).toBe('A')
    expect(updated[1].name).toBe('Changed')
  })

  it('does not mutate the array it was given', () => {
    const drafts = [draft('A', '50'), draft('B', '50')]
    updatePrize(drafts, 0, { name: 'Changed' })

    expect(drafts[0].name).toBe('A')
  })
})

describe('validate', () => {
  it('accepts a wheel totalling 100', () => {
    const result = validate(validDrafts())

    expect(result.isValid).toBe(true)
    expect(result.total).toBe(100)
    expect(result.totalError).toBeNull()
  })

  // F01 R8, R9
  it('reports a total that is not 100, naming the actual figure', () => {
    const result = validate([draft('A', '60'), draft('B', '37')])

    expect(result.isValid).toBe(false)
    expect(result.total).toBe(97)
    expect(result.totalError).toContain('97')
    expect(result.totalError).toContain('100')
  })

  // F01 R4
  it('rejects a blank name', () => {
    const result = validate([draft('   ', '60'), draft('B', '40')])

    expect(result.prizeErrors[0].name).toBe('A prize needs a name.')
    expect(result.isValid).toBe(false)
  })

  it('rejects a name longer than 40 characters', () => {
    const result = validate([draft('a'.repeat(41), '60'), draft('B', '40')])

    expect(result.prizeErrors[0].name).toContain('40 characters')
  })

  it('accepts a name of exactly 40 characters', () => {
    const result = validate([draft('a'.repeat(40), '60'), draft('B', '40')])

    expect(result.prizeErrors[0].name).toBeUndefined()
  })

  // F01 R5
  it.each([
    ['empty', ''],
    ['a decimal', '2.5'],
    ['exponential', '1e2'],
    ['padded', ' 50 '],
    ['letters', 'fifty'],
    ['negative', '-5'],
  ])('rejects %s as a probability', (_label, probability) => {
    const result = validate([draft('A', probability), draft('B', '40')])

    expect(result.prizeErrors[0].probability).toContain('whole number')
    expect(result.isValid).toBe(false)
  })

  it.each([
    ['zero', '0'],
    ['over one hundred', '101'],
  ])('rejects %s as out of range', (_label, probability) => {
    const result = validate([draft('A', probability), draft('B', '40')])

    expect(result.prizeErrors[0].probability).toContain('between 1 and 100')
  })

  it('gives no total when a probability cannot be read', () => {
    const result = validate([draft('A', 'fifty'), draft('B', '40')])

    expect(result.total).toBeNull()
    expect(result.totalError).toBeNull()
  })

  // F01 R6
  it('allows duplicate names', () => {
    const result = validate([draft('5 euro voucher', '50'), draft('5 euro voucher', '50')])

    expect(result.isValid).toBe(true)
  })

  // F01 R1
  it('rejects fewer than two prizes', () => {
    const result = validate([draft('Only one', '100')])

    expect(result.countError).toContain('at least 2')
    expect(result.isValid).toBe(false)
  })

  it('rejects more than twelve prizes', () => {
    const result = validate(manyDrafts(13))

    expect(result.countError).toContain('at most 12')
  })

  it('accepts exactly twelve prizes', () => {
    const result = validate(manyDrafts(MAX_PRIZES))

    expect(result.countError).toBeNull()
    expect(result.isValid).toBe(true)
  })

  it('reports one error object per prize, in order', () => {
    const result = validate([draft('', '60'), draft('B', '40')])

    expect(result.prizeErrors).toHaveLength(2)
    expect(result.prizeErrors[1]).toEqual({})
  })

  /**
   * F13 R7. Checked here rather than left to the server, so the Save
   * button is honest: a slice with nothing to give away is not a wheel
   * that can be saved.
   */
  it('refuses a slice with no reward', () => {
    const result = validate([{ ...draft('A', '60'), rewardId: null }, draft('B', '40')])

    expect(result.prizeErrors[0].rewardId).toBeDefined()
    expect(result.prizeErrors[1].rewardId).toBeUndefined()
    expect(result.isValid).toBe(false)
  })
})

describe('isDirty', () => {
  it('is false when nothing has changed', () => {
    const drafts = validDrafts()

    expect(isDirty(drafts, drafts)).toBe(false)
  })

  it('notices a changed name', () => {
    const saved = validDrafts()
    const edited = updatePrize(saved, 0, { name: 'Changed' })

    expect(isDirty(edited, saved)).toBe(true)
  })

  it('notices a changed probability', () => {
    const saved = validDrafts()
    const edited = updatePrize(saved, 0, { probability: '61' })

    expect(isDirty(edited, saved)).toBe(true)
  })

  it('notices an added or removed prize', () => {
    const saved = validDrafts()

    expect(isDirty(addPrize(saved), saved)).toBe(true)
  })

  it('notices a reorder', () => {
    const saved = validDrafts()

    expect(isDirty(movePrize(saved, 0, 1), saved)).toBe(true)
  })
})

/** F14 R5 */
describe('pinLosingFirst', () => {
  function withReward(name: string, rewardId: number | null): DraftPrize {
    return { ...createPrize(), name, probability: '10', rewardId }
  }

  it('moves the losing slice to the front, keeping the rest in order', () => {
    const drafts = [
      withReward('Free gift', 1),
      withReward('Free sample', 2),
      withReward('Try again', 9),
    ]

    expect(pinLosingFirst(drafts, 9).map((draft) => draft.name)).toEqual([
      'Try again',
      'Free gift',
      'Free sample',
    ])
  })

  it('leaves a list that already starts with it exactly as it was', () => {
    const drafts = [withReward('Try again', 9), withReward('Free gift', 1)]

    expect(pinLosingFirst(drafts, 9)).toBe(drafts)
  })

  it('leaves a list with no losing slice alone', () => {
    const drafts = [withReward('Free gift', 1), withReward('Free sample', 2)]

    expect(pinLosingFirst(drafts, 9)).toBe(drafts)
  })

  /**
   * A slice with no reward yet has `rewardId: null`, and null must not be
   * read as "this is the losing one" just because there is no losing reward
   * in the catalogue either.
   */
  it('matches nothing when there is no losing reward', () => {
    const drafts = [withReward('Free gift', 1), withReward('Not chosen yet', null)]

    expect(pinLosingFirst(drafts, null)).toBe(drafts)
  })
})
