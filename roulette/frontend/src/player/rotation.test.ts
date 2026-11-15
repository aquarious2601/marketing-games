import { describe, expect, it } from 'vitest'
import { MAX_PRIZES, MIN_PRIZES } from '../wheel/editor'
import { DEFAULT_TURNS, rotationFor, sliceUnderPointer } from './rotation'

/**
 * F02 R13. If this maths is wrong the wheel stops on a different prize from
 * the one the player is told they won, and the game looks rigged. It is
 * checked for every wheel size the admin can configure.
 */
describe('rotationFor', () => {
  it('brings the drawn slice under the pointer, for every wheel size and position', () => {
    for (let count = MIN_PRIZES; count <= MAX_PRIZES; count += 1) {
      for (let position = 0; position < count; position += 1) {
        const rotation = rotationFor(position, count)

        expect(
          sliceUnderPointer(rotation, count),
          `A ${count}-slice wheel stopping on position ${position} landed on ${sliceUnderPointer(rotation, count)}.`,
        ).toBe(position)
      }
    }
  })

  it('still lands correctly when starting from an arbitrary previous rotation', () => {
    const count = 7

    for (const previous of [0, 37, 360, 1234.5, 9_999]) {
      for (let position = 0; position < count; position += 1) {
        const rotation = rotationFor(position, count, previous)

        expect(sliceUnderPointer(rotation, count)).toBe(position)
      }
    }
  })

  it('always turns forwards', () => {
    let rotation = 0

    for (const position of [3, 0, 5, 1, 1, 4]) {
      const next = rotationFor(position, 6, rotation)

      expect(next).toBeGreaterThan(rotation)
      rotation = next
    }
  })

  it('turns at least the configured number of whole turns', () => {
    for (let position = 0; position < 6; position += 1) {
      const rotation = rotationFor(position, 6, 0)

      expect(rotation).toBeGreaterThanOrEqual(DEFAULT_TURNS * 360)
      expect(rotation).toBeLessThan((DEFAULT_TURNS + 1) * 360)
    }
  })

  it('accumulates across repeated spins rather than resetting', () => {
    const first = rotationFor(2, 6, 0)
    const second = rotationFor(2, 6, first)

    expect(second - first).toBeGreaterThanOrEqual(DEFAULT_TURNS * 360)
    expect(sliceUnderPointer(second, 6)).toBe(2)
  })

  it('leaves the rotation alone when there are no slices', () => {
    expect(rotationFor(0, 0, 720)).toBe(720)
  })

  it('honours a custom number of turns', () => {
    const rotation = rotationFor(1, 4, 0, 2)

    expect(rotation).toBeGreaterThanOrEqual(720)
    expect(rotation).toBeLessThan(1080)
    expect(sliceUnderPointer(rotation, 4)).toBe(1)
  })
})

describe('sliceUnderPointer', () => {
  it('reports the first slice at rest', () => {
    expect(sliceUnderPointer(0, 6)).toBe(0)
  })

  it('is unaffected by whole turns', () => {
    expect(sliceUnderPointer(720, 8)).toBe(sliceUnderPointer(0, 8))
  })

  it('returns -1 for a wheel with no slices', () => {
    expect(sliceUnderPointer(100, 0)).toBe(-1)
  })
})
