import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { setApiLocale } from '../api/client'
import { en, type MessageKey } from './en'
import { fr } from './fr'
import { vi } from './vi'
import { zh } from './zh'
import {
  DEFAULT_LOCALE,
  detectLocale,
  preferredLanguages,
  readStoredLocale,
  storeLocale,
  type Locale,
} from './locales'

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, fr, zh, vi }

export type Translate = (key: MessageKey, parameters?: Record<string, string | number>) => string

interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18n | null>(null)

/**
 * The language the whole app is in (F12 R3, R5, R7).
 *
 * The locale is state rather than a module variable so that changing it
 * re-renders everything that reads it — F12 R5 says the page changes
 * immediately, with no reload, and that is only true if React knows.
 *
 * The initial value is computed once, in the initialiser rather than in an
 * effect: deciding the language after the first paint means a French player
 * sees a frame of English, which on a slow phone is long enough to read.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = detectLocale(readStoredLocale(), preferredLanguages())

    // F12 R8: the API answers in the language the page is in, so the client
    // has to know before the first request goes out.
    setApiLocale(initial)

    return initial
  })

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    storeLocale(next)
    setApiLocale(next)
  }, [])

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, parameters) => translate(locale, key, parameters),
    }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Reading the language, and the function that turns a key into words.
 *
 * Outside a provider this falls back to English rather than throwing. A
 * missing provider should not be able to blank the page — the point of the
 * whole feature is words on screen, and English words are a far better
 * failure than none.
 */
export function useI18n(): I18n {
  const context = useContext(I18nContext)

  if (context !== null) {
    return context
  }

  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key, parameters) => translate(DEFAULT_LOCALE, key, parameters),
  }
}

/** The common case, for components that only need the words. */
export function useT(): Translate {
  return useI18n().t
}

/**
 * F12 R2: a key missing from a language falls back to English rather than
 * showing the key. A raw `players.colPhone` on screen is a bug a shop has to
 * report; an English word in a Vietnamese table is merely a translation
 * nobody has written yet.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  parameters: Record<string, string | number> = {},
): string {
  const template = DICTIONARIES[locale][key] ?? en[key] ?? key

  return Object.entries(parameters).reduce(
    (text, [name, value]) => text.split(`%${name}%`).join(String(value)),
    template,
  )
}
