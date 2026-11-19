import { describe, expect, it } from 'vitest'
import { MAX_PRIZES, MIN_PRIZES } from './editor'
import { sliceUnderPointer } from './rotation'
import {
  OVERSHOOT_DEGREES,
  SETTLE_MS,
  TOTAL_SPIN_MS,
  TURN_MS,
  WINDUP_DEGREES,
  WINDUP_MS,
  advance,
  atRest,
  isFinished,
  isSpinning,
  startSpin,
  type SpinAnimation,
} from './spinAnimation'

/** Runs a spin to completion, collecting every phase it passes through. */
function phasesOf(current: number, position: number, sliceCount: number): SpinAnimation[] {
  const steps: SpinAnimation[] = [startSpin(current, position, sliceCount)]

  while (!isFinished(steps[steps.length - 1])) {
    steps.push(advance(steps[steps.length - 1]))

    if (steps.length > 10) {
      throw new Error('The spin never finished.')
    }
  }

  return steps
}

describe('the phase sequence', () => {
  /** F03 R1 */
  it('runs wind-up, turn, settle, then stops', () => {
    const phases = phasesOf(0, 2, 6).map((step) => step.phase)

    expect(phases).toEqual(['windup', 'turn', 'settle', 'idle'])
  })

  /** F03 R2 */
  it('winds backwards before turning', () => {
    const [windup] = phasesOf(0, 2, 6)

    expect(windup.rotation).toBeLessThan(0)
    expect(windup.rotation).toBe(-WINDUP_DEGREES)
  })

  /**
   * F03 R3. The whole point of a fixed angle: as a proportion of a five-turn
   * spin, even 1% would be most of a lap backwards.
   */
  it('winds back by the same fixed angle however far it has to travel', () => {
    const fewSlices = startSpin(0, 0, 2)
    const manySlices = startSpin(5_000, 11, 12)

    expect(fewSlices.rotation).toBe(0 - WINDUP_DEGREES)
    expect(manySlices.rotation).toBe(5_000 - WINDUP_DEGREES)
  })

  /** F03 R4, R5 */
  it('overshoots on the turn and comes back on the settle', () => {
    const [, turn, settle] = phasesOf(0, 3, 8)

    expect(turn.rotation).toBe(turn.target + OVERSHOOT_DEGREES)
    expect(settle.rotation).toBe(settle.target)
  })

  /** F03 R9 */
  it('only moves forwards after the wind-up, apart from the settle', () => {
    const [windup, turn, settle] = phasesOf(0, 4, 6)

    expect(turn.rotation).toBeGreaterThan(windup.rotation)
    expect(settle.rotation).toBeLessThan(turn.rotation)
    expect(settle.rotation).toBeGreaterThan(windup.rotation)
  })

  it('keeps the same resting target through every phase', () => {
    const steps = phasesOf(123, 1, 5)
    const targets = new Set(steps.slice(0, 3).map((step) => step.target))

    expect(targets.size).toBe(1)
  })

  it('does nothing when advanced while idle', () => {
    const idle = atRest(42)

    expect(advance(idle)).toEqual(idle)
  })
})

describe('where the wheel comes to rest', () => {
  /** F03 R10 */
  it('finishes on the slice the server drew, for every wheel size', () => {
    for (let count = MIN_PRIZES; count <= MAX_PRIZES; count += 1) {
      for (let position = 0; position < count; position += 1) {
        const steps = phasesOf(0, position, count)
        const final = steps[steps.length - 1]

        expect(
          sliceUnderPointer(final.rotation, count),
          `A ${count}-slice wheel drawn on ${position} came to rest on ${sliceUnderPointer(final.rotation, count)}.`,
        ).toBe(position)
      }
    }
  })

  /**
   * F03 R6. During the overshoot the pointer must not stray onto the next
   * slice, or the player sees the wrong prize for a moment before it rocks
   * back — which looks exactly like a rigged correction.
   */
  it('keeps the pointer inside the winning slice during the overshoot', () => {
    for (let count = MIN_PRIZES; count <= MAX_PRIZES; count += 1) {
      for (let position = 0; position < count; position += 1) {
        const [, turn] = phasesOf(0, position, count)

        expect(
          sliceUnderPointer(turn.rotation, count),
          `On a ${count}-slice wheel the overshoot left the winning slice.`,
        ).toBe(position)
      }
    }
  })

  it('overshoots by less than half of the narrowest possible slice', () => {
    const narrowestSliceDegrees = 360 / MAX_PRIZES

    expect(OVERSHOOT_DEGREES).toBeLessThan(narrowestSliceDegrees / 2)
  })

  it('still lands correctly when spinning again from a previous rotation', () => {
    const first = phasesOf(0, 2, 6)
    const restingAfterFirst = first[first.length - 1].rotation

    const second = phasesOf(restingAfterFirst, 5, 6)
    const final = second[second.length - 1]

    expect(sliceUnderPointer(final.rotation, 6)).toBe(5)
    expect(final.rotation).toBeGreaterThan(restingAfterFirst)
  })
})

describe('timing', () => {
  /** F03 R7 */
  it('takes about six seconds in total', () => {
    const steps = phasesOf(0, 1, 6)
    const total = steps.reduce((sum, step) => sum + step.durationMs, 0)

    expect(total).toBe(TOTAL_SPIN_MS)
    expect(total).toBeGreaterThanOrEqual(5_500)
    expect(total).toBeLessThanOrEqual(6_500)
  })

  it('gives each phase its own duration', () => {
    const [windup, turn, settle] = phasesOf(0, 1, 6)

    expect(windup.durationMs).toBe(WINDUP_MS)
    expect(turn.durationMs).toBe(TURN_MS)
    expect(settle.durationMs).toBe(SETTLE_MS)
  })

  it('spends most of the time on the turn', () => {
    expect(TURN_MS).toBeGreaterThan(WINDUP_MS + SETTLE_MS)
  })

  /** F03 R8 — one curve for the whole turn, blind to what it passes */
  it('uses a single easing for the whole turn', () => {
    const [, turn] = phasesOf(0, 1, 6)

    expect(turn.easing).toMatch(/^cubic-bezier\(/)
    expect(turn.easing).not.toContain('steps')
  })

  it('gives the phases distinct easings', () => {
    const [windup, turn, settle] = phasesOf(0, 1, 6)

    expect(new Set([windup.easing, turn.easing, settle.easing]).size).toBe(3)
  })
})

describe('state helpers', () => {
  it('reports spinning for every phase but idle', () => {
    const steps = phasesOf(0, 1, 6)

    expect(steps.slice(0, 3).every(isSpinning)).toBe(true)
    expect(isSpinning(steps[3])).toBe(false)
  })

  it('starts at rest', () => {
    expect(isFinished(atRest())).toBe(true)
    expect(atRest(99).rotation).toBe(99)
  })
})
