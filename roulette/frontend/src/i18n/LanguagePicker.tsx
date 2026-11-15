import { useI18n } from './I18nContext'
import { LOCALES, LOCALE_NAMES, isLocale } from './locales'

interface LanguagePickerProps {
  /**
   * `player` is themed and sits on the game's card; `admin` is the plain
   * slate styling the rest of the admin frame uses.
   */
  variant?: 'player' | 'admin'
  className?: string
}

/**
 * Choosing a language (F12 R5, R6).
 *
 * A native `<select>`, not four buttons. Four language names in a row do not
 * fit what a 375px phone has left once F08's identity line has had its
 * share, and a select is the control a phone renders best — it opens as the
 * platform's own list, which is the one thing on the page a visitor will
 * already recognise.
 *
 * Each language is named **in that language** (F12 R6): somebody who cannot
 * read the current one has to be able to find their own, and "Vietnamese"
 * written in Chinese helps nobody.
 */
export function LanguagePicker({ variant = 'player', className = '' }: LanguagePickerProps) {
  const { locale, setLocale, t } = useI18n()

  const player = variant === 'player'

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      {/* The label is for assistive technology only. On screen the chosen
          language names itself, which is the whole point of R6 — a word
          saying "Language" in a script the reader cannot read adds nothing. */}
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            setLocale(event.target.value)
          }
        }}
        data-testid="language-picker"
        aria-label={t('language.label')}
        className={
          player
            ? 'player-kicker cursor-pointer rounded-full border bg-transparent px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'
            : 'cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500'
        }
        style={
          player
            ? { borderColor: 'var(--stage-border)', color: 'var(--body)' }
            : undefined
        }
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  )
}
