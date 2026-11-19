import { useState } from 'react'
import { ApiValidationError, type ApiViolation } from '../api/client'
import { saveGame, type GameSummary, type ThemeOption } from '../api/games'
import { useT } from '../i18n/I18nContext'

interface Draft {
  name: string
  tagline: string
  /**
   * A string, not a number, because this is what a text box holds: empty
   * means no limit, and an empty number input has no number in it to
   * represent that. The conversion happens once, on the way out.
   */
  dailyLimit: string
  theme: string
}

/**
 * A game's own fields (F27 R40): what it is called, what it says, and how
 * often one person may play it.
 *
 * Saved on its own, like the branding it descends from (F04 R5): folding it
 * into the prize list's Save would mean a rejected prize list silently
 * discarded the name too.
 */
export function GameSettings({
  game,
  maxDailyLimit,
  themes,
  onSaved,
}: {
  game: GameSummary
  maxDailyLimit: number
  themes: ThemeOption[]
  onSaved: (game: GameSummary) => void
}) {
  const t = useT()
  const initial: Draft = {
    name: game.name,
    // The admin's own value, not the effective one: pre-filling the type's
    // default would save it back as a deliberate choice and leave no way
    // back to it (F04 R29).
    tagline: game.ownTagline ?? '',
    dailyLimit: game.dailyLimit === null ? '' : String(game.dailyLimit),
    theme: game.theme,
  }

  const [draft, setDraft] = useState<Draft>(initial)
  const [saved, setSaved] = useState<Draft>(initial)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [violations, setViolations] = useState<ApiViolation[]>([])

  const dirty =
    draft.name !== saved.name ||
    draft.tagline !== saved.tagline ||
    draft.dailyLimit !== saved.dailyLimit ||
    draft.theme !== saved.theme

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setJustSaved(false)
    setViolations([])
    setError(null)
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    setViolations([])

    try {
      const limit = draft.dailyLimit.trim()

      /*
       * F27 R29. Anything typed in goes to the server as it was typed
       * rather than being silently repaired here — one place decides what a
       * valid limit is, and it is the one that also has to refuse the next
       * client.
       */
      const result = await saveGame(game.id, {
        name: draft.name,
        tagline: '' === draft.tagline.trim() ? null : draft.tagline,
        dailyLimit: '' === limit ? null : Number(limit),
        theme: draft.theme,
      })

      setSaved(draft)
      setJustSaved(true)
      onSaved(result)
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
      }

      setError(t('game.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const violationFor = (field: string) =>
    violations.find((violation) => violation.field === field)?.message

  return (
    <section aria-label={t('game.settings')} className={sectionClass} data-testid="game-settings">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
        {t('game.settings')}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="game-name" className={labelClass}>
            {t('game.name')}
          </label>
          <input
            id="game-name"
            type="text"
            value={draft.name}
            maxLength={60}
            aria-invalid={violationFor('name') !== undefined}
            onChange={(event) => change({ name: event.target.value })}
            className={inputClass}
          />
          {violationFor('name') !== undefined ? (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {violationFor('name')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t('game.nameHint')}</p>
          )}
        </div>

        {/* F27 R29. Beside the name rather than below it: both are facts
            about how this promotion is run. */}
        <div>
          <label htmlFor="game-daily-limit" className={labelClass}>
            {t('game.dailyLimit')}
          </label>
          <input
            id="game-daily-limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxDailyLimit}
            step={1}
            value={draft.dailyLimit}
            placeholder={t('game.dailyLimitBlank')}
            onChange={(event) => change({ dailyLimit: event.target.value })}
            className={inputClass}
          />
          {violationFor('dailyLimit') !== undefined ? (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {violationFor('dailyLimit')}
            </p>
          ) : (
            /* F23 R2 is the part that is not obvious from the label: it
               counts the person, so the stall cannot be worked around by
               typing the number in again. F27 R30 adds that each game
               counts its own. */
            <p className="mt-1 text-xs text-slate-500">{t('game.dailyLimitHint')}</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="game-tagline" className={labelClass}>
          {t('game.tagline')}
        </label>
        <input
          id="game-tagline"
          type="text"
          value={draft.tagline}
          maxLength={120}
          placeholder={game.defaultTagline}
          aria-invalid={violationFor('tagline') !== undefined}
          onChange={(event) => change({ tagline: event.target.value })}
          className={inputClass}
        />
        {violationFor('tagline') !== undefined ? (
          <p role="alert" className="mt-1 text-xs text-rose-600">
            {violationFor('tagline')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            {t('game.taglineHint', { default: game.defaultTagline })}
          </p>
        )}
      </div>

      {/* F30 R14. With the name, the tagline and the limit, because a
          theme is this promotion's look and not the shop's identity. */}
      <div className="mt-4 sm:w-1/2 sm:pr-2">
        <label htmlFor="game-theme" className={labelClass}>
          {t('game.theme')}
        </label>
        <select
          id="game-theme"
          value={draft.theme}
          onChange={(event) => change({ theme: event.target.value })}
          className={`${inputClass} bg-white`}
          data-testid="game-theme"
        >
          {themes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {violationFor('theme') !== undefined ? (
          <p role="alert" className="mt-1 text-xs text-rose-600">
            {violationFor('theme')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">{t('game.themeHint')}</p>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !dirty}
          data-testid="save-game"
          className={primaryButtonClass}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>

        {justSaved && !dirty && (
          <span role="status" className="text-sm text-emerald-700">
            {t('common.saved')}
          </span>
        )}
        {dirty && !saving && (
          <span className="text-sm text-slate-400">{t('common.unsavedChanges')}</span>
        )}
      </div>
    </section>
  )
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
