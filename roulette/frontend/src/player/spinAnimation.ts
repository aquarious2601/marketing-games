import { rotationFor } from './rotation'

/**
 * The three phases of a spin (F03 R1), as a pure state machine.
 *
 * Kept out of the component so the sequence, the angles and the timings can
 * be asserted directly. The animation is decorative — the prize is already
 * drawn and recorded before any of this runs — but it must still always end
 * on the slice the server chose.
 */

export type SpinPhase = 'idle' | 'windup' | 'turn' | 'settle'

/**
 * F03 R3. Fixed, not proportional: a percentage of a five-turn spin would be
 * most of a lap backwards.
 */
export const WINDUP_DEGREES = 12

/**
 * F03 R6. The narrowest slice a wheel can have is 360/12 = 30 degrees, so the
 * pointer sits at worst 15 degrees from the edge of the winning slice when it
 * is centred. Seven degrees of overshoot stays comfortably inside it.
 */
export const OVERSHOOT_DEGREES = 7

export const WINDUP_MS = 450
export const TURN_MS = 4_900
export const SETTLE_MS = 650

/** F03 R7 */
export const TOTAL_SPIN_MS = WINDUP_MS + TURN_MS + SETTLE_MS

const EASING: Record<Exclude<SpinPhase, 'idle'>, string> = {
  // Eased at both ends: a flick back, not a jerk.
  windup: 'cubic-bezier(0.4, 0.0, 0.6, 1.0)',
  // Quick to speed, then a long even slowdown. No variation along the way
  // (F03 R8) — the curve knows nothing about what it is passing.
  turn: 'cubic-bezier(0.12, 0.72, 0.16, 1.0)',
  // Drops back into place and stops.
  settle: 'cubic-bezier(0.33, 0.0, 0.2, 1.0)',
}

export interface SpinAnimation {
  phase: SpinPhase
  /** Where the face should be during this phase. */
  rotation: number
  durationMs: number
  easing: string
  /** The resting angle this spin is heading for. */
  target: number
}

export function atRest(rotation = 0): SpinAnimation {
  return { phase: 'idle', rotation, durationMs: 0, easing: 'none', target: rotation }
}

/**
 * Begins a spin towards `position`.
 *
 * The resting angle is worked out once, from where the wheel is now, so the
 * wind-up cannot shift it. Everything after the wind-up moves forwards
 * (F03 R9), because the target is always at least five whole turns ahead.
 */
export function startSpin(
  current: number,
  position: number,
  sliceCount: number,
): SpinAnimation {
  const target = rotationFor(position, sliceCount, current)

  return {
    phase: 'windup',
    rotation: current - WINDUP_DEGREES,
    durationMs: WINDUP_MS,
    easing: EASING.windup,
    target,
  }
}

/**
 * The next phase once the current one's transition has ended. Returns the
 * resting state when the spin is over.
 */
export function advance(animation: SpinAnimation): SpinAnimation {
  switch (animation.phase) {
    case 'windup':
      return {
        ...animation,
        phase: 'turn',
        rotation: animation.target + OVERSHOOT_DEGREES,
        durationMs: TURN_MS,
        easing: EASING.turn,
      }

    case 'turn':
      return {
        ...animation,
        phase: 'settle',
        rotation: animation.target,
        durationMs: SETTLE_MS,
        easing: EASING.settle,
      }

    case 'settle':
      return atRest(animation.target)

    case 'idle':
      return animation
  }
}

/** True once the wheel has stopped and the result may be revealed (F03 R11). */
export function isFinished(animation: SpinAnimation): boolean {
  return animation.phase === 'idle'
}

export function isSpinning(animation: SpinAnimation): boolean {
  return animation.phase !== 'idle'
}
