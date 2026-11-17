import { sceneNameFor, type ThemeName } from './themes'

/**
 * The scenery behind the player page — one layered scene per theme (F04 R9,
 * rebuilt 2026-11-15 to the craft level of the owner's reference art).
 *
 * ## What "expensive" turned out to mean
 *
 * The reference the owner supplied is a gold-and-cream party background, and
 * the reason it reads as expensive rather than as clip-art is five things,
 * none of which is the subject matter:
 *
 * 1. **Volume.** Nothing is a flat fill. Every object has a broad body
 *    gradient, a specular highlight offset from its centre, a darker rim, and
 *    a faint reflected light on the shadow side. Four tones, one light source.
 * 2. **Depth.** Objects run large and crisp at the front to small and faded at
 *    the back. Nothing is uniform in size or opacity.
 * 3. **Bokeh.** A field of soft translucent discs at many sizes, overlapping,
 *    some bright-edged rings, suggesting an out-of-focus light field.
 * 4. **Sparkle.** A handful of four-point glints at near-white, used sparsely.
 * 5. **A narrow hue and a wide value range.** It is nearly monochrome and runs
 *    from white to deep amber. Rainbow decoration is what cheap looks like.
 *
 * And one piece of composition: the busy content hugs the top and the edges,
 * and the middle is calm, because that is where the message goes. Our message
 * is the card, dead centre, so every scene here keeps its middle quiet.
 *
 * ## The rules this file plays by
 *
 * - **Nothing here is ever behind text.** Every word on the page sits on the
 *   card, the button or the result panel, all of which are opaque tokens from
 *   themes.ts and all of which are contrast-tested. That is what lets these
 *   layers use soft light and translucency freely: none of it can change the
 *   colour under a letter.
 * - **Decoration only, and it says so.** The root is `aria-hidden` and
 *   `pointer-events-none`, and the player page stacks it below the content, so
 *   it can never intercept a tap on Spin.
 * - **Transform and opacity, nothing else.** No blur filters, no canvas, no
 *   JavaScript loop. These run on a cheap phone at the same time as a
 *   six-second spin, and a repaint-per-frame layer would cost the spin its
 *   smoothness. Soft edges come from gradients, which rasterise once, rather
 *   than from `filter: blur()`, which does not. The bokeh is the obvious place
 *   that rule would have been broken — blurring discs is the easy way to fake
 *   it — so the discs are gradients with soft stops, and a whole field of them
 *   is *one* element with one stack of background layers.
 * - **Ambient motion stops for `prefers-reduced-motion`.** The `scene-*`
 *   classes only carry an animation inside a `no-preference` block in
 *   index.css, so a reduced-motion player gets the same scene, still. Every
 *   scene is composed to look finished standing still. The spin itself
 *   deliberately ignores that preference (F03 §13); that exception is for the
 *   thing the player asked for by pressing a button, not for snow falling at
 *   them unbidden.
 * - **No assets.** CSS gradients and inline SVG, so there is nothing to load,
 *   nothing to cache-bust and nothing to go missing at a market stall on a
 *   bad connection. The reference image itself is licensed stock and a 1.4MB
 *   JPEG; what is reproduced here is its technique, not its pixels.
 */

interface ThemeSceneProps {
  theme?: string | null
}

export function ThemeScene({ theme }: ThemeSceneProps) {
  const name = sceneNameFor(theme)

  return (
    <div
      aria-hidden="true"
      data-testid="theme-scene"
      data-scene={name}
      /* `--scene-scale` is how one set of numbers covers a 375px phone and a
         1280px monitor. Every decorative size in this file is written at
         phone scale and multiplied by it, so a desktop gets bigger balloons
         and wider bokeh rather than the same small ones adrift in more
         space — which is what the first cut looked like. */
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [--scene-scale:1] sm:[--scene-scale:1.2] lg:[--scene-scale:1.45] xl:[--scene-scale:1.65]"
    >
      {SCENES[name]()}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

const FILL = 'pointer-events-none absolute inset-0'

/**
 * A colour as an `r g b` triple.
 *
 * Decorative layers need the same hue at a dozen different alphas, and a
 * theme token is an opaque six-digit hex by design (see themes.ts) with no
 * way to take a slice of it. These literals never sit behind a word, so they
 * are outside the contrast contract the tokens live under.
 */
type Rgb = string

const WHITE: Rgb = '255 255 255'

/**
 * A decorative length, written at phone scale and multiplied by the scene's
 * `--scene-scale` so it grows with the viewport. Used for everything with a
 * size in this file; percentages and viewport units take care of themselves.
 */
function scaled(pixels: number): string {
  return `calc(${pixels}px * var(--scene-scale))`
}

/**
 * The edges of the page falling away to `--bg-deep`.
 *
 * Every scene ends with one. It is what stops a flat background colour from
 * reading as "unstyled": the eye is drawn to the middle, where the wheel is.
 */
function Vignette({ opacity = 1, from = '38%' }: { opacity?: number; from?: string }) {
  return (
    <div
      className={FILL}
      style={{
        background: `radial-gradient(125% 85% at 50% 42%, transparent ${from}, var(--bg-deep) 100%)`,
        opacity,
      }}
    />
  )
}

/** A soft pool of light. The workhorse of every scene. */
function Glow({
  colour,
  at,
  size,
  opacity,
  reach = '68%',
}: {
  colour: string
  /** CSS `background-position`-ish anchor, e.g. '50% 46%'. */
  at: string
  /** The gradient's extent, e.g. '90% 70%'. */
  size: string
  opacity: number
  reach?: string
}) {
  return (
    <div
      className={FILL}
      style={{
        background: `radial-gradient(${size} at ${at}, ${colour} 0%, transparent ${reach})`,
        opacity,
      }}
    />
  )
}

/**
 * A hairline across the top of the page, fading out at both ends.
 *
 * The cheapest signal that someone designed this: a page whose top edge is a
 * deliberate line rather than where the colour happens to start.
 */
function TopRule({ height = 2, opacity = 0.75 }: { height?: number; opacity?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{
        height,
        background:
          'linear-gradient(90deg, transparent 0%, var(--accent) 22%, var(--accent-soft) 50%, var(--accent) 78%, transparent 100%)',
        opacity,
      }}
    />
  )
}

/**
 * A low-contrast ray burst radiating from a point behind the content.
 *
 * Lifted from the Black Friday stock sheets the owner pointed at, where it is
 * everywhere: near-black wedges a value or two apart, converging on the
 * headline. It gives a flat dark field structure and a focal point without
 * adding a single new hue, and it costs one element. The stops are soft
 * rather than hard because a conic gradient with a hard edge shimmers as it
 * resamples on a phone.
 *
 * Always drawn *before* the middle glows, so those flatten the rays back out
 * where the card sits and the busy part stays at the edges.
 */
function Sunburst({
  colour,
  alpha,
  at = '50% 46%',
  wedges = 26,
  opacity = 1,
}: {
  colour: Rgb
  alpha: number
  at?: string
  wedges?: number
  opacity?: number
}) {
  const step = 360 / wedges
  const half = (step / 2).toFixed(3)
  const full = step.toFixed(3)

  return (
    <div
      className={FILL}
      style={{
        background: `repeating-conic-gradient(from -8deg at ${at}, rgb(${colour} / 0) 0deg, rgb(${colour} / ${alpha}) ${half}deg, rgb(${colour} / 0) ${full}deg)`,
        opacity,
      }}
    />
  )
}

/**
 * A faceted dark surface along the bottom of the page.
 *
 * The other thing those sheets do constantly: a low-poly field of near-black
 * facets a couple of values apart, which turns a flat dark edge into a
 * polished surface the subject is standing on. Flat fills are correct here —
 * a facet is flat by definition, and the volume comes from the values between
 * neighbours, which is the cheapest volume in this whole file.
 */
function FacetedFloor({
  height,
  columns = 13,
  shades,
  edge,
  opacity,
}: {
  height: number
  columns?: number
  /** Four near-page-colour values, light to dark. */
  shades: readonly string[]
  /** The hairline catching the light along the crest. */
  edge: string
  opacity: number
}) {
  const width = 400
  const step = width / columns
  // Deterministic, and irregular enough that the eye reads rock rather than
  // a sawtooth. Math.sin of a non-rational step never repeats over 14 terms.
  const crest = Array.from(
    { length: columns + 1 },
    (_, index) => height * (0.5 - 0.17 * Math.sin(index * 1.73)),
  )

  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 w-full"
      style={{ height: scaled(height), opacity }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="presentation"
    >
      {crest.slice(0, -1).map((top, index) => {
        const left = index * step
        const right = left + step
        const next = crest[index + 1]
        const mid = (left + right) / 2

        return (
          <g key={left}>
            <polygon
              points={`${left},${top.toFixed(1)} ${mid},${next.toFixed(1)} ${mid},${height} ${left},${height}`}
              fill={shades[index % shades.length]}
            />
            <polygon
              points={`${mid},${next.toFixed(1)} ${right},${next.toFixed(1)} ${right},${height} ${mid},${height}`}
              fill={shades[(index + 2) % shades.length]}
            />
            <polyline
              points={`${left},${top.toFixed(1)} ${mid},${next.toFixed(1)} ${right},${next.toFixed(1)}`}
              fill="none"
              stroke={edge}
              strokeWidth={0.7}
              opacity={0.45}
            />
          </g>
        )
      })}
    </svg>
  )
}

/* -- Bokeh ---------------------------------------------------------------- */

/**
 * One out-of-focus light: `[x%, y%, radius px, alpha, ring?]`.
 *
 * A ring is a disc with its middle cut out and its edge left bright, which is
 * what a real lens does to a point source at the edge of its depth of field.
 * Mixing the two is most of why a bokeh field reads as photographic.
 */
type Disc = readonly [x: number, y: number, radius: number, alpha: number, ring?: 1]

/**
 * A whole bokeh field as a single stack of background layers.
 *
 * One element and one raster for twenty discs. The alternative — a div per
 * disc — is twenty composited layers on a phone that is also running a
 * six-second spin, for no visible gain.
 */
function bokehLayers(discs: readonly Disc[], colour: Rgb): string {
  return discs
    .map(([x, y, radius, alpha, ring]) =>
      ring === 1
        ? `radial-gradient(circle ${scaled(radius)} at ${x}% ${y}%, rgb(${colour} / 0) 0 54%, rgb(${colour} / ${alpha}) 72%, rgb(${colour} / ${(alpha * 0.4).toFixed(3)}) 84%, rgb(${colour} / 0) 94%)`
        : `radial-gradient(circle ${scaled(radius)} at ${x}% ${y}%, rgb(${colour} / ${alpha}) 0 28%, rgb(${colour} / ${(alpha * 0.5).toFixed(3)}) 58%, rgb(${colour} / 0) 88%)`,
    )
    .join(', ')
}

function Bokeh({
  discs,
  colour,
  opacity = 1,
  drift,
}: {
  discs: readonly Disc[]
  colour: Rgb
  opacity?: number
  /** Seconds for a slow vertical float, or nothing for a still field. */
  drift?: number
}) {
  return (
    <div
      className={drift === undefined ? FILL : `scene-bob ${FILL}`}
      style={
        {
          backgroundImage: bokehLayers(discs, colour),
          opacity,
          '--scene-shift': '-14px',
          '--scene-duration': `${drift ?? 0}s`,
        } as React.CSSProperties
      }
    />
  )
}

/* -- Sparkle -------------------------------------------------------------- */

/** A small bright point: `[x%, y%, radius px, alpha]`. */
type Glint = readonly [x: number, y: number, radius: number, alpha: number]

/**
 * The small sparkle: a white core with a coloured halo, many to one element.
 *
 * These are the sparse high-brightness accents the reference uses. They are
 * only convincing when there are few of them and they are genuinely the
 * brightest thing on the page, so every scene keeps the count in single
 * figures.
 */
function Glints({
  points,
  colour,
  opacity = 1,
  twinkle,
}: {
  points: readonly Glint[]
  colour: Rgb
  opacity?: number
  twinkle?: { seconds: number; dim: number }
}) {
  return (
    <div
      className={twinkle === undefined ? FILL : `scene-twinkle ${FILL}`}
      style={
        {
          backgroundImage: points
            .map(
              ([x, y, radius, alpha]) =>
                `radial-gradient(circle ${scaled(radius)} at ${x}% ${y}%, rgb(${WHITE} / ${alpha}) 0 14%, rgb(${colour} / ${(alpha * 0.75).toFixed(3)}) 34%, rgb(${colour} / 0) 100%)`,
            )
            .join(', '),
          opacity,
          '--scene-dim': twinkle?.dim ?? 0.35,
          '--scene-lit': opacity,
          '--scene-duration': `${twinkle?.seconds ?? 0}s`,
        } as React.CSSProperties
      }
    />
  )
}

/**
 * The big sparkle: a four-point star glint.
 *
 * Drawn rather than faked with crossed rectangles, because the whole effect
 * is in the taper — the rays have to go from a fat core to a needle point, and
 * a rectangle with a gradient on it goes from fat to transparent instead,
 * which reads as a smudge.
 */
function Starburst({
  at,
  size,
  colour,
  opacity,
  delay,
  still = false,
}: {
  at: React.CSSProperties
  size: number
  colour: string
  opacity: number
  delay?: number
  /** Plain never twinkles; stillness is the whole idea of that theme. */
  still?: boolean
}) {
  return (
    <div
      className={still ? 'pointer-events-none absolute' : 'scene-twinkle pointer-events-none absolute'}
      style={
        {
          ...at,
          width: scaled(size),
          height: scaled(size),
          opacity,
          ...(delay === undefined ? {} : animationDelay(delay)),
          '--scene-dim': (opacity * 0.4).toFixed(2),
          '--scene-lit': opacity,
          '--scene-duration': '4.5s',
        } as React.CSSProperties
      }
    >
      <svg viewBox="-12 -12 24 24" className="h-full w-full" role="presentation">
        <path
          d="M0 -12 C 0.8 -4 4 -0.8 12 0 C 4 0.8 0.8 4 0 12 C -0.8 4 -4 0.8 -12 0 C -4 -0.8 -0.8 -4 0 -12 Z"
          fill={colour}
        />
        <path
          d="M0 -5 C 0.4 -1.8 1.8 -0.4 5 0 C 1.8 0.4 0.4 1.8 0 5 C -0.4 1.8 -1.8 0.4 -5 0 C -1.8 -0.4 -0.4 -1.8 0 -5 Z"
          fill="#FFFFFF"
        />
      </svg>
    </div>
  )
}

/* -- Volume --------------------------------------------------------------- */

/**
 * The four tones every solid object in the reference is built from.
 *
 * `light` is where the light source hits, `body` is the local colour, `deep`
 * is the turn away from the light, `rim` is the dark edge that separates the
 * object from what is behind it, and `bounce` is the light the surroundings
 * throw back onto the shadow side. Leave `bounce` out and the object reads as
 * a sticker; it is the cheapest of the five and does the most work.
 */
interface Skin {
  light: string
  body: string
  deep: string
  rim: string
  bounce: string
}

/**
 * A sphere, as one element.
 *
 * Four background layers in the painter's order a renderer would use: rim,
 * body, bounce, specular. Used for baubles, for the Black Friday product
 * spheres and for anything else that needs to be round and lit.
 */
function Orb({
  at,
  size,
  skin,
  opacity = 1,
  className = '',
  style,
}: {
  at: React.CSSProperties
  size: number
  skin: Skin
  opacity?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full ${className}`}
      style={{
        ...at,
        width: scaled(size),
        height: scaled(size),
        opacity,
        backgroundImage: [
          // Specular: small, offset up-left, and the only near-white here.
          `radial-gradient(circle at 33% 27%, rgb(${WHITE} / 0.92) 0%, rgb(${WHITE} / 0.32) 7%, rgb(${WHITE} / 0) 20%)`,
          // Bounce light on the shadow side, low and to the right.
          `radial-gradient(circle at 74% 82%, ${skin.bounce} 0%, transparent 42%)`,
          // Body and rim.
          `radial-gradient(circle at 36% 30%, ${skin.light} 0%, ${skin.body} 34%, ${skin.deep} 74%, ${skin.rim} 100%)`,
        ].join(', '),
        ...style,
      }}
    />
  )
}

/* -- Tiled fields --------------------------------------------------------- */

type Dot = readonly [x: number, y: number, radius: number]

/**
 * A tileable field of dots — snow, stars, sparks — as one painted layer.
 *
 * One element and one raster for a whole sky, instead of a DOM node per star.
 * Positions are percentages of the tile, so the field repeats seamlessly and
 * a layer can be slid by exactly one tile to loop.
 */
function dotField(dots: readonly Dot[], colour: string): string {
  return dots
    .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, ${colour} 0 99%, transparent)`)
    .join(', ')
}

/** The same, with a soft edge: a flake near the lens rather than far away. */
function softDotField(dots: readonly Dot[], colour: Rgb, alpha: number): string {
  return dots
    .map(
      ([x, y, r]) =>
        `radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgb(${colour} / ${alpha}) 0 42%, rgb(${colour} / ${(alpha * 0.45).toFixed(3)}) 70%, rgb(${colour} / 0) 100%)`,
    )
    .join(', ')
}

/**
 * A falling field: tall enough to overhang the page top and bottom, so the
 * loop never shows an empty edge. `--scene-shift` must equal the tile height
 * for the slide to be invisible.
 */
function FallingField({
  image,
  tile,
  seconds,
  opacity,
}: {
  image: string
  tile: number
  seconds: number
  opacity: number
}) {
  return (
    <div
      className="scene-fall pointer-events-none absolute inset-x-0"
      style={
        {
          top: -tile,
          height: `calc(100% + ${tile * 2}px)`,
          backgroundImage: image,
          backgroundSize: `${tile}px ${tile}px`,
          opacity,
          '--scene-shift': `${tile}px`,
          '--scene-duration': `${seconds}s`,
        } as React.CSSProperties
      }
    />
  )
}

const SNOW_NEAR: readonly Dot[] = [
  [8, 6, 2.6],
  [27, 18, 1.8],
  [44, 4, 3],
  [61, 22, 2],
  [78, 11, 2.4],
  [93, 27, 1.6],
  [16, 41, 2.2],
  [37, 55, 2.8],
  [56, 44, 1.8],
  [71, 61, 2.3],
  [88, 49, 2],
  [4, 68, 2.5],
  [24, 82, 1.8],
  [49, 76, 2.7],
  [67, 91, 2],
  [83, 73, 2.2],
]

const SNOW_FAR: readonly Dot[] = [
  [13, 12, 1],
  [34, 31, 1.1],
  [52, 9, 0.9],
  [69, 37, 1],
  [86, 19, 1.1],
  [21, 58, 1],
  [41, 74, 0.9],
  [58, 63, 1.1],
  [77, 85, 1],
  [95, 67, 0.9],
]

const STARS: readonly Dot[] = [
  [6, 9, 1.2],
  [19, 24, 0.9],
  [31, 7, 1.4],
  [43, 19, 1],
  [57, 5, 1.2],
  [68, 21, 0.9],
  [81, 12, 1.3],
  [92, 26, 1],
  [11, 38, 1],
  [26, 47, 0.9],
  [74, 41, 1.1],
  [88, 52, 0.9],
]

/* -------------------------------------------------------------------------- */
/* Plain — paper, pearl and light                                             */
/* -------------------------------------------------------------------------- */

/**
 * The year-round default, and the hardest one: it has to look chosen without
 * choosing a season, and "restrained" is one wrong move away from "unstyled".
 *
 * So it gets the full treatment and spends it all on one hue: cool white. A
 * studio light from above, three pearl spheres lit by it, a bokeh field at
 * barely-there alpha, and a drawing grid you feel rather than see. The value
 * range runs from pure white to slate; the hue range is nothing at all. No
 * motion either — stillness is what makes it read as expensive rather than
 * festive.
 */
const PEARL: Skin = {
  light: '#FFFFFF',
  body: '#F3F6FB',
  deep: '#DCE4EF',
  rim: '#C3CEDE',
  bounce: 'rgb(255 255 255 / 0.55)',
}

const PLAIN_BOKEH: readonly Disc[] = [
  [8, 10, 150, 0.5],
  [22, 4, 90, 0.34, 1],
  [38, 14, 60, 0.3],
  [63, 6, 110, 0.4, 1],
  [82, 12, 70, 0.32],
  [95, 24, 130, 0.36],
  [4, 34, 80, 0.26, 1],
  [12, 88, 160, 0.34],
  [33, 96, 100, 0.26, 1],
  [58, 92, 70, 0.22],
  [78, 86, 140, 0.3],
  [96, 70, 90, 0.24, 1],
]

function PlainScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            'linear-gradient(176deg, #E6EDF6 0%, #FAFCFE 26%, var(--bg) 48%, #E9EFF7 78%, var(--bg-deep) 100%)',
        }}
      />

      {/* The studio light. Everything below is lit from here, up and left. */}
      <Glow colour="#FFFFFF" at="42% -4%" size="120% 62%" opacity={0.85} reach="62%" />

      {/* Slate first, white over it. On a page this light the only bokeh that
          can read is the kind that is *darker* than the field, and the only
          thing that makes the white pass visible is having it to sit on. */}
      <Bokeh discs={PLAIN_BOKEH} colour="148 163 184" opacity={0.3} />
      <Bokeh discs={PLAIN_BOKEH} colour={WHITE} opacity={0.8} />

      {/* Three pearls, large to small and crisp to faint: the depth cue the
          whole look rests on. The big one is cropped by the page edge, which
          is what stops it reading as a logo. */}
      <Orb at={{ left: '-7%', top: '-9%' }} size={230} skin={PEARL} opacity={0.9} />
      <Orb
        at={{ right: '-4%', top: '6%' }}
        size={150}
        skin={PEARL}
        opacity={0.62}
        className="hidden sm:block"
      />
      <Orb at={{ left: '9%', bottom: '-6%' }} size={110} skin={PEARL} opacity={0.4} />

      {/* Graph paper from a studio pad. At 3.5% it is felt rather than seen;
          any stronger and it fights the wheel. */}
      <div
        className={FILL}
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, var(--accent) 0 1px, transparent 1px 34px),
                            repeating-linear-gradient(90deg, var(--accent) 0 1px, transparent 1px 34px)`,
          opacity: 0.035,
        }}
      />

      <Glow colour="var(--accent-soft)" at="92% 92%" size="55% 42%" opacity={0.18} />

      {/* Two glints and no more. Plain is allowed one bright moment. */}
      <Starburst at={{ left: '26%', top: '15%' }} size={22} colour="#FFFFFF" opacity={0.8} still />
      <Starburst at={{ right: '18%', bottom: '14%' }} size={14} colour="#FFFFFF" opacity={0.55} still />

      <Vignette opacity={0.7} from="46%" />
      <TopRule height={2} opacity={0.45} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Black Friday — lit signage at night                                        */
/* -------------------------------------------------------------------------- */

/**
 * A black room, one amber light source, and polished things in it.
 *
 * The urgency is in the value range — true black to near-white amber — rather
 * than in clutter. The hazard stripes are kept but pushed into a band at the
 * top, so the middle of the page stays the calm dark the card needs; the
 * spheres are black with an amber rim light, which is how a product shot
 * makes a dark object read as expensive.
 *
 * Two devices come straight off the Black Friday stock sheets the owner
 * pointed at, where nearly every piece uses one or both: rays converging on
 * the headline, and a low-poly faceted floor. Both are value-only, which is
 * exactly what this palette wants — the chroma budget is one amber and it is
 * all spent on the light around the wheel.
 */
const LACQUER: Skin = {
  light: '#4C443A',
  body: '#211D19',
  deep: '#0D0C0B',
  rim: '#F59E0B',
  bounce: 'rgb(245 158 11 / 0.45)',
}

const AMBER: Rgb = '245 158 11'

const BLACK_FRIDAY_BOKEH: readonly Disc[] = [
  [10, 8, 120, 0.3],
  [26, 3, 70, 0.22, 1],
  [44, 11, 95, 0.18],
  [66, 5, 130, 0.24, 1],
  [87, 14, 80, 0.26],
  [97, 32, 110, 0.16],
  [3, 28, 90, 0.14, 1],
  [16, 93, 130, 0.2],
  [45, 97, 90, 0.14, 1],
  [74, 90, 110, 0.18],
  [92, 78, 70, 0.14, 1],
]

function BlackFridayScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            'linear-gradient(180deg, #000000 0%, var(--bg) 26%, #14110D 46%, var(--bg) 70%, #000000 100%)',
        }}
      />

      {/* Rays converging on the wheel. This replaced a pair of clipped light
          cones: a `clip-path` edge is a hard edge, and a hard-edged beam in a
          dark room is the one thing that reads as a mistake rather than as
          lighting. The rays have no edge at all. */}
      <Sunburst colour={AMBER} alpha={0.055} at="50% 44%" wedges={28} opacity={0.9} />

      {/* Hazard stripes, confined to a band across the top. Rotated wrapper,
          translated child: the stripes are drawn vertically and slid by
          exactly one period, so the loop is seamless whatever angle they are
          shown at. Sliding a diagonal pattern directly never lines back up. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34%] overflow-hidden">
        <div
          className="pointer-events-none absolute -inset-[40%] rotate-[-14deg]"
          style={{ opacity: 0.08 }}
        >
          <div
            className="scene-slide absolute inset-0"
            style={
              {
                backgroundImage:
                  'repeating-linear-gradient(90deg, var(--accent) 0 4px, transparent 4px 30px)',
                '--scene-shift': '30px',
                '--scene-duration': '3.5s',
              } as React.CSSProperties
            }
          />
        </div>
      </div>

      <Bokeh discs={BLACK_FRIDAY_BOKEH} colour={AMBER} opacity={0.5} drift={34} />

      {/* Lacquered spheres catching the light. Front to back by size and
          opacity; the small one is nearly lost in the dark, which is the
          point of it. */}
      <Orb at={{ left: '-5%', top: '4%' }} size={140} skin={LACQUER} opacity={0.95} />
      <Orb
        at={{ right: '-3%', top: '14%' }}
        size={100}
        skin={LACQUER}
        opacity={0.75}
        className="hidden sm:block"
      />
      <Orb at={{ right: '14%', bottom: '-4%' }} size={120} skin={LACQUER} opacity={0.6} />
      <Orb at={{ left: '18%', bottom: '10%' }} size={54} skin={LACQUER} opacity={0.45} />

      {/* The polished surface it is all standing on. */}
      <FacetedFloor
        height={92}
        shades={['#141210', '#0A0A0B', '#1D1812', '#050505']}
        edge="#F59E0B"
        opacity={0.95}
      />

      {/* The light the wheel is standing in, drawn after the rays so the
          middle of the page comes back to a calm flat dark. */}
      <Glow colour="var(--accent)" at="50% 48%" size="95% 70%" opacity={0.13} reach="62%" />
      <Glow colour="var(--accent-soft)" at="50% 46%" size="42% 32%" opacity={0.1} reach="70%" />

      <Glints
        points={[
          [12, 20, 26, 0.85],
          [57, 7, 18, 0.6],
          [88, 30, 22, 0.5],
          [30, 88, 18, 0.45],
        ]}
        colour={AMBER}
        twinkle={{ seconds: 5.5, dim: 0.45 }}
      />
      <Starburst at={{ left: '6%', top: '26%' }} size={30} colour="#FCD34D" opacity={0.9} delay={0.4} />
      <Starburst at={{ right: '9%', top: '8%' }} size={20} colour="#FCD34D" opacity={0.7} delay={2.2} />

      <Vignette opacity={1} from="28%" />
      <TopRule height={3} opacity={0.95} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Christmas — a green snowy night with something warm lit below              */
/* -------------------------------------------------------------------------- */

/**
 * A bauble is red or gold, and neither is a theme token: these are decoration
 * and never a text surface, so they sit outside the contrast contract.
 */
const BAUBLE_RED: Skin = {
  light: '#FF8A80',
  body: '#D62828',
  deep: '#8C1111',
  rim: '#5A0A0A',
  bounce: 'rgb(252 217 160 / 0.5)',
}

const BAUBLE_GOLD: Skin = {
  light: '#FFF3CE',
  body: '#E9C46A',
  deep: '#A97E22',
  rim: '#6E5213',
  bounce: 'rgb(255 236 190 / 0.45)',
}

/** Snow close to the lens, out of focus: the depth cue a snow scene needs. */
const CHRISTMAS_BOKEH: readonly Disc[] = [
  [9, 12, 110, 0.26],
  [24, 5, 62, 0.2, 1],
  [41, 16, 80, 0.14],
  [63, 7, 120, 0.18, 1],
  [84, 17, 70, 0.22],
  [96, 36, 95, 0.13],
  [5, 44, 70, 0.12, 1],
  [14, 90, 130, 0.18],
  [40, 97, 85, 0.13, 1],
  [70, 92, 110, 0.16],
  [93, 80, 65, 0.12, 1],
]

function ChristmasScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            /* The last stop is the card's own deepest green, so the ground
               ends on the tone the card is cut from. It tracks stageEdge in
               themes.ts by hand — a scene literal cannot read a token. */
            'linear-gradient(180deg, var(--bg-deep) 0%, #0A4433 34%, var(--bg) 62%, #05271D 100%)',
        }}
      />

      {/* Lamplight from below the wheel — the warm note the deep green needs. */}
      <Glow colour="var(--accent-soft)" at="50% 97%" size="125% 52%" opacity={0.34} />
      <Glow colour="#2BA36A" at="16% 8%" size="58% 44%" opacity={0.16} />

      <Bokeh discs={CHRISTMAS_BOKEH} colour={WHITE} drift={42} />

      <Garland />

      {/* Two baubles hanging into the top band, where a phone can see them. */}
      <Bauble at={{ left: '11%' }} drop={74} size={44} skin={BAUBLE_RED} delay={0} />
      <Bauble at={{ right: '14%' }} drop={52} size={32} skin={BAUBLE_GOLD} delay={1.6} />
      <Bauble
        at={{ left: '34%' }}
        drop={98}
        size={24}
        skin={BAUBLE_GOLD}
        delay={3.1}
        opacity={0.55}
      />

      <FallingField
        image={dotField(SNOW_FAR, 'rgb(255 255 255 / 0.55)')}
        tile={150}
        seconds={26}
        opacity={0.55}
      />
      <FallingField
        image={softDotField(SNOW_NEAR, WHITE, 0.9)}
        tile={210}
        seconds={17}
        opacity={0.6}
      />

      <Treeline />

      <Glints
        points={[
          [20, 30, 20, 0.8],
          [78, 24, 16, 0.6],
          [52, 12, 14, 0.5],
        ]}
        colour={WHITE}
        twinkle={{ seconds: 6, dim: 0.4 }}
      />
      <Starburst at={{ right: '24%', top: '18%' }} size={24} colour="#FFF7ED" opacity={0.85} delay={1.1} />

      <Vignette opacity={0.85} from="34%" />
    </>
  )
}

/**
 * A string of lights across the top, each bulb lit rather than filled.
 *
 * Cropped rather than stretched (`slice`), so the bulbs stay round on a phone
 * and on a desktop. Each bulb is a halo, a body with a gradient, and a hot
 * specular dot — the same four-tone recipe as everything else here, at 11px.
 */
function Garland() {
  const bulbs = [60, 160, 260, 360, 460, 560, 660, 760, 860, 960, 1060, 1160]

  return (
    <svg
      className="pointer-events-none absolute inset-x-0 top-0 h-[58px] w-full sm:h-[70px] lg:h-[86px]"
      viewBox="0 0 1200 58"
      preserveAspectRatio="xMidYMin slice"
      role="presentation"
    >
      <defs>
        <radialGradient id="christmas-bulb-warm" cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="34%" stopColor="#FFD9A0" />
          <stop offset="78%" stopColor="#E08A1E" />
          <stop offset="100%" stopColor="#8A4A08" />
        </radialGradient>
        <radialGradient id="christmas-bulb-red" cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#FFD2CC" />
          <stop offset="34%" stopColor="#E8453C" />
          <stop offset="78%" stopColor="#9C1414" />
          <stop offset="100%" stopColor="#5E0A0A" />
        </radialGradient>
        <radialGradient id="christmas-bulb-halo">
          <stop offset="0%" stopColor="#FFE2B0" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#FFC56B" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFC56B" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path
        d="M-20 6 Q 100 46 220 8 Q 340 46 460 8 Q 580 46 700 8 Q 820 46 940 8 Q 1060 46 1180 8 Q 1240 26 1260 10"
        fill="none"
        stroke="var(--stage-border)"
        strokeWidth={2}
        opacity={0.75}
      />
      {bulbs.map((x, index) => {
        // Low points of the catenary, so the bulbs hang off the wire.
        const y = index % 2 === 0 ? 34 : 32
        const warm = index % 2 === 0

        return (
          <g key={x} className="scene-twinkle" style={animationDelay(index * 0.45)}>
            <circle cx={x} cy={y} r={22} fill="url(#christmas-bulb-halo)" />
            <circle
              cx={x}
              cy={y}
              r={6}
              fill={warm ? 'url(#christmas-bulb-warm)' : 'url(#christmas-bulb-red)'}
            />
            <circle cx={x - 2} cy={y - 2.2} r={1.4} fill="#FFFFFF" opacity={0.85} />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * A bauble on a thread from the top of the page.
 *
 * The thread is a one-pixel div rather than part of an SVG: it has to reach
 * an arbitrary distance down the page, and stretching an SVG to do that would
 * take the sphere's roundness with it.
 */
function Bauble({
  at,
  drop,
  size,
  skin,
  delay,
  opacity = 0.95,
}: {
  at: React.CSSProperties
  /** Pixels from the top of the page to the top of the sphere. */
  drop: number
  size: number
  skin: Skin
  delay: number
  opacity?: number
}) {
  return (
    <div
      className="scene-bob pointer-events-none absolute top-0"
      style={
        {
          ...at,
          width: scaled(size),
          height: scaled(drop + size),
          opacity,
          ...animationDelay(delay),
          '--scene-shift': '-7px',
          '--scene-duration': '7s',
        } as React.CSSProperties
      }
    >
      <div
        className="absolute left-1/2 top-0 w-px"
        style={{
          height: scaled(drop),
          background: 'linear-gradient(180deg, transparent, var(--stage-border) 40%, #E9C46A)',
          opacity: 0.8,
        }}
      />
      <Orb at={{ left: 0, top: scaled(drop) }} size={size} skin={skin} />
    </div>
  )
}

/**
 * A pine horizon in two depths: a pale, low, distant line and a dark, tall,
 * near one. Stretched on purpose — a silhouette has no detail to lose — and
 * the two layers at different heights are what turn a shape into a distance.
 */
function Treeline() {
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[74px] w-full sm:h-[92px] lg:h-[112px]"
        viewBox="0 0 400 74"
        preserveAspectRatio="none"
        role="presentation"
      >
        <path
          d="M0 74 L0 52 L14 30 L26 46 L40 22 L54 44 L68 28 L82 50 L96 26 L112 48 L126 32 L142 54 L156 26 L172 48 L188 34 L204 56 L220 28 L236 50 L252 36 L268 54 L284 24 L300 48 L316 32 L332 52 L348 28 L364 48 L380 34 L400 52 L400 74 Z"
          fill="#0A4433"
          opacity={0.55}
        />
      </svg>
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[96px] w-full sm:h-[120px] lg:h-[148px]"
        viewBox="0 0 400 96"
        preserveAspectRatio="none"
        role="presentation"
      >
        <path
          d="M0 96 L0 62 L18 34 L30 52 L44 18 L60 50 L72 30 L88 58 L104 26 L120 54 L134 36 L150 64 L166 28 L182 56 L198 38 L214 66 L230 30 L246 58 L262 40 L278 62 L294 24 L310 54 L326 34 L342 60 L358 30 L376 56 L390 38 L400 60 L400 96 Z"
          fill="var(--bg-deep)"
          opacity={0.95}
        />
        {/* Snow caught on the near treetops: the same line, one unit up, in
            white at a low alpha. Nothing else says "cold" this cheaply. */}
        <path
          d="M0 62 L18 34 L30 52 L44 18 L60 50 L72 30 L88 58 L104 26 L120 54 L134 36 L150 64 L166 28 L182 56 L198 38 L214 66 L230 30 L246 58 L262 40 L278 62 L294 24 L310 54 L326 34 L342 60 L358 30 L376 56 L390 38 L400 60"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.2}
          opacity={0.22}
        />
      </svg>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* New Year — midnight, gold leaf, fireworks                                  */
/* -------------------------------------------------------------------------- */

const GOLD: Rgb = '212 175 55'

const NEW_YEAR_BOKEH: readonly Disc[] = [
  [8, 9, 120, 0.22],
  [25, 3, 70, 0.17, 1],
  [43, 13, 90, 0.12],
  [64, 6, 130, 0.16, 1],
  [85, 16, 75, 0.18],
  [97, 34, 100, 0.11],
  [4, 30, 80, 0.1, 1],
  [15, 92, 140, 0.18],
  [42, 98, 90, 0.12, 1],
  [72, 91, 115, 0.16],
  [94, 79, 70, 0.11, 1],
]

function NewYearScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            'linear-gradient(180deg, #16215A 0%, var(--bg) 34%, #091034 72%, var(--bg-deep) 100%)',
        }}
      />

      {/* A paler blue high up, so the sky has a top. */}
      <Glow colour="var(--stage-border)" at="50% -8%" size="120% 70%" opacity={0.45} reach="70%" />

      {/* Gold rays off the wheel, barely there: the same device as Black
          Friday at a third of the strength, because this sky already has
          stars and fireworks competing for the same attention. */}
      <Sunburst colour={GOLD} alpha={0.05} at="50% 50%" wedges={36} opacity={0.75} />

      <div
        className="scene-twinkle pointer-events-none absolute inset-0"
        style={
          {
            backgroundImage: dotField(STARS, '#FFFFFF'),
            backgroundSize: '260px 260px',
            opacity: 0.5,
            '--scene-dim': '0.3',
            '--scene-lit': '0.65',
            '--scene-duration': '6s',
          } as React.CSSProperties
        }
      />

      <Bokeh discs={NEW_YEAR_BOKEH} colour={GOLD} drift={46} />

      {/* High and spread wide. On a phone the card fills the width, so the
          strip above it is the only sky the player sees — a firework at 30%
          down the page would spend its life behind the card. */}
      <Firework id="ny-a" at={{ left: '2%', top: '0%' }} scale={1.15} delay={0} />
      <Firework id="ny-b" at={{ right: '1%', top: '3%' }} scale={0.85} delay={2.4} />
      <Firework id="ny-c" at={{ left: '37%', top: '6%' }} scale={0.55} delay={4.6} />

      {/* Gold on the wheel, and a last catch of it along the bottom. */}
      <Glow colour="var(--accent)" at="50% 50%" size="80% 60%" opacity={0.12} reach="60%" />
      <Glow colour="var(--accent)" at="50% 104%" size="120% 32%" opacity={0.26} />

      <Glints
        points={[
          [14, 26, 22, 0.85],
          [60, 15, 16, 0.6],
          [89, 33, 20, 0.55],
          [35, 86, 16, 0.4],
        ]}
        colour={GOLD}
        twinkle={{ seconds: 5, dim: 0.4 }}
      />
      <Starburst at={{ left: '9%', top: '22%' }} size={28} colour="#F5D77A" opacity={0.9} delay={0.8} />
      <Starburst at={{ right: '12%', top: '12%' }} size={18} colour="#F5D77A" opacity={0.7} delay={2.9} />

      <Vignette opacity={0.9} from="36%" />
      <TopRule height={2} opacity={0.8} />
    </>
  )
}

/**
 * A burst: a hot core, twelve tapering spokes, and a ring of sparks at
 * alternating distances so the shell does not read as a cog.
 *
 * The spokes are drawn as thin triangles rather than stroked lines, because a
 * firework's trail is wide where it left the core and a point where it died,
 * and a uniform stroke gets that exactly wrong. The resting opacity is
 * deliberate: with reduced motion the animation never applies, and a firework
 * frozen at full brightness mid-expansion looks like a rendering fault, so it
 * rests as a faint one instead.
 */
function Firework({
  id,
  at,
  scale,
  delay,
}: {
  id: string
  at: React.CSSProperties
  scale: number
  delay: number
}) {
  const spokes = Array.from({ length: 20 }, (_, index) => (index * 360) / 20)

  return (
    <div
      className="scene-burst pointer-events-none absolute"
      style={
        {
          ...at,
          width: scaled(160 * scale),
          height: scaled(160 * scale),
          opacity: 0.55,
          ...animationDelay(delay),
          '--scene-duration': '7s',
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
        <defs>
          <radialGradient id={`${id}-core`}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="30%" stopColor="#F5D77A" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-trail`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFF4CF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <circle cx={50} cy={50} r={21} fill={`url(#${id}-core)`} />

        {spokes.map((angle, index) => {
          // Alternating reach, so the shell is a scatter rather than a ring.
          const reach = index % 2 === 0 ? 45 : 35

          return (
            <g key={angle} transform={`rotate(${angle} 50 50)`}>
              {/* A wedge from the core out to a point, drawn along +x and
                  rotated into place: one shape to tune instead of twenty. */}
              <path d={`M 58 49 L ${50 + reach} 50 L 58 51 Z`} fill={`url(#${id}-trail)`} />
              <circle
                cx={50 + reach}
                cy={50}
                r={index % 2 === 0 ? 1.5 : 0.9}
                fill="#FFF4CF"
                opacity={index % 2 === 0 ? 0.95 : 0.6}
              />
            </g>
          )
        })}

        <circle cx={50} cy={50} r={2.1} fill="#FFFFFF" opacity={0.95} />
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Halloween — a moon, a cobweb, and a pumpkin glow                           */
/* -------------------------------------------------------------------------- */

const PUMPKIN: Rgb = '249 115 22'
const WITCH_PURPLE: Rgb = '168 85 247'

const HALLOWEEN_BOKEH: readonly Disc[] = [
  [7, 11, 120, 0.2],
  [23, 4, 70, 0.15, 1],
  [40, 14, 85, 0.1],
  [62, 8, 110, 0.13, 1],
  [12, 86, 140, 0.16],
  [38, 97, 90, 0.11, 1],
  [68, 92, 110, 0.14],
  [92, 78, 70, 0.1, 1],
]

function HalloweenScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            'linear-gradient(168deg, #2A1150 0%, var(--bg) 36%, #150926 74%, var(--bg-deep) 100%)',
        }}
      />

      {/* The halo the moon throws, in three steps rather than one, so it falls
          off the way light actually does. Kept tight: the first attempt had
          it covering a third of the page, and a halo that large stops being
          light and becomes fog — the moon disappeared into its own glow. */}
      <div
        className={FILL}
        style={{
          background: `radial-gradient(40% 29% at 80% 11%, rgb(255 247 230 / 0.26) 0%, rgb(253 186 116 / 0.12) 34%, rgb(${WITCH_PURPLE} / 0.07) 62%, transparent 80%)`,
        }}
      />

      {/* Cloud banks, behind the moon. Flattened radial gradients: a cloud is
          soft at every edge, which is exactly what a blur would be used for
          and exactly what a gradient gives for free. */}
      <div
        className={FILL}
        style={{
          background: [
            'radial-gradient(44% 5% at 66% 21%, rgb(237 233 254 / 0.13) 0%, transparent 72%)',
            'radial-gradient(34% 4% at 30% 9%, rgb(237 233 254 / 0.09) 0%, transparent 72%)',
            'radial-gradient(50% 4% at 78% 32%, rgb(237 233 254 / 0.07) 0%, transparent 74%)',
          ].join(', '),
        }}
      />

      <Moon />

      {/* And one thin one drifting across its face, which is the shot. */}
      <div
        className={FILL}
        style={{
          background:
            'radial-gradient(26% 2.4% at 81% 13%, rgb(237 233 254 / 0.14) 0%, transparent 74%)',
        }}
      />

      <Bokeh discs={HALLOWEEN_BOKEH} colour={PUMPKIN} drift={38} />

      {/* Clustered under and beside the moon, where its halo is bright enough
          for a silhouette to read. Out in the open purple they were invisible,
          which is the only thing a bat must not be. Size and opacity fall off
          together, so the small ones read as far away rather than as mistakes. */}
      <Bat at={{ right: '30%', top: '3%' }} size={46} delay={0} opacity={0.95} />
      <Bat at={{ right: '2%', top: '11%' }} size={30} delay={1.7} opacity={0.75} />
      <Bat at={{ right: '45%', top: '10%' }} size={20} delay={3.1} opacity={0.5} />

      <Cobweb />

      {/* Something carved and lit, just off the bottom of the page. */}
      <Glow colour="var(--accent)" at="50% 106%" size="115% 48%" opacity={0.46} />
      <Glow colour="#FDBA74" at="50% 110%" size="58% 24%" opacity={0.4} />

      <Glints
        points={[
          [16, 34, 18, 0.5],
          [66, 26, 14, 0.4],
          [40, 88, 16, 0.35],
        ]}
        colour={PUMPKIN}
        twinkle={{ seconds: 6.5, dim: 0.3 }}
      />

      <Vignette opacity={0.95} from="32%" />
    </>
  )
}

/**
 * A full moon: a lit disc with a bright limb, a few craters, and a terminator
 * that falls away to the lower right.
 *
 * Craters matter more than they should at this size — a plain lit circle reads
 * as a lamp, and three soft dark patches is the whole difference.
 */
function Moon() {
  return (
    <div
      className="pointer-events-none absolute right-[9%] top-[4%] h-20 w-20 rounded-full sm:h-28 sm:w-28 lg:h-36 lg:w-36"
      style={{
        backgroundImage: [
          'radial-gradient(circle 14% at 38% 34%, rgb(120 103 78 / 0.22) 0%, transparent 100%)',
          'radial-gradient(circle 9% at 62% 52%, rgb(120 103 78 / 0.2) 0%, transparent 100%)',
          'radial-gradient(circle 11% at 48% 70%, rgb(120 103 78 / 0.16) 0%, transparent 100%)',
          // The bright limb: a ring of light just inside the edge.
          'radial-gradient(circle at 50% 50%, transparent 0 82%, rgb(255 253 245 / 0.5) 94%, transparent 100%)',
          'radial-gradient(circle at 36% 32%, #FFFFFF 0%, #FFF6E2 36%, #F3D9A4 66%, #D9A560 88%, #9E6C33 100%)',
        ].join(', '),
        boxShadow: '0 0 34px 10px rgb(255 237 200 / 0.22)',
      }}
    />
  )
}

/** A quarter web in the corner: three sagging threads on five radials. */
function Cobweb() {
  const radials = [0, 22.5, 45, 67.5, 90]
  const rings = [38, 72, 106]

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-32 w-32 sm:h-44 sm:w-44 lg:h-56 lg:w-56"
      viewBox="0 0 120 120"
      role="presentation"
    >
      <defs>
        <linearGradient id="halloween-silk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EDE9FE" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#EDE9FE" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <g stroke="url(#halloween-silk)" strokeWidth={1} fill="none">
        {radials.map((angle) => {
          const radians = (angle * Math.PI) / 180

          return (
            <line
              key={angle}
              x1={0}
              y1={0}
              x2={(118 * Math.cos(radians)).toFixed(2)}
              y2={(118 * Math.sin(radians)).toFixed(2)}
            />
          )
        })}
        {rings.map((r) => (
          // Bowed inwards, the way a web hangs between its anchors.
          <path key={r} d={`M ${r} 0 Q ${r * 0.62} ${r * 0.62} 0 ${r}`} />
        ))}
      </g>
      {/* Two beads of dew. A web with a highlight on it is a web in moonlight. */}
      <circle cx={50.9} cy={50.9} r={1.6} fill="#FFFFFF" opacity={0.7} />
      <circle cx={27.8} cy={67.1} r={1.1} fill="#FFFFFF" opacity={0.5} />
    </svg>
  )
}

/**
 * A silhouette, and no more bat than reads at 30 pixels: a body, two ears,
 * and a wing with two notches in its trailing edge. The notches are what
 * make it a bat rather than a chevron — the first attempt had smooth wings
 * and looked like an arrowhead.
 */
function Bat({
  at,
  size,
  delay,
  opacity,
}: {
  at: React.CSSProperties
  size: number
  delay: number
  opacity: number
}) {
  return (
    <div
      className="scene-bob pointer-events-none absolute"
      style={
        {
          ...at,
          width: scaled(size),
          height: scaled(size * 0.46),
          opacity,
          ...animationDelay(delay),
          '--scene-shift': '-9px',
          '--scene-duration': '5.5s',
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 48 22" className="h-full w-full" role="presentation">
        <g fill="var(--bg-deep)">
          <path d="M21 7 L12 3 L2 7 Q7 9 8 14 Q13 12 15 16 Q19 14 21 16 Z" />
          <path d="M27 7 L36 3 L46 7 Q41 9 40 14 Q35 12 33 16 Q29 14 27 16 Z" />
          <ellipse cx={24} cy={11} rx={3.4} ry={5} />
          <path d="M21.4 6.5 L22.6 2 L24 6.5 Z" />
          <path d="M26.6 6.5 L25.4 2 L24 6.5 Z" />
        </g>
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Birthday — the one the reference speaks to                                 */
/* -------------------------------------------------------------------------- */

/**
 * The reference is gold and cream; this theme is rose, because that is what
 * birthday means here and the tokens are contrast-tested around it. What is
 * borrowed is the *method*: one hue, a value range from white to deep rose
 * with champagne as the single warm note, volumetric balloons at four depths,
 * a bokeh field doing most of the work, and sparkle used sparingly.
 *
 * Rainbow confetti was the single biggest thing making this theme look cheap.
 * Six unrelated hues at the same size and opacity is a pattern swatch, not a
 * photograph. It is now four tones of one family at three sizes.
 */
const ROSE: Rgb = '249 168 212'
const CREAM: Rgb = '255 252 254'
const DEEP_ROSE: Rgb = '227 134 180'

const CONFETTI = ['#F9A8D4', '#F3D9A4', '#FBCFE8', '#E879A8'] as const

/** Front to back: pearl and champagne catch the light, deep rose recedes. */
const BALLOON_PEARL: Skin = {
  light: '#FFFFFF',
  body: '#FDEAF3',
  deep: '#F2B9D4',
  rim: '#D98BB4',
  bounce: 'rgb(255 255 255 / 0.6)',
}

const BALLOON_ROSE: Skin = {
  light: '#FFD9EB',
  body: '#F487B8',
  deep: '#CE4588',
  rim: '#9D1F5F',
  bounce: 'rgb(255 231 243 / 0.5)',
}

const BALLOON_CHAMPAGNE: Skin = {
  light: '#FFFBF0',
  body: '#F3D9A4',
  deep: '#D3A858',
  rim: '#A07B34',
  bounce: 'rgb(255 248 230 / 0.55)',
}

/**
 * Dense along the top and the bottom, almost nothing across the middle band.
 * That gap is the negative space the reference leaves for its message and we
 * leave for the card.
 */
const BIRTHDAY_BOKEH: readonly Disc[] = [
  [6, 8, 150, 0.55],
  [19, 2, 85, 0.4, 1],
  [31, 13, 110, 0.3],
  [44, 4, 65, 0.42, 1],
  [57, 11, 130, 0.28],
  [70, 3, 95, 0.44, 1],
  [83, 12, 120, 0.36],
  [95, 5, 70, 0.4],
  [2, 26, 100, 0.26, 1],
  [98, 28, 110, 0.28],
  [10, 88, 165, 0.42],
  [27, 97, 105, 0.3, 1],
  [48, 93, 80, 0.24],
  [66, 99, 140, 0.34],
  [84, 88, 95, 0.28, 1],
  [97, 72, 85, 0.24],
]

function BirthdayScene() {
  return (
    <>
      <div
        className={FILL}
        style={{
          background:
            'linear-gradient(180deg, #F9CCE0 0%, #FBDDEC 16%, var(--bg) 46%, #FBDDEC 76%, var(--bg-deep) 100%)',
        }}
      />

      {/* Two passes, and the order is the point: a deep rose field first, so
          the near-white one has something to be lighter than. A single pale
          layer on a pale page is the mistake that made the first attempt look
          like a flat swatch. */}
      <Bokeh discs={BIRTHDAY_BOKEH} colour={DEEP_ROSE} opacity={0.5} />
      <Bokeh discs={BIRTHDAY_BOKEH} colour={CREAM} opacity={0.95} drift={40} />

      <Confetti />

      {/* Four depths, strictly ordered: the big pair are crisp and nearly
          opaque, the back pair are small and half there. Every one of them is
          in the band above the card, which on a phone is the only part of the
          page the player can see past it. */}
      <Balloon id="b-1" at={{ left: '2%', top: '2%' }} skin={BALLOON_ROSE} size={78} delay={0} opacity={0.95} />
      <Balloon id="b-2" at={{ right: '3%', top: '0%' }} skin={BALLOON_PEARL} size={88} delay={1.4} opacity={0.95} />
      <Balloon id="b-3" at={{ left: '24%', top: '-2%' }} skin={BALLOON_CHAMPAGNE} size={54} delay={2.6} opacity={0.8} />
      <Balloon id="b-4" at={{ right: '26%', top: '4%' }} skin={BALLOON_ROSE} size={40} delay={3.4} opacity={0.6} />
      <Balloon
        id="b-5"
        at={{ left: '13%', top: '14%' }}
        skin={BALLOON_PEARL}
        size={30}
        delay={4.2}
        opacity={0.45}
        className="hidden sm:block"
      />
      <Balloon
        id="b-6"
        at={{ right: '14%', top: '16%' }}
        skin={BALLOON_CHAMPAGNE}
        size={26}
        delay={5}
        opacity={0.4}
        className="hidden sm:block"
      />

      {/* The side gutters, which only exist once the card has stopped filling
          the width. Without these a desktop is a busy top edge over a very
          large flat nothing. */}
      <Balloon
        id="b-7"
        at={{ left: '3%', top: '34%' }}
        skin={BALLOON_PEARL}
        size={64}
        delay={1.9}
        opacity={0.85}
        className="hidden lg:block"
      />
      <Balloon
        id="b-8"
        at={{ right: '4%', top: '44%' }}
        skin={BALLOON_ROSE}
        size={52}
        delay={3.1}
        opacity={0.7}
        className="hidden lg:block"
      />
      <Balloon
        id="b-9"
        at={{ left: '9%', top: '62%' }}
        skin={BALLOON_CHAMPAGNE}
        size={34}
        delay={4.7}
        opacity={0.5}
        className="hidden lg:block"
      />

      {/* A clean pool under the wheel so the slices stay crisp against all
          that light, and so the middle of the page stays the calm part. */}
      <Glow colour="#FFFFFF" at="50% 48%" size="78% 56%" opacity={0.9} reach="66%" />

      <Glints
        points={[
          [11, 22, 26, 0.95],
          [34, 8, 18, 0.7],
          [62, 18, 16, 0.6],
          [88, 24, 22, 0.75],
          [22, 84, 18, 0.5],
          [74, 90, 20, 0.45],
        ]}
        colour={ROSE}
        twinkle={{ seconds: 5, dim: 0.45 }}
      />
      <Starburst at={{ left: '8%', top: '27%' }} size={30} colour="#FFFFFF" opacity={0.95} delay={0.6} />
      <Starburst at={{ right: '11%', top: '20%' }} size={22} colour="#FFF3D6" opacity={0.85} delay={2.1} />
      <Starburst at={{ left: '40%', top: '10%' }} size={16} colour="#FFFFFF" opacity={0.7} delay={3.6} />

      <Vignette opacity={0.5} from="50%" />
      <TopRule height={3} opacity={0.55} />
    </>
  )
}

/**
 * Confetti as a single tiled SVG pattern, drifting down.
 *
 * No `viewBox`: one user unit is one CSS pixel, so the tile cannot be
 * stretched out of shape by the page it lands on. The layer slides by exactly
 * one tile, which loops invisibly. Three sizes and three opacities, because a
 * field of identical flakes is the other half of what made this look flat.
 */
function Confetti() {
  const tile = 150
  const pieces = [
    { x: 12, y: 16, w: 7, h: 11, angle: 24, colour: CONFETTI[0], alpha: 0.9 },
    { x: 54, y: 7, w: 5, h: 8, angle: -38, colour: CONFETTI[1], alpha: 0.75 },
    { x: 98, y: 26, w: 8, h: 9, angle: 12, colour: CONFETTI[2], alpha: 0.85 },
    { x: 28, y: 56, w: 4, h: 7, angle: 62, colour: CONFETTI[3], alpha: 0.5 },
    { x: 76, y: 68, w: 7, h: 10, angle: -16, colour: CONFETTI[0], alpha: 0.7 },
    { x: 124, y: 82, w: 5, h: 8, angle: 44, colour: CONFETTI[1], alpha: 0.6 },
    { x: 8, y: 102, w: 8, h: 8, angle: -28, colour: CONFETTI[2], alpha: 0.8 },
    { x: 46, y: 118, w: 4, h: 6, angle: 8, colour: CONFETTI[3], alpha: 0.45 },
    { x: 88, y: 132, w: 7, h: 10, angle: 52, colour: CONFETTI[0], alpha: 0.65 },
    { x: 136, y: 40, w: 4, h: 7, angle: -52, colour: CONFETTI[2], alpha: 0.5 },
  ]

  return (
    <div
      className="scene-fall pointer-events-none absolute inset-x-0"
      style={
        {
          top: -tile,
          height: `calc(100% + ${tile * 2}px)`,
          opacity: 0.55,
          '--scene-shift': `${tile}px`,
          '--scene-duration': '26s',
        } as React.CSSProperties
      }
    >
      <svg className="h-full w-full" role="presentation">
        <defs>
          <pattern id="birthday-confetti" width={tile} height={tile} patternUnits="userSpaceOnUse">
            {pieces.map((piece) => (
              <rect
                key={`${piece.x}-${piece.y}`}
                x={piece.x}
                y={piece.y}
                width={piece.w}
                height={piece.h}
                rx={1.5}
                fill={piece.colour}
                opacity={piece.alpha}
                transform={`rotate(${piece.angle} ${piece.x + piece.w / 2} ${piece.y + piece.h / 2})`}
              />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#birthday-confetti)" />
      </svg>
    </div>
  )
}

/**
 * A balloon with the reference's anatomy: a broad body gradient lit from the
 * upper left, a soft specular streak offset from the centre, a dark rim, and
 * a reflected light low on the shadow side. The knot and the curling string
 * are what stop it reading as an egg.
 *
 * Each instance declares its own gradients, which is why it takes an `id`:
 * SVG gradient references are document-global, so two balloons sharing an id
 * would share a colour.
 */
function Balloon({
  id,
  at,
  skin,
  size,
  delay,
  opacity,
  className = '',
}: {
  id: string
  at: React.CSSProperties
  skin: Skin
  /** Width in pixels; the height follows from the balloon's proportions. */
  size: number
  delay: number
  opacity: number
  className?: string
}) {
  return (
    <div
      className={`scene-bob pointer-events-none absolute ${className}`}
      style={
        {
          ...at,
          width: scaled(size),
          height: scaled(size * 2.1),
          opacity,
          ...animationDelay(delay),
          '--scene-shift': '-12px',
          '--scene-duration': '6.5s',
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 44 92" className="h-full w-full" role="presentation">
        <defs>
          <radialGradient id={`${id}-body`} cx="34%" cy="26%" r="78%">
            <stop offset="0%" stopColor={skin.light} />
            <stop offset="32%" stopColor={skin.body} />
            <stop offset="76%" stopColor={skin.deep} />
            <stop offset="100%" stopColor={skin.rim} />
          </radialGradient>
          <radialGradient id={`${id}-spec`}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-bounce`}>
            <stop offset="0%" stopColor={skin.light} stopOpacity="0.7" />
            <stop offset="100%" stopColor={skin.light} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The teardrop: round at the shoulders, drawn down to the knot. */}
        <path
          d="M22 2 C33.6 2 42 11.2 42 22.4 C42 32.6 34.4 41.6 26.6 49.4 C24.4 51.6 23 53.4 22 55.4 C21 53.4 19.6 51.6 17.4 49.4 C9.6 41.6 2 32.6 2 22.4 C2 11.2 10.4 2 22 2 Z"
          fill={`url(#${id}-body)`}
        />
        {/* Reflected light, low and right. */}
        <ellipse cx={31} cy={37} rx={9} ry={11} fill={`url(#${id}-bounce)`} />
        {/* The specular streak, offset from centre and tilted with the form. */}
        <ellipse
          cx={14.5}
          cy={19}
          rx={5}
          ry={11}
          fill={`url(#${id}-spec)`}
          transform="rotate(-16 14.5 19)"
        />
        <circle cx={15.5} cy={13} r={1.8} fill="#FFFFFF" opacity={0.9} />

        {/* Knot, then string. */}
        <path d="M22 54 l-3.6 5.4 h7.2 Z" fill={skin.deep} />
        <path
          d="M22 59.4 C 28 67 16.5 73 22 81 C 26 86 19.5 88 18.5 92"
          fill="none"
          stroke={skin.deep}
          strokeWidth={1.2}
          opacity={0.55}
        />
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** Spreads a set of repeating animations out so they do not pulse in unison. */
function animationDelay(seconds: number): React.CSSProperties {
  return { animationDelay: `${seconds}s` }
}

const SCENES: Record<ThemeName, () => React.ReactElement> = {
  plain: PlainScene,
  'black-friday': BlackFridayScene,
  christmas: ChristmasScene,
  'new-year': NewYearScene,
  halloween: HalloweenScene,
  birthday: BirthdayScene,
}
