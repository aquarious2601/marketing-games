/**
 * Works out how far to turn the wheel so a given slice comes to rest under
 * the pointer at the top.
 *
 * Kept apart from the component because this is the one piece of F02 where
 * an arithmetic slip is invisible on screen but makes the game dishonest:
 * the wheel would stop on a slice other than the prize the server drew.
 */

/** Whole turns before settling, so the spin reads as a spin. */
export const DEFAULT_TURNS = 5

/**
 * The face is drawn with slice `i` starting at `i * sweep - 90` degrees, so
 * its centre sits at `i * sweep - 90 + sweep / 2`. The pointer is at the top,
 * which is -90 degrees. Bringing the centre under the pointer therefore means
 * rotating by `-(i * sweep + sweep / 2)`.
 *
 * The result always exceeds `currentRotation`, so the wheel only ever turns
 * forwards — winding backwards to a nearer angle looks broken.
 */
export function rotationFor(
  position: number,
  sliceCount: number,
  currentRotation = 0,
  turns = DEFAULT_TURNS,
): number {
  if (sliceCount <= 0) {
    return currentRotation
  }

  const sweep = 360 / sliceCount
  const target = normalise(-(position * sweep + sweep / 2))
  const current = normalise(currentRotation)
  const delta = normalise(target - current)

  return currentRotation + turns * 360 + delta
}

/**
 * Which slice is under the pointer at a given rotation. The inverse of
 * `rotationFor`, used by the tests to prove the two agree.
 */
export function sliceUnderPointer(rotation: number, sliceCount: number): number {
  if (sliceCount <= 0) {
    return -1
  }

  const sweep = 360 / sliceCount

  // Undo the rotation, then find which slice spans the top.
  const angleAtPointer = normalise(-rotation)

  return Math.floor(angleAtPointer / sweep) % sliceCount
}

function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}
