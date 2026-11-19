import { describe, expect, it } from 'vitest'
import { SLICE_COLOURS } from '../games/wheel/palette'
import {
  CONTRAST_PAIRS,
  GRADIENT_SURFACES,
  THEMES,
  THEME_NAMES,
  isThemeName,
  sceneNameFor,
  themeFor,
  themeStyle,
  type ThemeName,
  type ThemeTokens,
} from './themes'

/** https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function luminance(hex: string): number {
  const channels = (hex.replace('#', '').match(/../g) ?? []).map((pair) => {
    const value = Number.parseInt(pair, 16) / 255

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (high + 0.05) / (low + 0.05)
}

function channels(hex: string): number[] {
  return (hex.replace('#', '').match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16))
}

/** The colour `ratio` of the way along a two-stop gradient, as the GPU mixes it. */
function mix(from: string, to: string, ratio: number): string {
  const [a, b] = [channels(from), channels(to)]
  const hex = a
    .map((value, index) => Math.round(value + (b[index] - value) * ratio))
    .map((value) => value.toString(16).padStart(2, '0').toUpperCase())
    .join('')

  return `#${hex}`
}

/** Every token a word is ever printed in. Each must be checked by a pair. */
const FOREGROUNDS: ReadonlyArray<keyof ThemeTokens> = [
  'heading',
  'body',
  'danger',
  'buttonText',
  'panelHeading',
  'panelText',
]

describe('the themes', () => {
  /** F04 R7, amended 2026-11-15 to add birthday */
  it('are exactly the ones the backend knows about', () => {
    expect(THEME_NAMES).toEqual([
      'plain',
      'black-friday',
      'christmas',
      'new-year',
      'halloween',
      'birthday',
    ])
    expect(Object.keys(THEMES)).toEqual([...THEME_NAMES])
  })

  /**
   * F04 R11. This is the test that earns its keep: the Halloween button was
   * white on orange at 3.56:1 until it failed here.
   */
  it.each(THEME_NAMES)('keep every text colour readable on %s', (name) => {
    const tokens = THEMES[name]

    for (const [foreground, surface] of CONTRAST_PAIRS) {
      const ratio = contrast(tokens[foreground], tokens[surface])

      expect(
        ratio,
        `${name}: ${foreground} (${tokens[foreground]}) on ${surface} (${tokens[surface]}) is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum.`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * Opaque six-digit hex, every one of them. The scenes are full of soft
   * light, but none of it lives here: a translucent token is a surface whose
   * real colour is unknowable, and the test above would be measuring a
   * colour that is never on screen. See the note at the top of themes.ts.
   */
  it.each(THEME_NAMES)('defines every token on %s as an opaque colour', (name) => {
    for (const value of Object.values(THEMES[name])) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  /**
   * Both ends of a gradient are tokens, and this walks the colours in
   * between — the text sits on the middle of the card and the middle of the
   * button, not on either end of them.
   */
  it.each(THEME_NAMES)('keeps text readable across every gradient on %s', (name) => {
    const tokens = THEMES[name]
    const steps = [0.25, 0.5, 0.75]

    for (const [from, to] of GRADIENT_SURFACES) {
      for (const foreground of FOREGROUNDS) {
        // Only the foregrounds that are actually checked against this
        // surface; panel text is never printed on the button.
        const checked = CONTRAST_PAIRS.some(
          ([text, surface]) => text === foreground && (surface === from || surface === to),
        )

        if (!checked) {
          continue
        }

        for (const step of steps) {
          const blend = mix(tokens[from], tokens[to], step)
          const ratio = contrast(tokens[foreground], blend)

          expect(
            ratio,
            `${name}: ${foreground} (${tokens[foreground]}) is ${ratio.toFixed(2)}:1 at ${step * 100}% along ${from}→${to} (${blend}), below the 4.5:1 minimum.`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  /**
   * The guard that makes the one above hold in future: a new text colour
   * cannot be added without a pair to check it, because this fails first.
   */
  it('checks every foreground colour against a surface', () => {
    const tokenNames = Object.keys(THEMES.plain) as (keyof ThemeTokens)[]
    const checked = new Set(CONTRAST_PAIRS.map(([foreground]) => foreground))

    // Any token whose name reads like text must be in the FOREGROUNDS list.
    const textish = tokenNames.filter((name) => /heading|body|text|danger/i.test(name))
    expect([...textish].sort()).toEqual([...FOREGROUNDS].sort())

    for (const foreground of FOREGROUNDS) {
      expect(checked, `${foreground} is never contrast-checked against anything`).toContain(
        foreground,
      )
    }
  })

  /**
   * F04 R10. A theme has no way to reach the wheel face: there is no token
   * for a slice, a label or the pointer, so no seasonal look can make a
   * prize name unreadable. `wheelRim` is the ring the player page draws
   * *around* the wheel, outside the SVG entirely.
   *
   * That the rendered wheel is identical on every theme is asserted where it
   * can actually be observed, in PlayerPage.test.tsx and the e2e suite.
   */
  it('define no token that could reach the wheel face', () => {
    const tokenNames = Object.keys(THEMES.plain)

    expect(tokenNames.filter((name) => /slice|prize|label|pointer|face/i.test(name))).toEqual([])
    expect(tokenNames.filter((name) => /wheel/i.test(name))).toEqual(['wheelRim'])
    expect(SLICE_COLOURS).toHaveLength(12)
  })

  it('give each theme a distinct background', () => {
    const backgrounds = THEME_NAMES.map((name) => THEMES[name].background)

    expect(new Set(backgrounds).size).toBe(THEME_NAMES.length)
  })

  it('make plain the lightest and black friday the darkest', () => {
    expect(luminance(THEMES.plain.background)).toBeGreaterThan(0.8)
    expect(luminance(THEMES['black-friday'].background)).toBeLessThan(0.05)
  })

  /**
   * The vignette and the deepest gradient stop go outwards from the page
   * colour, never back towards the middle: a scene that got lighter at the
   * edges than in the centre would read as a printing error.
   */
  it.each(THEME_NAMES)('sends the %s scene away from the page colour', (name) => {
    const tokens = THEMES[name]
    const page = luminance(tokens.background)
    const deep = luminance(tokens.backgroundDeep)

    if (page > 0.5) {
      expect(deep, `${name}: backgroundDeep is lighter than the page`).toBeLessThan(page)
    } else {
      expect(deep, `${name}: backgroundDeep is lighter than the page`).toBeLessThanOrEqual(page)
    }
  })

  /** Each theme's signature colour is its own, so no two scenes glow alike. */
  it('give each theme its own accent', () => {
    const accents = THEME_NAMES.map((name) => THEMES[name].accent)

    expect(new Set(accents).size).toBe(THEME_NAMES.length)
  })
})

describe('themeFor', () => {
  it('returns the tokens for a known theme', () => {
    expect(themeFor('halloween')).toBe(THEMES.halloween)
  })

  /** F04 R8 */
  it.each([null, undefined, '', 'easter', 'Christmas', '../../etc/passwd'])(
    'falls back to plain for %p',
    (value) => {
      expect(themeFor(value)).toBe(THEMES.plain)
    },
  )
})

describe('sceneNameFor', () => {
  it('names the scene for a known theme', () => {
    expect(sceneNameFor('halloween')).toBe('halloween')
  })

  /** F04 R8 again, this time for the decoration. */
  it.each([null, undefined, '', 'easter', 'Christmas'])('draws the plain scene for %p', (value) => {
    expect(sceneNameFor(value)).toBe('plain')
  })
})

describe('isThemeName', () => {
  it('accepts the five and rejects anything else', () => {
    for (const name of THEME_NAMES) {
      expect(isThemeName(name)).toBe(true)
    }

    expect(isThemeName('easter')).toBe(false)
    expect(isThemeName('')).toBe(false)
  })
})

describe('themeStyle', () => {
  it('exposes every token as a custom property', () => {
    const style = themeStyle(THEMES.christmas) as Record<string, string>

    expect(style['--bg']).toBe(THEMES.christmas.background)
    expect(style['--heading']).toBe(THEMES.christmas.heading)
    expect(style['--button-bg']).toBe(THEMES.christmas.buttonBg)
    expect(style['--panel-heading']).toBe(THEMES.christmas.panelHeading)
  })

  it('covers every token in the theme', () => {
    const style = themeStyle(THEMES.plain) as Record<string, string>

    expect(Object.keys(style)).toHaveLength(Object.keys(THEMES.plain as object).length)
  })
})

describe('the theme type', () => {
  it('keeps ThemeName in step with the names list', () => {
    const name: ThemeName = 'new-year'

    expect(THEME_NAMES).toContain(name)
  })
})
