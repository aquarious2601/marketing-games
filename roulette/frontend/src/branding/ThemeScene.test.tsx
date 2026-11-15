import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import SCENE_SOURCE from './ThemeScene.tsx?raw'
import { ThemeScene } from './ThemeScene'
import { THEME_NAMES } from './themes'

/*
 * Some of the tests below read source rather than a rendered result, because
 * what they check is a promise about the stylesheet — that no ambient
 * animation escapes the reduced-motion guard — and jsdom applies no
 * stylesheet at all, so there is nothing to observe on the page.
 *
 * The stylesheet is read off disk rather than imported: Vitest stubs CSS
 * imports out, so even `?raw` comes back empty. Resolved from the working
 * directory because under Vitest `import.meta.url` is an http URL.
 */
const STYLESHEET = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

const REDUCED_MOTION_GUARD = '@media (prefers-reduced-motion: no-preference)'

/** The contents of every `no-preference` block, with the blocks themselves removed. */
function splitOnMotionGuard(css: string): { guarded: string; unguarded: string } {
  let unguarded = css
  let guarded = ''

  for (;;) {
    const start = unguarded.indexOf(REDUCED_MOTION_GUARD)

    if (start === -1) {
      return { guarded, unguarded }
    }

    // Brace-match from the block's opening brace to its close, so nested
    // rules inside the media query come out with it.
    let depth = 0
    let end = unguarded.indexOf('{', start)

    for (let index = end; index < unguarded.length; index += 1) {
      if (unguarded[index] === '{') {
        depth += 1
      } else if (unguarded[index] === '}') {
        depth -= 1

        if (depth === 0) {
          end = index
          break
        }
      }
    }

    guarded += unguarded.slice(start, end + 1)
    unguarded = unguarded.slice(0, start) + unguarded.slice(end + 1)
  }
}

describe('the theme scene', () => {
  it.each(THEME_NAMES)('draws the %s scene', (theme) => {
    render(<ThemeScene theme={theme} />)

    expect(screen.getByTestId('theme-scene')).toHaveAttribute('data-scene', theme)
  })

  /** F04 R8, for the decoration as well as the colours. */
  it.each([null, undefined, '', 'easter'])('draws the plain scene for %p', (theme) => {
    render(<ThemeScene theme={theme} />)

    expect(screen.getByTestId('theme-scene')).toHaveAttribute('data-scene', 'plain')
  })

  /**
   * F03 R13 and the spin generally: the scene is decoration and must never be
   * able to swallow a press of Spin, or be read out before the prize is.
   */
  it.each(THEME_NAMES)('keeps the %s scene out of the way', (theme) => {
    render(<ThemeScene theme={theme} />)
    const scene = screen.getByTestId('theme-scene')

    expect(scene).toHaveAttribute('aria-hidden', 'true')
    expect(scene.className).toContain('pointer-events-none')
    // Stacked below the content, so nothing decorative lands on top of the
    // wheel while it is turning.
    expect(scene.className).toContain('-z-10')
    expect(scene.className).toContain('overflow-hidden')
  })

  it.each(THEME_NAMES)('gives the %s scene something to look at', (theme) => {
    const { container } = render(<ThemeScene theme={theme} />)
    const scene = container.querySelector('[data-testid="theme-scene"]')

    // Every theme is a treatment, not a flat colour: the thin ones were the
    // problem this work set out to fix.
    expect(scene?.children.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  /**
   * No photographs, no icon fonts, no sprite sheets: a market stall gets one
   * bad bar of signal and the page still has to look like the promotion.
   */
  it.each(THEME_NAMES)('loads nothing over the network for %s', (theme) => {
    const { container } = render(<ThemeScene theme={theme} />)
    const html = container.innerHTML

    expect(container.querySelectorAll('img, image, use')).toHaveLength(0)
    expect(html).not.toMatch(/url\(\s*['"]?(https?:)?\/\//i)
    expect(html).not.toContain('@import')
  })

  /**
   * Blur is the expensive one — it repaints a whole layer every frame — and
   * these scenes animate for as long as the page is open, on whatever phone
   * the player happens to have.
   */
  it.each(THEME_NAMES)('paints the %s scene without a blur filter', (theme) => {
    const { container } = render(<ThemeScene theme={theme} />)

    expect(container.innerHTML).not.toMatch(/blur\(/)
    expect(container.innerHTML).not.toMatch(/backdrop-filter/)
  })
})

/**
 * The reduced-motion promise, checked against the stylesheet rather than
 * taken on trust. Ambient motion stops; the spin, which the player asked for
 * by pressing a button, does not (F03 §13).
 */
describe('ambient motion', () => {
  it('declares every animation inside the reduced-motion guard', () => {
    const { guarded, unguarded } = splitOnMotionGuard(STYLESHEET)

    expect(guarded, 'index.css has no prefers-reduced-motion block at all').toContain('animation:')
    expect(
      unguarded.match(/\banimation(-name)?\s*:/g),
      'an animation is declared outside the prefers-reduced-motion: no-preference block, so it would keep running for a player who asked for less motion',
    ).toBeNull()
  })

  it('defines an animation for every scene class the scenes use', () => {
    const { guarded } = splitOnMotionGuard(STYLESHEET)
    // The lookbehind drops the custom properties (`--scene-shift` and the
    // rest), leaving only the class names.
    const used = new Set(SCENE_SOURCE.match(/(?<!-)\bscene-[a-z]+/g) ?? [])

    expect(used.size).toBeGreaterThan(0)

    for (const className of used) {
      expect(guarded, `.${className} is used by a scene but has no animation`).toContain(
        `.${className} {`,
      )
    }
  })

  /**
   * A tiled field only loops invisibly when it slides by exactly one tile, so
   * the distance is per-layer rather than baked into the keyframes.
   */
  it('drives every keyframe from a custom property, not a fixed distance', () => {
    expect(STYLESHEET).toContain('translateY(var(--scene-shift')
    expect(STYLESHEET).toContain('var(--scene-duration')
  })

  /** Transform and opacity only: anything else repaints (constraint 8). */
  it('animates nothing but transform and opacity', () => {
    const keyframes = STYLESHEET.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? []

    expect(keyframes.length).toBeGreaterThanOrEqual(5)

    for (const block of keyframes) {
      const properties = (block.match(/^\s*([a-z-]+)\s*:/gm) ?? []).map((line) =>
        line.trim().replace(':', ''),
      )

      for (const property of properties) {
        expect(['transform', 'opacity'], `@keyframes animates ${property}`).toContain(property)
      }
    }
  })
})
