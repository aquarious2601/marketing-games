/**
 * Which languages exist, and how one is chosen (F12 R1–R4, R7).
 *
 * Deliberately free of React and of the dictionaries, so the choosing rules
 * can be tested as plain functions — the part most likely to be wrong is
 * `fr-CA` and `zh-TW`, and that deserves a test that does not render
 * anything.
 */

export const LOCALES = ['en', 'fr', 'zh', 'vi'] as const

export type Locale = (typeof LOCALES)[number]

/** F12 R2: the one language every key is guaranteed to exist in. */
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * F12 R6: each language named **in that language**.
 *
 * Somebody who cannot read the language currently on screen has to be able
 * to find their own, and "Vietnamese" written in Chinese helps nobody.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  zh: '中文',
  vi: 'Tiếng Việt',
}

/** Where a chosen language is remembered (F12 R7). */
export const STORAGE_KEY = 'roulette.locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * F12 R4: a regional tag is its language. `fr-CA` is French, `zh-TW` is
 * Chinese, `en-GB` is English.
 *
 * Returns null rather than a default, so callers can tell "not one of ours"
 * from "English" — `detect` needs that difference to keep looking down the
 * browser's list.
 */
export function localeFrom(tag: string): Locale | null {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0]

  return isLocale(base) ? base : null
}

/**
 * The language to open in (F12 R3, R7).
 *
 * A stored choice wins, because somebody who picked a language meant it. A
 * stored value we no longer support is ignored rather than honoured, so
 * removing a language does not leave a browser stuck on it.
 *
 * Otherwise the browser's list is walked **in order**: it is already sorted
 * by preference, so the first match is the best one we can offer.
 */
export function detectLocale(stored: string | null, preferred: readonly string[]): Locale {
  if (isLocale(stored)) {
    return stored
  }

  for (const tag of preferred) {
    const locale = localeFrom(tag)

    if (locale !== null) {
      return locale
    }
  }

  return DEFAULT_LOCALE
}

/**
 * What the browser says it wants, most-preferred first.
 *
 * `languages` is the full list and `language` is only the top one; older
 * browsers and some test environments have just the latter, so both are
 * read and deduplicated.
 */
export function preferredLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return []
  }

  const list = Array.isArray(navigator.languages) ? navigator.languages : []

  return [...new Set([...list, navigator.language].filter((tag): tag is string => Boolean(tag)))]
}

/**
 * Reading and writing the stored choice, both wrapped.
 *
 * `localStorage` throws in a private window and in some embedded browsers,
 * and a language preference is not worth a blank page: a failure here means
 * the browser's own preference is used instead, which is the behaviour
 * somebody who has never chosen gets anyway.
 */
export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Ignored on purpose; see above.
  }
}
