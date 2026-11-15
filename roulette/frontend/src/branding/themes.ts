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
    backgroundDeep: '#DEE6F0',
    accent: '#334155',
    accentSoft: '#94A3B8',
    stage: '#FFFFFF',
    stageEdge: '#F4F7FB',
    stageBorder: '#E2E8F0',
    heading: '#0F172A',
    body: '#475569',
    danger: '#B91C1C',
    buttonBg: '#0F172A',
    buttonShine: '#334155',
    buttonText: '#FFFFFF',
    panelBg: '#ECFDF5',
    panelBorder: '#A7F3D0',
    panelHeading: '#065F46',
    panelText: '#064E3B',
    wheelRim: '#CBD5E1',
  },

  /** Lit signage at night: black to the edges, one amber light source. */
  'black-friday': {
    background: '#0B0B0C',
    backgroundDeep: '#000000',
    accent: '#F59E0B',
    accentSoft: '#FCD34D',
    stage: '#141416',
    stageEdge: '#0C0C0E',
    stageBorder: '#45403A',
    heading: '#FFFFFF',
    body: '#D4D4D8',
    danger: '#FCA5A5',
    buttonBg: '#F59E0B',
    buttonShine: '#FCD34D',
    buttonText: '#0B0B0C',
    panelBg: '#1C1917',
    panelBorder: '#92400E',
    panelHeading: '#FBBF24',
    panelText: '#E7E5E4',
    wheelRim: '#F59E0B',
  },

  /** A green night, snow coming down, and something warm lit below. */
  christmas: {
    background: '#0B3D2E',
    backgroundDeep: '#04201A',
    accent: '#DC2626',
    accentSoft: '#FCD9A0',
    stage: '#0A3527',
    stageEdge: '#06281E',
    stageBorder: '#1F7A4D',
    heading: '#FFF7ED',
    body: '#CFE3D6',
    danger: '#FCA5A5',
    buttonBg: '#A81A1A',
    buttonShine: '#C62222',
    buttonText: '#FFFFFF',
    panelBg: '#052E22',
    panelBorder: '#15803D',
    panelHeading: '#FCA5A5',
    panelText: '#E7E5E4',
    wheelRim: '#E9C46A',
  },

  /** Midnight, gold leaf, and fireworks going off over the wheel. */
  'new-year': {
    background: '#0B1437',
    backgroundDeep: '#04081E',
    accent: '#D4AF37',
    accentSoft: '#F5D77A',
    stage: '#121C47',
    stageEdge: '#0B1333',
    stageBorder: '#3B4C8A',
    heading: '#FFFFFF',
    body: '#CBD5E1',
    danger: '#FCA5A5',
    buttonBg: '#C79C27',
    buttonShine: '#E8C457',
    buttonText: '#0B1437',
    panelBg: '#111C4A',
    panelBorder: '#B08D2A',
    panelHeading: '#F5D77A',
    panelText: '#E2E8F0',
    wheelRim: '#D4AF37',
  },

  /** A full moon, a cobweb in the corner, and a pumpkin glow from below. */
  halloween: {
    background: '#1A0B2E',
    backgroundDeep: '#0A0415',
    accent: '#F97316',
    accentSoft: '#FDBA74',
    stage: '#241139',
    stageEdge: '#190B29',
    stageBorder: '#6B21A8',
    heading: '#FFFFFF',
    body: '#E9D5FF',
    danger: '#FCA5A5',
    // Dark text on a bright orange, not white: white on this orange is
    // 3.56:1, below the AA floor.
    buttonBg: '#F97316',
    buttonShine: '#FB923C',
    buttonText: '#1A0B2E',
    panelBg: '#2A1246',
    panelBorder: '#7E22CE',
    panelHeading: '#FDBA74',
    panelText: '#EDE9FE',
    wheelRim: '#F97316',
  },

  birthday: {
    // The one light theme besides plain: a birthday wants to feel bright
    // rather than atmospheric. Confetti, balloons, a white card.
    background: '#FDF2F8',
    // Deep enough that white reads as light on it. The scene's bokeh,
    // balloons and glints are all near-white, and against the old #FBD7E8
    // they were invisible — a light theme has to earn its value range at the
    // dark end, because it has nowhere to go at the light one. Still 4.88:1
    // under the heading and 5.09:1 under the body text, both checked.
    backgroundDeep: '#F6BBD5',
    accent: '#DB2777',
    accentSoft: '#FBCFE8',
    stage: '#FFFFFF',
    stageEdge: '#FFF4FA',
    stageBorder: '#F9A8D4',
    heading: '#9D174D',
    body: '#86198F',
    danger: '#B91C1C',
    // Pink-700, not pink-600: the brighter pink puts white text at 4.60:1,
    // which clears AA by too little to be worth the risk. The shine stop is
    // lighter than the base by the same margin, not by eye — white on
    // pink-600 (#DB2777) is 4.59:1, so the gradient stops short of it.
    buttonBg: '#A8124F',
    buttonShine: '#C5165C',
    buttonText: '#FFFFFF',
    panelBg: '#FFFFFF',
    panelBorder: '#F9A8D4',
    panelHeading: '#9D174D',
    panelText: '#3F3F46',
    wheelRim: '#F9A8D4',
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
