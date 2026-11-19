import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchStore,
  removeLogo,
  saveStore,
  uploadLogo,
  type AdminStore,
} from '../api/branding'
import { ApiValidationError, type ApiViolation } from '../api/client'
import { LOCALES, LOCALE_NAMES } from '../i18n/locales'
import { useT } from '../i18n/I18nContext'
import { CurrencySelect } from './CurrencySelect'

const NAME_MAX_LENGTH = 60

type LoadPhase = 'loading' | 'ready' | 'failed'

interface Draft {
  companyName: string
  /** F15 R10: the shop's currency, edited here as well as in Rewards. */
  currency: string
  /** F27 R17. Empty means no choice, and the browser decides. */
  language: string
  /** F27 R15. Never empty once saved: the form requires one. */
  timezone: string
}

/**
 * The Store module (F27 R37): the shop, and everything every one of its
 * games shows.
 *
 * This was F04's branding section inside the Game module. What moved out of
 * it went to the game that owns it — the campaign's name is a game's name,
 * the tagline is a game's phrase, the daily limit is a game's allowance
 * (R11) — and what moved in is the shop's own: the language its player pages
 * open in, and the clock its day is counted on.
 */
export function StoreModule() {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [store, setStore] = useState<AdminStore | null>(null)
  const [draft, setDraft] = useState<Draft>({
    companyName: '',
    currency: '',
    language: '',
    timezone: '',
  })
  const [saved, setSaved] = useState<Draft>(draft)
  const [saving, setSaving] = useState(false)
  const [busyWithLogo, setBusyWithLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [violations, setViolations] = useState<ApiViolation[]>([])
  const [justSaved, setJustSaved] = useState(false)
  // F05 R10: what sanitising took out of the last uploaded SVG.
  const [logoNotice, setLogoNotice] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const loaded = await fetchStore({ signal })

      if (signal?.aborted === true) {
        return
      }

      const next: Draft = {
        companyName: loaded.companyName ?? '',
        // F15 R8: the *effective* currency. There is no "no currency" to
        // offer — the picker must open on something, and what the admin's
        // language suggests is the best guess the server can make while
        // nothing has been chosen.
        currency: loaded.currency,
        // F27 R17: unlike the currency, there is a real "nothing chosen"
        // here and it is the common case, so it shows as empty rather than
        // filled in with a guess.
        language: loaded.language ?? '',
        timezone: loaded.timezone,
      }

      setStore(loaded)
      setDraft(next)
      setSaved(next)
      setPhase('ready')
    } catch {
      if (signal?.aborted !== true) {
        setPhase('failed')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load])

  const dirty =
    draft.companyName !== saved.companyName ||
    draft.currency !== saved.currency ||
    draft.language !== saved.language ||
    draft.timezone !== saved.timezone

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
      const result = await saveStore({
        ...draft,
        // F27 R17: empty is null, which is "let the browser decide" rather
        // than a language nobody speaks.
        language: '' === draft.language ? null : draft.language,
      })

      setStore((current) => (current === null ? current : { ...current, ...result }))
      setSaved(draft)
      setJustSaved(true)
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
      }

      setError(t('store.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const onPickLogo = async (file: File | undefined) => {
    if (file === undefined) {
      return
    }

    setBusyWithLogo(true)
    setError(null)
    setViolations([])
    setLogoNotice(null)

    try {
      const result = await uploadLogo(file)
      setStore((current) => (current === null ? current : { ...current, ...result }))
      setLogoNotice(result.notice)
    } catch (caught) {
      // The server's message is the useful one here: it says whether the
      // file was too large, an SVG, or not an image at all.
      setError(
        caught instanceof ApiValidationError
          ? (caught.violations[0]?.message ?? 'That logo could not be used.')
          : 'The logo could not be uploaded.',
      )
    } finally {
      setBusyWithLogo(false)

      // Let the same file be chosen again after a failure.
      if (fileInput.current !== null) {
        fileInput.current.value = ''
      }
    }
  }

  const onRemoveLogo = async () => {
    setBusyWithLogo(true)
    setError(null)
    setLogoNotice(null)

    try {
      const result = await removeLogo()
      setStore((current) => (current === null ? current : { ...current, ...result }))
    } catch {
      setError('The logo could not be removed.')
    } finally {
      setBusyWithLogo(false)
    }
  }

  const violationFor = (field: string) =>
    violations.find((violation) => violation.field === field)?.message

  if (phase === 'loading') {
    return (
      <>
        <h1 className={headingClass}>{t('store.title')}</h1>
        <section aria-label={t('store.title')} className={sectionClass}>
          <p role="status" className="text-sm text-slate-500">
            {t('store.loading')}
          </p>
        </section>
      </>
    )
  }

  if (phase === 'failed' || store === null) {
    return (
      <>
        <h1 className={headingClass}>{t('store.title')}</h1>
        <section aria-label={t('store.title')} className={sectionClass}>
          <div role="alert" className="flex items-center gap-3">
            <p className="text-sm text-rose-600">{t('store.loadFailed')}</p>
            <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
              {t('common.tryAgain')}
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      {/* F09 R8: one h1 per module, and it is the module's name. */}
      <h1 className={headingClass}>{t('store.title')}</h1>

      <section aria-label={t('store.title')} className={sectionClass} data-testid="store-section">
        <div className="mt-1 grid gap-4 sm:grid-cols-2">
          <Field
            id="company-name"
            label={t('store.companyName')}
            value={draft.companyName}
            error={violationFor('companyName')}
            hint={t('store.companyHint')}
            onChange={(companyName) => change({ companyName })}
          />

          {/* F30 R15. The theme's picker went to the game's editor with
              the theme itself: what is left here is the business. */}
        </div>

        {/* F15 R10. Here as well as in the reward editor: the editor is where
            an admin meets the question, and this is where they come back to
            change the answer. Since F27 R16 the editor only states it. */}
        <div className="mt-4">
          <label htmlFor="store-currency" className={labelClass}>
            {t('store.currency')}
          </label>
          <CurrencySelect
            id="store-currency"
            value={draft.currency}
            options={store.currencies}
            onChange={(currency) => change({ currency })}
          />
          {/* F15 R11: says what it affects, because the obvious guess — that
              changing this converts the amounts — is the wrong one. */}
          <p className="mt-1 text-xs text-slate-500">{t('store.currencyHint')}</p>
          {violationFor('currency') !== undefined && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {violationFor('currency')}
            </p>
          )}
        </div>

        {/* F27 R17. Beneath the currency, with which it shares a shape: both
            are facts about the shop that every game inherits. */}
        <div className="mt-4">
          <label htmlFor="store-language" className={labelClass}>
            {t('store.language')}
          </label>
          <select
            id="store-language"
            value={draft.language}
            onChange={(event) => change({ language: event.target.value })}
            className={`${inputClass} bg-white`}
          >
            {/* The empty option is a real choice and the one every shop
                starts on: let whoever is holding the phone decide. */}
            <option value="">{t('store.languageFromBrowser')}</option>
            {/* F12 R6: each one named in its own language, as the player's
                picker names them. */}
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{t('store.languageHint')}</p>
          {violationFor('language') !== undefined && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {violationFor('language')}
            </p>
          )}
        </div>

        {/* F27 R15. The one field here with no sensible default: it decides
            when every game's day rolls over, and only the shop knows it. */}
        <div className="mt-4">
          <label htmlFor="store-timezone" className={labelClass}>
            {t('store.timezone')}
          </label>
          <select
            id="store-timezone"
            value={draft.timezone}
            onChange={(event) => change({ timezone: event.target.value })}
            className={`${inputClass} bg-white`}
          >
            {timezones(draft.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{t('store.timezoneHint')}</p>
          {violationFor('timezone') !== undefined && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {violationFor('timezone')}
            </p>
          )}
        </div>

        <div className="mt-4">
          {/* A real label, so the file input is reachable by name for
              assistive technology as well as by the tests. */}
          <label htmlFor="logo" className={labelClass}>
            {t('store.logo')}
          </label>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            {store.logoUrl !== null && (
              <img
                src={store.logoUrl}
                alt={t('store.currentLogo')}
                data-testid="current-logo"
                className="h-12 w-auto max-w-[8rem] rounded border border-slate-200 bg-white object-contain p-1"
              />
            )}

            <input
              ref={fileInput}
              id="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={busyWithLogo}
              onChange={(event) => void onPickLogo(event.target.files?.[0])}
              className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
            />

            {store.logoUrl !== null && (
              <button
                type="button"
                onClick={() => void onRemoveLogo()}
                disabled={busyWithLogo}
                className={secondaryButtonClass}
              >
                {t('store.removeLogo')}
              </button>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500">{t('store.logoHint', { max: 2 })}</p>

          {/* Information, not an error: the upload worked (F05 R10). */}
          {logoNotice !== null && (
            <p
              role="status"
              data-testid="logo-notice"
              className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {logoNotice}
            </p>
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
            data-testid="save-store"
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
    </>
  )
}

/**
 * Every zone the browser knows, with the stored one guaranteed to be in the
 * list.
 *
 * From the browser rather than from the server: it is the one list that is
 * already there, and a shop's own zone is always in it. The fallback matters
 * — an older browser without `supportedValuesOf` would otherwise render an
 * empty select and let an admin save nothing over their clock.
 */
function timezones(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

  const all = supported.length > 0 ? [...supported] : ['UTC']

  return all.includes(current) || '' === current ? all : [current, ...all]
}

function Field({
  id,
  label,
  value,
  error,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  hint?: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={NAME_MAX_LENGTH}
        aria-invalid={error !== undefined}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {error !== undefined ? (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

const headingClass = 'mb-4 text-xl font-semibold text-slate-900'
const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
