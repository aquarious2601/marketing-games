/**
 * The looks the game can wear (F04 R7), mirroring the backend's Theme enum.
 *
 * Colours only (F04 R9). The wheel's slice palette is deliberately absent:
 * it is contrast-tested in its own right (F01 R14) and stays identical on
 * every theme (F04 R10), so a seasonal look can never make a prize name
 * unreadable.
 *
 * Every foreground here clears WCAG AA (4.5:1) against the surface it sits
 * on, and a test enforces that for every one of them (F04 R11) — the
 * Halloween button was white-on-orange at 3.56:1 until that test caught it.
 *
 * ## Why there are so many tokens now
 *
 * The first cut of F04 was nine flat colours, and the page looked like a
 * form that had been painted. The themes are now full-page treatments:
 * a layered scene behind the content (ThemeScene.tsx), a card the content
 * sits on, a rim and a glow around the wheel. That needs surfaces as well as
 * foregrounds — but the rule stays exactly as it was: every surface a word
 * is ever printed on is a token here, and is contrast-checked.
 *
 * Two deliberate restrictions on what may live in this file:
 *
 * - **Solid, opaque, six-digit hex only.** No gradients, no alpha. A test
 *   enforces it. Translucency is where contrast testing turns into
 *   hand-waving, because the colour behind the text stops being knowable.
 *   The scenes get their softness from `opacity` on decorative layers that
 *   never sit behind text.
 * - **Nothing that can reach the wheel face.** See R10 and the test for it.
 *
 * Where a surface is a gradient on screen (the card, the button), both ends
 * of it are tokens and the test walks the blend between them, so "the colour
 * actually behind the text" is checked rather than assumed.
 *
 * ## The three things this file is tuned for
 *
 * Retuned 2026-11-18. The six looks are the same six; what changed is the
 * discipline behind the numbers, and a new value should keep it:
 *
 * 1. **One hue per theme, many values.** A theme is a single light with a
 *    range of tones under it, not a collection of colours. The two places
 *    that broke this — plain's mint result panel and birthday's magenta body
 *    text under a rose heading — are the two places that read as unfinished.
 * 2. **Range earned at the dark end.** Each page runs to a `backgroundDeep`
 *    that is a real step away, not a shade. That range is what lets the
 *    scenes put near-white light on a page and have it register.
 * 3. **Headroom, not minimums.** Nothing here clears AA by a hair any more:
 *    the tightest pair in the file is 5.26:1 against a floor of 4.5. A token
 *    sitting on 4.6 is a token nobody dares adjust, which is how a palette
 *    ends up frozen.
 *
 * The accents are deliberately untouched. ThemeScene.tsx hand-paints 84
 * literal colours keyed to them — highlights, bokeh, glints — and those
 * cannot read a token, so moving an accent means repainting artwork rather
 * than retuning a palette.
 */

export const THEME_NAMES = [
  'plain',
  'black-friday',
  'christmas',
  'new-year',
  'halloween',
  'birthday',
] as const

export type ThemeName = (typeof THEME_NAMES)[number]

export interface ThemeTokens {
  /** The page colour. Painted flat on the screen element, under the scene. */
  background: string
  /** The far end of the page: vignette edges and the deepest gradient stop. */
  backgroundDeep: string
  /** The theme's signature colour — rims, hairlines, motifs. */
  accent: string
  /** The lighter half of the accent: glows, snow, sparks, lamplight. */
  accentSoft: string
  /** The card the content sits on. Top end of its gradient. */
  stage: string
  /** Bottom end of the card's gradient. */
  stageEdge: string
  /** The card's hairline. */
  stageBorder: string
  heading: string
  body: string
  /** Error text. Rose-600 was 3.5:1 on the dark cards, so themes set it. */
  danger: string
  buttonBg: string
  /** Top end of the button's gradient, so it reads as lit rather than flat. */
  buttonShine: string
  buttonText: string
  panelBg: string
  panelBorder: string
  panelHeading: string
  panelText: string
  /** The ring drawn around the wheel so it belongs to the scene. */
  wheelRim: string
}

/**
 * The foreground/surface pairs that must stay readable.
 *
 * Both ends of every gradient appear, and `blends` in the test walks the
 * colours in between: text on the card is checked against the card's top
 * *and* bottom *and* the middle, not just whichever end was convenient.
 *
 * `heading`/`body` are still checked against the raw page colour even though
 * the card normally covers it, so the page stays readable if a future layout
 * drops the card.
 */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [keyof ThemeTokens, keyof ThemeTokens]> = [
  ['heading', 'background'],
  ['body', 'background'],
  // The far end of the page as well as the near one. The scenes carry a wide
  // value range now — that range is most of why they read as designed rather
  // than coloured in — and `backgroundDeep` is the darkest (or, on a light
  // theme, the deepest) thing the vignette puts on screen. Checking it keeps
  // "deepen the edges" from quietly becoming "and the page stopped being
  // readable if the card ever goes away".
  ['heading', 'backgroundDeep'],
  ['body', 'backgroundDeep'],
  ['heading', 'stage'],
  ['heading', 'stageEdge'],
  ['body', 'stage'],
  ['body', 'stageEdge'],
  ['danger', 'stage'],
  ['danger', 'stageEdge'],
  ['buttonText', 'buttonBg'],
  ['buttonText', 'buttonShine'],
  ['panelHeading', 'panelBg'],
  ['panelText', 'panelBg'],
]

/**
 * Surfaces that are drawn as a two-stop gradient, as [from, to].
 *
 * The test interpolates each one and re-checks every foreground against the
 * steps in between. sRGB interpolation is monotonic per channel, so a pass at
 * both ends plus the middle is a pass across the whole sweep for text that
 * sits on one side of it — which the step check is there to confirm.
 */
export const GRADIENT_SURFACES: ReadonlyArray<readonly [keyof ThemeTokens, keyof ThemeTokens]> = [
  ['stage', 'stageEdge'],
  ['buttonShine', 'buttonBg'],
]

export const THEMES: Record<ThemeName, ThemeTokens> = {
  /**
   * Paper and ink. The year-round default, and the one that has to look
   * deliberate rather than unfinished: a warm white card on cool grey, one
   * graphite hairline, and a slate wash in the corners. No seasonal colour
   * at all, which is the point of R8.
   */
  plain: {
    background: '#F8FAFC',
    backgroundDeep: '#D2DCEA',
    accent: '#334155',
    accentSoft: '#94A3B8',
    stage: '#FFFFFF',
    stageEdge: '#F2F6FB',
    stageBorder: '#DCE3EC',
    heading: '#0E1626',
    body: '#42526B',
    danger: '#B01616',
    buttonBg: '#0E1626',
    buttonShine: '#334155',
    buttonText: '#FFFFFF',
    // The result panel used to be mint — #ECFDF5 inside #A7F3D0 — and it was
    // the one place this theme broke its own rule: a second hue, at a
    // saturation nothing else on the page came near, in the middle of a
    // graphite composition. A win still has to read as a win, so the green
    // stays; it is now a breath of it on near-white, and the signal is
    // carried by the depth of the type instead of the brightness of the
    // ground.
    panelBg: '#F2F7F4',
    panelBorder: '#CBDDD2',
    panelHeading: '#14532D',
    panelText: '#1E3A2C',
    wheelRim: '#BCC9D9',
  },

  /** Lit signage at night: black to the edges, one amber light source. */
  'black-friday': {
    background: '#0B0B0C',
    backgroundDeep: '#000000',
    accent: '#F59E0B',
    accentSoft: '#FCD34D',
    // One light source means one temperature. The card and the panel used to
    // be faintly blue (#141416, #D4D4D8) while the only lamp in the scene is
    // amber, which is the tell of a palette assembled from a grey ramp rather
    // than lit. Every neutral here now leans the way the light does.
    stage: '#161411',
    stageEdge: '#0D0C0A',
    stageBorder: '#4C443A',
    heading: '#FFFFFF',
    body: '#D8D4CC',
    danger: '#FCA5A5',
    buttonBg: '#F59E0B',
    buttonShine: '#FCD34D',
    buttonText: '#0B0B0C',
    panelBg: '#1D1A15',
    panelBorder: '#9A4A0E',
    panelHeading: '#FBBF24',
    panelText: '#E9E4DB',
    wheelRim: '#F59E0B',
  },

  /** A green night, snow coming down, and something warm lit below. */
  christmas: {
    background: '#0A3E2E',
    backgroundDeep: '#021B15',
    accent: '#DC2626',
    accentSoft: '#FCD9A0',
    stage: '#093426',
    stageEdge: '#05271D',
    // A brighter hairline than the old #1F7A4D, because this is the one theme
    // whose card is darker than its page: without a defined edge the card
    // stops being an object on the scene and becomes a hole in it.
    stageBorder: '#238A56',
    heading: '#FFF7ED',
    body: '#CFE3D6',
    danger: '#FCA5A5',
    // Seated a step deeper than the old #A81A1A/#C62222. A saturated red
    // button on a green ground is the loudest thing a page can do; held just
    // below the green's brightness it reads as lit rather than as a warning.
    buttonBg: '#9E1717',
    buttonShine: '#BC2020',
    buttonText: '#FFFFFF',
    panelBg: '#042A1F',
    panelBorder: '#15803D',
    panelHeading: '#FCA5A5',
    panelText: '#E7E5E4',
    wheelRim: '#E9C46A',
  },

  /** Midnight, gold leaf, and fireworks going off over the wheel. */
  'new-year': {
    background: '#0A1335',
    backgroundDeep: '#02051A',
    accent: '#D4AF37',
    accentSoft: '#F5D77A',
    stage: '#111B46',
    stageEdge: '#0A1231',
    stageBorder: '#41538F',
    heading: '#FFFFFF',
    // Warmed off the slate ramp (#CBD5E1) by a few degrees, so the body text
    // belongs to the same light as the gold rather than to a different one.
    body: '#CBD3E6',
    danger: '#FCA5A5',
    buttonBg: '#C79C27',
    buttonShine: '#E8C457',
    buttonText: '#0A1335',
    panelBg: '#101A48',
    panelBorder: '#B08D2A',
    panelHeading: '#F5D77A',
    panelText: '#E2E8F0',
    wheelRim: '#D4AF37',
  },

  /** A full moon, a cobweb in the corner, and a pumpkin glow from below. */
  halloween: {
    background: '#190A2C',
    backgroundDeep: '#080312',
    accent: '#F97316',
    accentSoft: '#FDBA74',
    stage: '#231038',
    stageEdge: '#180A27',
    // The violets were the brightest thing in this theme after the pumpkin
    // (#6B21A8 hairline, #7E22CE panel edge, #E9D5FF text), which left the
    // orange competing with them instead of being the only source of warmth
    // in a cold scene. They are deepened here; the orange is untouched.
    stageBorder: '#5E2A8A',
    heading: '#FFFFFF',
    body: '#E4D7F5',
    danger: '#FCA5A5',
    // Dark text on a bright orange, not white: white on this orange is
    // 3.56:1, below the AA floor.
    buttonBg: '#F97316',
    buttonShine: '#FB923C',
    buttonText: '#190A2C',
    panelBg: '#281142',
    panelBorder: '#6E2FA0',
    panelHeading: '#FDBA74',
    panelText: '#EBE6F7',
    wheelRim: '#F97316',
  },

  birthday: {
    // The one light theme besides plain: a birthday wants to feel bright
    // rather than atmospheric. Confetti, balloons, a white card.
    background: '#FDF2F8',
    // Deep enough that white reads as light on it. The scene's bokeh,
    // balloons and glints are all near-white, and against the old #FBD7E8
    // they were invisible — a light theme has to earn its value range at the
    // dark end, because it has nowhere to go at the light one. Taken one step
    // further here: the heading had only 4.88:1 on it, the tightest figure in
    // the whole file, and a token nobody dare touch is a token that will be
    // got wrong eventually.
    backgroundDeep: '#F4B4D0',
    accent: '#DB2777',
    accentSoft: '#FBCFE8',
    stage: '#FFFFFF',
    stageEdge: '#FFF3F9',
    stageBorder: '#F6A0CE',
    heading: '#8E1348',
    // One hue, not two. The body text was magenta (#86198F) under a rose
    // heading — close enough to look like a mistake rather than a decision,
    // which on a page this bright is the difference between a party and a
    // toy. It is the same rose as the heading now, one step lighter in the
    // way every other theme's body text is.
    body: '#7D1239',
    danger: '#B01616',
    // Pink-700, not pink-600: the brighter pink puts white text at 4.60:1,
    // which clears AA by too little to be worth the risk. The shine stop is
    // lighter than the base by the same margin, not by eye — white on
    // pink-600 (#DB2777) is 4.59:1, so the gradient stops short of it.
    buttonBg: '#A8124F',
    buttonShine: '#C5165C',
    buttonText: '#FFFFFF',
    panelBg: '#FFFFFF',
    panelBorder: '#F6A0CE',
    panelHeading: '#8E1348',
    panelText: '#3E3A3E',
    wheelRim: '#F6A0CE',
  },
}

/**
 * F04 R8. An unrecognised name — an older release's theme, or something
 * edited into the database — renders as plain rather than as a blank page.
 */
export function themeFor(name: string | null | undefined): ThemeTokens {
  return THEMES[(name ?? '') as ThemeName] ?? THEMES.plain
}

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value)
}

/**
 * The name to draw a scene for: a known theme, or plain for anything else.
 * Keeps the R8 fallback in one place rather than repeating it in the scene.
 */
export function sceneNameFor(name: string | null | undefined): ThemeName {
  return isThemeName(name ?? '') ? ((name ?? '') as ThemeName) : 'plain'
}

/** Exposes the tokens as CSS custom properties for a themed subtree. */
export function themeStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    '--bg': tokens.background,
    '--bg-deep': tokens.backgroundDeep,
    '--accent': tokens.accent,
    '--accent-soft': tokens.accentSoft,
    '--stage': tokens.stage,
    '--stage-edge': tokens.stageEdge,
    '--stage-border': tokens.stageBorder,
    '--heading': tokens.heading,
    '--body': tokens.body,
    '--danger': tokens.danger,
    '--button-bg': tokens.buttonBg,
    '--button-shine': tokens.buttonShine,
    '--button-text': tokens.buttonText,
    '--panel-bg': tokens.panelBg,
    '--panel-border': tokens.panelBorder,
    '--panel-heading': tokens.panelHeading,
    '--panel-text': tokens.panelText,
    '--wheel-rim': tokens.wheelRim,
  } as React.CSSProperties
}
