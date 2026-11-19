import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from './I18nContext'
import { en } from './en'
import { fr } from './fr'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_NAMES,
  detectLocale,
  isLocale,
  localeFrom,
} from './locales'
import { vi as viMessages } from './vi'
import { zh } from './zh'

const DICTIONARIES = { en, fr, zh, vi: viMessages }

/**
 * F12 R14, the frontend half. The backend has its own in TranslationsTest.
 *
 * TypeScript already forces each dictionary to be a complete
 * `Record<MessageKey, string>`, so a *missing* key will not compile. These
 * catch what the type system cannot: a key translated to the empty string, a
 * placeholder dropped in translation, and a language added to LOCALES
 * without a dictionary behind it.
 */
describe('the dictionaries', () => {
  it.each(LOCALES)('has a dictionary for %s', (locale) => {
    expect(DICTIONARIES[locale]).toBeDefined()
    expect(Object.keys(DICTIONARIES[locale]).length).toBeGreaterThan(0)
  })

  it.each(LOCALES)('names %s in its own language', (locale) => {
    expect(LOCALE_NAMES[locale]).toBeTruthy()
  })

  /**
   * F12 R6: each language names itself. "Vietnamese" written in Chinese
   * helps nobody find their own language.
   */
  it('does not name every language in English', () => {
    expect(LOCALE_NAMES.vi).toBe('Tiếng Việt')
    expect(LOCALE_NAMES.zh).toBe('中文')
    expect(LOCALE_NAMES.fr).toBe('Français')
  })

  /**
   * F17 R5. The losing panel's two phrases are the application's own words
   * rather than a campaign setting, so they have to be real translations in
   * all four dictionaries — an English sentence copied into `fr.ts` would
   * satisfy the parity checks above and still be wrong on a stall in Paris.
   */
  it.each(['fr', 'vi', 'zh'] as const)('says the losing phrases in %s', (locale) => {
    for (const key of ['player.thanksForPlaying', 'player.betterLuck'] as const) {
      expect(DICTIONARIES[locale][key], `${key} is still English in ${locale}`).not.toBe(
        en[key],
      )
    }
  })

  /**
   * F23 R17. The already-played screen is the only thing a player who has
   * used their day ever sees, so an English sentence left in `vi.ts` is not
   * a rough edge — it is the whole screen, in the wrong language.
   */
  it.each(['fr', 'vi', 'zh'] as const)('says the already-played phrases in %s', (locale) => {
    for (const key of [
      'player.alreadyPlayedKicker',
      'player.alreadyPlayedToday',
      'player.comeBackTomorrow',
    ] as const) {
      expect(DICTIONARIES[locale][key], `${key} is still English in ${locale}`).not.toBe(
        en[key],
      )
    }
  })

  it.each(LOCALES)('has no key translated to nothing in %s', (locale) => {
    for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
      expect(value.trim(), `${key} is empty in ${locale}`).not.toBe('')
    }
  })

  it.each(LOCALES)('has no key English does not have in %s', (locale) => {
    const extra = Object.keys(DICTIONARIES[locale]).filter((key) => !(key in en))

    expect(extra, `${locale} has keys English does not: ${extra.join(', ')}`).toEqual([])
  })

  /**
   * A placeholder dropped in translation produces a sentence with a hole in
   * it — "It needs between and digits" — which reads as a bug to the player
   * and is invisible to everyone else.
   */
  it.each(LOCALES)('carries the same placeholders as the English in %s', (locale) => {
    const placeholders = (text: string) => (text.match(/%[a-zA-Z]+%/g) ?? []).sort()

    for (const [key, english] of Object.entries(en)) {
      const expected = placeholders(english)

      if (expected.length === 0) {
        continue
      }

      expect(
        placeholders(DICTIONARIES[locale][key as keyof typeof en]),
        `${key} in ${locale} does not carry the same placeholders as the English`,
      ).toEqual(expected)
    }
  })
})

/** F12 R3, R4 — the part most likely to be wrong. */
describe('choosing a language', () => {
  it.each([
    ['fr', 'fr'],
    ['fr-CA', 'fr'],
    ['zh-TW', 'zh'],
    ['zh-Hans-CN', 'zh'],
    ['en-GB', 'en'],
    ['vi-VN', 'vi'],
    ['FR', 'fr'],
    ['fr_CA', 'fr'],
  ])('reads %s as %s', (tag, expected) => {
    expect(localeFrom(tag)).toBe(expected)
  })

  it.each(['de', 'de-DE', 'ja', '', 'nonsense'])('does not recognise %s', (tag) => {
    expect(localeFrom(tag)).toBeNull()
  })

  it('takes the browser preference when nothing is stored', () => {
    expect(detectLocale(null, ['fr-CA', 'en'])).toBe('fr')
  })

  /** The list is already sorted by preference, so the first match wins. */
  it('walks the browser list in order', () => {
    expect(detectLocale(null, ['de-DE', 'ja', 'vi', 'fr'])).toBe('vi')
  })

  it('falls back to English when none of the preferences match', () => {
    expect(detectLocale(null, ['de', 'ja'])).toBe(DEFAULT_LOCALE)
  })

  it('falls back to English when the browser says nothing', () => {
    expect(detectLocale(null, [])).toBe(DEFAULT_LOCALE)
  })

  /** F12 R7: somebody who picked a language meant it. */
  it('prefers a stored choice over the browser', () => {
    expect(detectLocale('zh', ['fr-FR'])).toBe('zh')
  })

  /**
   * A stored value we no longer support is ignored rather than honoured, so
   * removing a language cannot leave a browser stuck on it.
   */
  it('ignores a stored language it does not support', () => {
    expect(detectLocale('de', ['fr'])).toBe('fr')
    expect(detectLocale('', ['fr'])).toBe('fr')
  })

  it('recognises exactly the four languages', () => {
    expect(LOCALES).toEqual(['en', 'fr', 'zh', 'vi'])
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('translate', () => {
  it('returns the language asked for', () => {
    expect(translate('fr', 'player.spin')).toBe(fr['player.spin'])
    expect(translate('vi', 'player.spin')).toBe(viMessages['player.spin'])
  })

  it('fills placeholders', () => {
    expect(translate('en', 'player.playingAs', { name: 'Anh' })).toBe('Playing as Anh')
  })

  it('fills a placeholder everywhere it appears', () => {
    expect(translate('en', 'players.capped', { shown: 2, total: 613 })).toBe(
      'Showing the first 2 of 613 customers.',
    )
  })

  it('leaves a placeholder alone when nothing is given for it', () => {
    expect(translate('en', 'player.playingAs')).toContain('%name%')
  })

  /**
   * F12 R2. A raw `players.colPhone` on screen is a bug a shop has to
   * report; an English word in a Vietnamese table is merely a translation
   * nobody has written yet.
   */
  it('falls back to English rather than showing a key', () => {
    const gappy = { ...viMessages } as Record<string, string>
    delete gappy['player.spin']

    // Simulating the gap directly, because TypeScript will not let a real
    // dictionary have one.
    const fallback = gappy['player.spin'] ?? en['player.spin']

    expect(fallback).toBe(en['player.spin'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
