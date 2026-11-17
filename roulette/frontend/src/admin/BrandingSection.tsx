import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchBranding,
  removeLogo,
  saveBranding,
  uploadLogo,
  type AdminBranding,
} from '../api/branding'
import { ApiValidationError, type ApiViolation } from '../api/client'
import { useT } from '../i18n/I18nContext'
import { CurrencySelect } from './CurrencySelect'

const NAME_MAX_LENGTH = 60
const TAGLINE_MAX_LENGTH = 120

type LoadPhase = 'loading' | 'ready' | 'failed'

interface Draft {
  companyName: string
  campaignName: string
  tagline: string
  theme: string
  /** F15 R10: the campaign's currency, edited here as well as in Rewards. */
  currency: string
  /**
   * F23 R1, R20. A string, not a number, because this is what a text box
   * holds: empty means no limit, and an empty number input has no number
   * in it to represent that. The conversion happens once, on the way out.
   */
  dailySpinLimit: string
}

/**
 * F04: who is running the promotion and what it looks like.
 *
 * Saved on its own (F04 R5). Folding it into the prize list's Save would
 * mean a rejected prize list silently discarded the branding too, and the
 * two have nothing to do with each other.
 */
export function BrandingSection() {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [branding, setBranding] = useState<AdminBranding | null>(null)
  const [draft, setDraft] = useState<Draft>({
    companyName: '',
    campaignName: '',
    tagline: '',
    theme: 'plain',
    currency: '',
    dailySpinLimit: '',
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
      const loaded = await fetchBranding({ signal })

      if (signal?.aborted === true) {
        return
      }

      const next: Draft = {
        companyName: loaded.companyName ?? '',
        campaignName: loaded.campaignName ?? '',
        // The admin's own value, not the effective one: pre-filling the
        // default would save it back as a deliberate choice and leave no
        // way back to it.
        tagline: loaded.ownTagline ?? '',
        theme: loaded.theme,
        // F15 R8: unlike the tagline above, the *effective* currency. There
        // is no "no currency" to offer — the picker must open on something,
        // and what the admin's language suggests is the best guess the
        // server can make while nothing has been chosen.
        currency: loaded.currency,
        // F23 R1: unlike the currency, there is a real "nothing chosen"
        // here and it is the common case, so it is shown as empty rather
        // than filled in with a guess.
        dailySpinLimit: loaded.dailySpinLimit === null ? '' : String(loaded.dailySpinLimit),
      }

      setBranding(loaded)
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
    draft.campaignName !== saved.campaignName ||
    draft.tagline !== saved.tagline ||
    draft.theme !== saved.theme ||
    draft.currency !== saved.currency ||
    draft.dailySpinLimit !== saved.dailySpinLimit

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
      /*
       * F23 R1. Empty is null, which clears the limit; the key is always
       * sent, because this form is the thing that edits it. Anything else
       * typed in goes to the server as it was typed rather than being
       * silently repaired here — one place decides what a valid limit is
       * (F23 R21), and it is the one that also has to refuse the next
       * client.
       */
      const limit = draft.dailySpinLimit.trim()

      const result = await saveBranding({
        ...draft,
        dailySpinLimit: '' === limit ? null : Number(limit),
      })

      setBranding((current) => (current === null ? current : { ...current, ...result }))
      setSaved(draft)
      setJustSaved(true)
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
        setError(t('branding.saveFailed'))
      } else {
        setError(t('branding.saveFailed'))
      }
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
      setBranding((current) => (current === null ? current : { ...current, ...result }))
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
      setBranding((current) => (current === null ? current : { ...current, ...result }))
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
      <section aria-label={t('branding.title')} className={sectionClass}>
        <p role="status" className="text-sm text-slate-500">
          Loading the branding…
        </p>
      </section>
    )
  }

  if (phase === 'failed' || branding === null) {
    return (
      <section aria-label={t('branding.title')} className={sectionClass}>
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-rose-600">{t('branding.loadFailed')}</p>
          <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label={t('branding.title')} className={sectionClass} data-testid="branding-section">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
        {t('branding.title')}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="company-name"
          label={t('branding.companyName')}
          value={draft.companyName}
          error={violationFor('companyName')}
          onChange={(companyName) => change({ companyName })}
        />
        <Field
          id="campaign-name"
          label={t('branding.campaignName')}
          value={draft.campaignName}
          error={violationFor('campaignName')}
          onChange={(campaignName) => change({ campaignName })}
          hint={t('branding.campaignHint')}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="tagline" className={labelClass}>
          {t('branding.tagline')}
        </label>
        <input
          id="tagline"
          type="text"
          value={draft.tagline}
          maxLength={TAGLINE_MAX_LENGTH}
          placeholder={branding.defaultTagline}
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
            {t('branding.taglineHint', { default: branding.defaultTagline })}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="theme" className={labelClass}>
          {t('branding.theme')}
        </label>
        <select
          id="theme"
          value={draft.theme}
          onChange={(event) => change({ theme: event.target.value })}
          className={`${inputClass} bg-white`}
        >
          {branding.themes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {violationFor('theme') !== undefined && (
          <p role="alert" className="mt-1 text-xs text-rose-600">
            {violationFor('theme')}
          </p>
        )}
      </div>

      {/* F15 R10. Here as well as in the reward editor: the editor is where
          an admin meets the question, and this is where they will come back
          to change the answer. */}
      <div className="mt-4">
        <label htmlFor="branding-currency" className={labelClass}>
          {t('branding.currency')}
        </label>
        <CurrencySelect
          id="branding-currency"
          value={draft.currency}
          options={branding.currencies}
          onChange={(currency) => change({ currency })}
        />
        {/* F15 R11: says what it affects, because the obvious guess — that
            changing this converts the amounts — is the wrong one. */}
        <p className="mt-1 text-xs text-slate-500">{t('branding.currencyHint')}</p>
        {violationFor('currency') !== undefined && (
          <p role="alert" className="mt-1 text-xs text-rose-600">
            {violationFor('currency')}
          </p>
        )}
      </div>

      {/* F23 R20. Beneath the currency, because both are facts about how
          the campaign is run rather than how it looks — and because this is
          where an admin will come looking for it. */}
      <div className="mt-4">
        <label htmlFor="branding-daily-spin-limit" className={labelClass}>
          {t('branding.dailySpinLimit')}
        </label>
        <input
          id="branding-daily-spin-limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={branding.maxDailySpinLimit}
          step={1}
          value={draft.dailySpinLimit}
          placeholder={t('branding.dailySpinLimitBlank')}
          onChange={(event) => change({ dailySpinLimit: event.target.value })}
          className={inputClass}
        />
        {/* F23 R2 is the part that is not obvious from the label: it counts
            the person, so the stall cannot be worked around by typing the
            number in again. */}
        <p className="mt-1 text-xs text-slate-500">{t('branding.dailySpinLimitHint')}</p>
        {violationFor('dailySpinLimit') !== undefined && (
          <p role="alert" className="mt-1 text-xs text-rose-600">
            {violationFor('dailySpinLimit')}
          </p>
        )}
      </div>

      <div className="mt-4">
        {/* A real label, so the file input is reachable by name for
            assistive technology as well as by the tests. */}
        <label htmlFor="logo" className={labelClass}>
          {t('branding.logo')}
        </label>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {branding.logoUrl !== null && (
            <img
              src={branding.logoUrl}
              alt={t('branding.currentLogo')}
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

          {branding.logoUrl !== null && (
            <button
              type="button"
              onClick={() => void onRemoveLogo()}
              disabled={busyWithLogo}
              className={secondaryButtonClass}
            >
              {t('branding.removeLogo')}
            </button>
          )}
        </div>

        <p className="mt-1 text-xs text-slate-500">
          {t('branding.logoHint', { max: 2 })}
        </p>

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
          data-testid="save-branding"
          className={primaryButtonClass}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>

        {justSaved && !dirty && (
          <span role="status" className="text-sm text-emerald-700">
            {t('common.saved')}
          </span>
        )}
        {dirty && !saving && <span className="text-sm text-slate-400">{t('common.unsavedChanges')}</span>}
      </div>
    </section>
  )
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

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
