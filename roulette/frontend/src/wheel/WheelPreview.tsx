import { colourFor } from './palette'
import { useT } from '../i18n/I18nContext'

export interface PreviewSlice {
  key: string
  name: string
  /** Null while the admin is mid-edit and the figure is not yet readable. */
  probability: number | null
}

interface WheelPreviewProps {
  slices: PreviewSlice[]
  /** The admin needs the odds on the face; the player never gets them. */
  showOdds?: boolean
  /** Degrees to rotate the face. Always increases, so the wheel turns forwards. */
  rotation?: number
  /** 0 means move with no animation, for a reduced-motion preference. */
  spinDurationMs?: number
  /** The easing for this phase of the spin. See spinAnimation.ts. */
  spinEasing?: string
  /** Fires when the turn finishes. Never fires when the duration is 0. */
  onSpinEnd?: () => void
  /** The marker the winning slice comes to rest under. */
  showPointer?: boolean
}

const SIZE = 200
const CENTRE = SIZE / 2
const RADIUS = 94
const LABEL_RADIUS = 57

/**
 * The wheel, drawn with every slice the same size whatever its odds (F01 R13).
 *
 * That is the admin's explicit decision, recorded in F01 section 13. It means
 * geometry here carries no information about probability, so when the spin
 * arrives it must pick a winner by weight and then animate to that slice —
 * never the other way round.
 */
export function WheelPreview({
  slices,
  showOdds = false,
  rotation = 0,
  spinDurationMs = 0,
  spinEasing = 'linear',
  onSpinEnd,
  showPointer = false,
}: WheelPreviewProps) {
  const t = useT()
  if (slices.length === 0) {
    return (
      <div
        role="img"
        aria-label={t('game.emptyWheel')}
        className="flex aspect-square w-full items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-sm text-slate-400"
      >
        No prizes yet
      </div>
    )
  }

  const sweep = 360 / slices.length

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full max-w-full"
      role="img"
      aria-label={`Wheel with ${slices.length} ${slices.length === 1 ? 'slice' : 'slices'}`}
      data-testid="wheel-preview"
      data-slice-count={slices.length}
      data-rotation={rotation}
    >
      {/* Only the face turns. The pointer and hub stay put, so the slice
          that comes to rest under the marker is the one that was drawn. */}
      <g
        data-testid="wheel-face"
        onTransitionEnd={onSpinEnd}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CENTRE}px ${CENTRE}px`,
          transition:
            spinDurationMs > 0 ? `transform ${spinDurationMs}ms ${spinEasing}` : 'none',
        }}
      >
        {slices.map((slice, index) => {
          const start = index * sweep - 90
          const colour = colourFor(index)

          return (
            <g key={slice.key} data-testid="wheel-slice" data-colour={colour}>
              <path
                d={slicePath(start, sweep)}
                fill={colour}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
              <SliceLabel
                angle={start + sweep / 2}
                name={slice.name}
                sweep={sweep}
                probability={showOdds ? slice.probability : null}
              />
            </g>
          )
        })}
      </g>

      <circle cx={CENTRE} cy={CENTRE} r={14} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={2} />

      {showPointer && (
        <path
          data-testid="wheel-pointer"
          d={`M ${CENTRE - 9} 2 L ${CENTRE + 9} 2 L ${CENTRE} 22 Z`}
          fill="#0F172A"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function SliceLabel({
  angle,
  name,
  sweep,
  probability,
}: {
  angle: number
  name: string
  sweep: number
  probability: number | null
}) {
  const { x, y } = pointAt(angle, LABEL_RADIUS)

  // Keep text upright on the left half rather than upside down.
  const flipped = angle > 90 && angle < 270
  const rotation = flipped ? angle + 180 : angle

  const label = name.trim() === '' ? 'Unnamed' : name
  const { size, lines } = layOutLabel(label, sweep, probability !== null)

  const leading = size * 1.14
  // Centre the whole block, the percentage included, on the label radius.
  const rows = lines.length + (probability === null ? 0 : 1)
  const first = -((rows - 1) * leading) / 2

  return (
    <text
      x={x}
      y={y}
      transform={`rotate(${rotation} ${x} ${y})`}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#FFFFFF"
      fontSize={size}
      fontWeight={600}
    >
      {/* The full name is always available to assistive technology and on
          hover, even when the visible label is shortened to fit. */}
      <title>{probability === null ? label : `${label} — ${probability}%`}</title>
      {lines.map((line, index) => (
        <tspan key={line + String(index)} x={x} dy={index === 0 ? first : leading}>
          {line}
        </tspan>
      ))}
      {probability !== null && (
        <tspan x={x} dy={leading} fontSize={size * 0.85} fontWeight={400} opacity={0.9}>
          {probability}%
        </tspan>
      )}
    </text>
  )
}

/* -------------------------------------------------------------------------- */
/* Fitting a prize name into a slice                                          */
/* -------------------------------------------------------------------------- */

/*
 * This used to be `label.slice(0, 15) + '…'`, which turned "10% off your next
 * order" into "10% off your ne…" on every wheel at every size. A flat
 * character limit is wrong twice over: characters are not all the same width,
 * and the room a slice has depends on how many slices there are.
 *
 * What a slice actually offers is a *radial* run of space, because the text
 * is rotated to point outwards. That run is the same length whatever the
 * slice count — it is bounded by the hub at one end and the rim at the other.
 * What the slice count changes is the room *across* the slice, which is what
 * decides whether a second line fits. So: fit on one line at full size if the
 * name allows, then trade size and lines away in order until it does.
 *
 * The widths below are an estimate rather than a measurement. Measuring would
 * mean rendering to a canvas, which is a dependency on the DOM in a component
 * that is also server-rendered in tests, for a label that is then rounded to
 * the nearest of four sizes anyway.
 */

/** Advance widths in em, bucketed. A monospace estimate overflowed on "WWW". */
const NARROW = new Set([...' !,.:;\'`ijl|()[]{}/\\ft1'])
const WIDE = new Set([...'ABCDGHKMNOQRSUVWXYZmw%@&'])

function widthOf(text: string): number {
  let width = 0

  for (const character of text) {
    width += NARROW.has(character) ? 0.33 : WIDE.has(character) ? 0.72 : 0.55
  }

  return width
}

interface Fit {
  lines: number
  size: number
  /** User units of radial room the text may occupy. */
  span: number
}

/**
 * What to try, in order, until the name fits. The last entry is also the
 * fallback the name is truncated into when nothing fits.
 *
 * A second line needs room across the slice as well as along it, and that
 * room runs out somewhere around eight slices — so a wide slice trades size
 * for a line early, and a narrow one spends its budget shrinking first and
 * only wraps at the floor, pulled in closer to the rim where the slice is
 * widest.
 */
function fits(sweep: number, singleLineOnly: boolean): readonly Fit[] {
  const single: readonly Fit[] = [
    { lines: 1, size: 8, span: 68 },
    { lines: 1, size: 7, span: 68 },
    { lines: 1, size: 6.2, span: 68 },
  ]

  if (singleLineOnly) {
    return single
  }

  return sweep >= 45
    ? [
        { lines: 1, size: 8, span: 68 },
        { lines: 2, size: 8, span: 60 },
        { lines: 2, size: 7, span: 60 },
        { lines: 2, size: 6.2, span: 60 },
      ]
    : [...single, { lines: 2, size: 6, span: 52 }]
}

function layOutLabel(
  label: string,
  sweep: number,
  showingOdds: boolean,
): { size: number; lines: string[] } {
  const candidates = fits(sweep, showingOdds)

  for (const candidate of candidates) {
    const lines = wrap(label, candidate.span / candidate.size)

    if (lines.length <= candidate.lines) {
      return { size: candidate.size, lines }
    }
  }

  const last = candidates[candidates.length - 1]
  const budget = last.span / last.size
  const lines = wrap(label, budget).slice(0, last.lines)

  // Leave room for the ellipsis itself, which is about one em wide.
  lines[lines.length - 1] = `${trimToWidth(lines[lines.length - 1], budget - 0.9).trimEnd()}…`

  return { size: last.size, lines }
}

/** Greedy word wrap against a width budget in em, hard-breaking long words. */
function wrap(label: string, budget: number): string[] {
  const lines: string[] = []
  let current = ''

  const push = () => {
    // A single word wider than the line gets broken rather than overflowing.
    while (widthOf(current) > budget) {
      const head = trimToWidth(current, budget)
      lines.push(head)
      current = current.slice(head.length)
    }
  }

  for (const word of label.split(/\s+/).filter((part) => part !== '')) {
    if (current === '') {
      current = word
    } else if (widthOf(`${current} ${word}`) <= budget) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }

    push()
  }

  if (current !== '') {
    lines.push(current)
  }

  return lines.length === 0 ? [''] : lines
}

function trimToWidth(text: string, budget: number): string {
  let width = 0

  for (let index = 0; index < text.length; index += 1) {
    width += widthOf(text[index])

    if (width > budget) {
      return text.slice(0, Math.max(1, index))
    }
  }

  return text
}

function pointAt(angleDegrees: number, radius: number): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180

  return {
    x: CENTRE + radius * Math.cos(radians),
    y: CENTRE + radius * Math.sin(radians),
  }
}

function slicePath(startAngle: number, sweep: number): string {
  // A single slice would be a full circle, which an arc cannot express:
  // start and end land on the same point and the path collapses.
  if (sweep >= 360) {
    return [
      `M ${CENTRE} ${CENTRE - RADIUS}`,
      `A ${RADIUS} ${RADIUS} 0 1 1 ${CENTRE - 0.01} ${CENTRE - RADIUS}`,
      'Z',
    ].join(' ')
  }

  const start = pointAt(startAngle, RADIUS)
  const end = pointAt(startAngle + sweep, RADIUS)
  const largeArc = sweep > 180 ? 1 : 0

  return [
    `M ${CENTRE} ${CENTRE}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}
