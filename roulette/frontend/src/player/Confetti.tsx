import { SLICE_COLOURS } from '../wheel/palette'

/**
 * F22: the seconds after the wheel stops on a prize.
 *
 * Hand-built rather than a confetti library. `canvas-confetti` is the
 * obvious choice and is about 25KB on a page whose whole point is loading
 * fast on a stranger's phone at a stall — and elements animating
 * `transform` and `opacity` are composited by the GPU, so this costs
 * little and carries the campaign's own colours for free (F22 R7).
 *
 * Decoration, and nothing else: `aria-hidden` and `pointer-events-none`
 * (F22 R9, R10). What was won is announced by the result panel's
 * `role="status"`, which already says it properly.
 *
 * Rendered outside `wheel-stage` by its caller, because an animation in
 * there would bubble into the spin's phase handler (F03 R1).
 *
 * Each piece is two elements, and the reason is the whole trick:
 *
 *   track  — full height of the card, carries the fall and the sway
 *   piece  — the coloured shape, carries the tumble
 *
 * A percentage in `translate` resolves against the *element's own* size,
 * not its container. The first version animated the shape itself from
 * `-140%` to `115%`, which moved a 14px piece about 36px inside a 304px
 * card — a burst entirely hidden behind the result panel, which is exactly
 * how it looked. Giving the track `height: 100%` makes those percentages
 * the card's height, which is what they were always meant to be.
 */

/**
 * F22 R8. The longest a piece can be on screen: the slowest delay plus the
 * slowest fall, and the moment the whole thing is removed from the
 * document.
 */
export const CELEBRATION_MS = 5200

/** F22 R6. Enough to read as a shower rather than a handful. */
const PIECES = 30

/**
 * F22 R7. The wheel's own slice colours, with the campaign's accent mixed
 * through them.
 *
 * It used theme tokens alone at first, and on the birthday theme that is
 * six shades of pink falling onto a pink card — present, invisible, and
 * exactly as disappointing as it sounds. SLICE_COLOURS are the twelve the
 * player has just spent six seconds watching go round, every one of them
 * contrast-checked, so they read against any card the themes produce and
 * still belong to this game rather than to a confetti library.
 */
const COLOURS = [...SLICE_COLOURS, 'var(--accent)', 'var(--heading)']

/**
 * Deterministic, not random.
 *
 * Randomness would re-roll on every render, for a variation nobody sees —
 * each player watches this once — and would make the effect impossible to
 * reason about or test. This is the usual sine hash: scattered to the eye,
 * identical on every run.
 */
function scatter(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453

  return x - Math.floor(x)
}

/**
 * Positions spread by the golden ratio rather than by the hash.
 *
 * A hash clumps: with thirty pieces you get bare stripes and pile-ups. The
 * golden ratio fills the width evenly however many there are, and the hash
 * then varies everything else so it still looks thrown rather than ruled.
 */
const GOLDEN = 0.618033988749895

const CONFETTI = Array.from({ length: PIECES }, (_, i) => {
  const a = scatter(i + 1)
  const b = scatter(i + 97)
  const c = scatter(i + 211)

  // A sixth of them are round, so the shower is not all one shape.
  const round = c > 0.82

  return {
    left: ((i + 1) * GOLDEN * 100) % 100,
    // Spread across the first second and a half, so it keeps arriving
    // rather than dropping as one curtain.
    delayMs: Math.round(a * 1400),
    fallMs: 2600 + Math.round(b * 1200),
    // How far it wanders sideways on the way down.
    drift: Math.round((a - 0.5) * 70),
    spin: Math.round((b - 0.5) * 1440),
    colour: COLOURS[i % COLOURS.length],
    width: round ? 7 + Math.round(c * 4) : 5 + Math.round(c * 5),
    height: round ? 7 + Math.round(c * 4) : 10 + Math.round(b * 8),
    radius: round ? '50%' : '1px',
  }
})

export function Confetti() {
  return (
    <div
      aria-hidden="true"
      data-testid="confetti"
      className="player-confetti pointer-events-none absolute inset-0 overflow-hidden"
    >
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className="player-confetti-track"
          style={
            {
              left: `${piece.left}%`,
              // Read by the keyframes in index.css. Custom properties rather
              // than a style block per piece, so the motion lives with the
              // rest of the animations and only the numbers live here.
              '--confetti-fall': `${piece.fallMs}ms`,
              '--confetti-delay': `${piece.delayMs}ms`,
              '--confetti-drift': `${piece.drift}px`,
              '--confetti-spin': `${piece.spin}deg`,
            } as React.CSSProperties
          }
        >
          <i
            className="player-confetti-piece"
            style={{
              width: `${piece.width}px`,
              height: `${piece.height}px`,
              borderRadius: piece.radius,
              backgroundColor: piece.colour,
            }}
          />
        </span>
      ))}
    </div>
  )
}
