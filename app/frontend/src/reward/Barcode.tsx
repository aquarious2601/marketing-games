import { QUIET_ZONE, encode } from './code128'

/**
 * A reward code as a scannable barcode (F33 R5 to R9).
 *
 * Inline SVG rather than an image: nothing to fetch, nothing to cache badly
 * behind a code that belongs to one customer, and sharp at whatever size the
 * panel gives it — which matters, because a blurred bar is an unread bar.
 */

/**
 * The viewBox is measured in modules horizontally, so a rectangle's width is
 * simply its width in the standard's own units. Vertically it is arbitrary:
 * `preserveAspectRatio="none"` stretches the symbol to whatever height the
 * class gives it, which is exactly what a barcode wants and what no other
 * drawing does.
 */
const HEIGHT_UNITS = 10

type Props = {
  code: string
  /** The height of the bars. R8's floor is 48px at 375px. */
  className?: string
  /**
   * Classes for the white tile, for a panel that has to lend the barcode
   * width it does not have to spare. The horizontal padding lives here
   * rather than in the tile's own class list, because two Tailwind paddings
   * on one element resolve by stylesheet order rather than by which one was
   * passed.
   */
  tile?: string
}

export function Barcode({ code, className = 'h-14', tile = 'px-2' }: Props) {
  const elements = encode(code)

  /*
   * R10. An issued code cannot fail to encode, so this is the bug case — and
   * the one thing that must not happen is half a symbol, because a scanner
   * that reads half a code reads a different code. The characters under it
   * (R3) are what the counter falls back to.
   */
  if (null === elements) {
    return null
  }

  const modules = elements.reduce((total, width) => total + width, 0) + QUIET_ZONE * 2
  const bars: Array<{ x: number; width: number }> = []

  // Bar first, then alternating, which is why an even index is a bar.
  let x = QUIET_ZONE

  elements.forEach((width, index) => {
    if (0 === index % 2) {
      bars.push({ x, width })
    }

    x += width
  })

  return (
    <span
      data-testid="reward-barcode"
      /*
       * R6. Black on white, written as literal colours rather than theme
       * variables, and this is the one element on the player page that does
       * that on purpose: every theme is dark (F06), and a scanner wants the
       * contrast of ink on paper. The padding is white too, so the quiet
       * zone (R7) is quiet whatever is behind the panel.
       */
      className={`block rounded-md bg-white py-1.5 ${tile}`}
    >
      <svg
        viewBox={`0 0 ${modules} ${HEIGHT_UNITS}`}
        preserveAspectRatio="none"
        role="img"
        /* R9. The code, so a screen reader reads it instead of saying "image". */
        aria-label={code}
        className={`block w-full ${className}`}
      >
        {/* The tile behind the bars, quiet zones included (R7). */}
        <rect x="0" y="0" width={modules} height={HEIGHT_UNITS} fill="#ffffff" />
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y="0"
            width={bar.width}
            height={HEIGHT_UNITS}
            fill="#000000"
          />
        ))}
      </svg>
    </span>
  )
}
