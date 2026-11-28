import { useMemo, useState } from 'react'
import { Barcode } from '../reward/Barcode'
import { ApiValidationError } from '../api/client'
import {
  identifyPhone,
  registerPlayer,
  type Identified,
  type Registration,
} from '../api/player'
import { useI18n, useT, type Translate } from '../i18n/I18nContext'
import { monthNames } from '../i18n/months'
import {
  MAX_PHONE_DIGITS,
  MIN_PHONE_DIGITS,
  NAME_MAX_LENGTH,
  canonicalisePhone,
  detailsProblems,
  frenchNumberNote,
  hasProblems,
  phoneProblem,
  type DetailsDraft,
  type DetailsProblems,
} from './identity'

interface IdentityStepProps {
  /**
   * Called once the server has identified this player (F08 R5, R6).
   *
   * The whole answer, not just the player: how many spins they have left
   * today arrives with the identification (F23 R13), so the page knows
   * before it draws a wheel whether there is one to draw.
   */
  onIdentified: (identified: Identified) => void
}

type Phase =
  | { name: 'phone' }
  /** The canonical number the server derived, carried into the details step. */
  | { name: 'details'; phone: string }
  /**
   * F34 R7. The card, and the identification it is holding up: the customer
   * is already identified by the time this shows, and pressing on is what
   * hands that to the game (R10).
   */
  | { name: 'card'; card: string; identified: Identified }

/** Rendered sentences, not keys: a server violation arrives already worded. */
interface FieldErrors {
  firstName?: string
  lastName?: string
  birthday?: string
}

/**
 * The step in front of the wheel (F08 R1).
 *
 * Two phases rather than one form, because the second one usually never
 * happens: a returning player gives a number and is at the wheel (F08 R5).
 * Asking a name, a surname and a birthday of everybody in order to ask them
 * of the few would make the common case four times as long as it needs to be.
 *
 * It lives inside the same themed card as the wheel and uses the same button,
 * so this reads as the first screen of the game rather than as a form in
 * front of it.
 *
 * Errors are held as rendered sentences rather than keys (F12): the two
 * sources are this browser's own rules and the server's violations, and the
 * server's arrive already in the reader's language (F12 R8, R16). Translating
 * the local ones on the way in means everything below here is just a string.
 */
export function IdentityStep({ onIdentified }: IdentityStepProps) {
  const t = useT()
  // F40 R4: the language the page is in is the whole of what suggests a
  // country. Nothing is stored and nothing is configured.
  const { locale } = useI18n()

  const [phase, setPhase] = useState<Phase>({ name: 'phone' })
  const [phone, setPhone] = useState('')
  /**
   * F40 R14. Whether the player has finished with the field — left it, or
   * pressed Continue.
   *
   * The note waits for this because "that does not look like a French
   * number" is true of every number halfway through being typed, and a
   * message that is right too early reads as a message that is wrong.
   */
  const [phoneLeft, setPhoneLeft] = useState(false)
  const [details, setDetails] = useState<DetailsDraft>({
    firstName: '',
    lastName: '',
    birthDay: '',
    birthMonth: '',
  })
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [detailErrors, setDetailErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmitPhone = async (event: React.FormEvent) => {
    event.preventDefault()

    if (busy) {
      return
    }

    // F40 R14. Pressing Continue is finishing with the field, whether or not
    // it ever lost focus — on a phone keyboard it often does not.
    setPhoneLeft(true)

    // Checked here first so an unusable number costs no round trip, and so
    // the message arrives instantly on a bad connection (F08 R4).
    const problem = phoneProblem(phone)

    if (problem !== null) {
      setPhoneError(t(problem, { min: MIN_PHONE_DIGITS, max: MAX_PHONE_DIGITS }))

      return
    }

    setBusy(true)
    setPhoneError(null)
    setFailure(null)

    try {
      const lookup = await identifyPhone(phone)

      if (lookup.known && lookup.player !== null) {
        // F08 R5: nothing further is asked. F34 R8: and nothing is shown
        // — a card belongs to the customer this request created, and this
        // request created nobody.
        onIdentified({ player: lookup.player, spinsLeft: lookup.spinsLeft, card: null })

        return
      }

      // The server's canonical form, not ours: what the next step registers
      // has to be the key the server will actually store (F08 R3).
      setPhase({ name: 'details', phone: lookup.phone })
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setPhoneError(messageFor(error, 'phone') ?? t('identity.phoneUnusable'))
      } else {
        setFailure(t('identity.lookupFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const onSubmitDetails = async (event: React.FormEvent) => {
    event.preventDefault()

    if (busy || phase.name !== 'details') {
      return
    }

    const problems = detailsProblems(details)

    if (hasProblems(problems)) {
      setDetailErrors(render(problems, t))

      return
    }

    setBusy(true)
    setDetailErrors({})
    setFailure(null)

    const registration: Registration = {
      phone: phase.phone,
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      // F38 R1. Numbers on the wire; the pickers hold strings.
      birthDay: Number(details.birthDay),
      birthMonth: Number(details.birthMonth),
    }

    try {
      const identified = await registerPlayer(registration)

      /*
       * F34 R7, R9. A card comes back only for a customer this request
       * created, so this is the one moment the application can be sure the
       * person holding the phone is the person the card belongs to. The page
       * never asks for a card; it shows the one it was given.
       */
      if (null !== identified.card) {
        setPhase({ name: 'card', card: identified.card, identified })

        return
      }

      onIdentified(identified)
    } catch (error) {
      // The typed values stay in the form either way: nothing here clears
      // them, so a failure costs the player a button press and not a retype.
      if (error instanceof ApiValidationError) {
        setDetailErrors({
          firstName: messageFor(error, 'firstName'),
          lastName: messageFor(error, 'lastName'),
          birthday: messageFor(error, 'birthday'),
        })
        setFailure(messageFor(error, 'phone') ?? t('identity.detailsUnusable'))
      } else {
        setFailure(t('identity.saveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  /*
   * F34 R7, R10, R11. One screen, once: the barcode, the code under it as
   * F33 R3 has it everywhere else, and a press that goes on to the game.
   * Nothing comes back here — the phase is gone once it is left, and there
   * is no request that would fetch a card again (R8).
   */
  if (phase.name === 'card') {
    return (
      <div data-testid="identity-card" className="flex w-full flex-col items-center gap-4">
        <Intro heading={t('identity.cardHeading')} lead={t('identity.cardLead')} />

        <div className="w-full">
          <Barcode code={phase.card} className="h-16" />
          <p
            data-testid="customer-card"
            className="mt-1.5 text-center font-mono text-lg font-bold tracking-[0.12em]"
            style={{ color: 'var(--heading)' }}
          >
            {phase.card}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onIdentified(phase.identified)}
          data-testid="card-continue"
          className={buttonClass}
          /*
           * The paint as well as the shape. Without this the one control
           * that carries a customer from their card to the game rendered as
           * a line of body text on a transparent background — see F36 §13.
           */
          style={buttonStyle}
        >
          {t('identity.cardContinue')}
        </button>
      </div>
    )
  }

  if (phase.name === 'details') {
    return (
      <form
        onSubmit={(event) => void onSubmitDetails(event)}
        data-testid="identity-details"
        className="flex w-full flex-col gap-4"
        noValidate
      >
        <Intro
          heading={t('identity.detailsHeading')}
          // The number is shown back before a name is attached to it: a
          // mistyped digit is far cheaper to notice here than after it has
          // become a player nobody can find again.
          lead={t('identity.detailsLead', {
            phone: canonicalisePhone(phase.phone) ?? phase.phone,
          })}
        />

        <Field
          id="player-first-name"
          label={t('identity.firstName')}
          testId="first-name-input"
          autoComplete="given-name"
          value={details.firstName}
          error={detailErrors.firstName}
          onChange={(value) => setDetails((current) => ({ ...current, firstName: value }))}
          autoFocus
        />

        <Field
          id="player-last-name"
          label={t('identity.lastName')}
          testId="last-name-input"
          autoComplete="family-name"
          value={details.lastName}
          error={detailErrors.lastName}
          onChange={(value) => setDetails((current) => ({ ...current, lastName: value }))}
        />

        {/*
          F38 R1, R2. A day and a month, and no year: a gift needs the date
          and not the age. Two short lists rather than a date field, which on
          a phone opens on this year and asks somebody at a counter to scroll
          back thirty of them.
        */}
        <BirthdayFields
          day={details.birthDay}
          month={details.birthMonth}
          error={detailErrors.birthday}
          onDay={(value) => setDetails((current) => ({ ...current, birthDay: value }))}
          onMonth={(value) => setDetails((current) => ({ ...current, birthMonth: value }))}
        />

        {failure !== null && <Failure message={failure} />}

        <button
          type="submit"
          disabled={busy}
          data-testid="details-submit"
          className={buttonClass}
          style={buttonStyle}
        >
          {busy ? t('common.saving') : t('identity.start')}
        </button>

        <button
          type="button"
          onClick={() => {
            setPhase({ name: 'phone' })
            setFailure(null)
            setDetailErrors({})
          }}
          data-testid="change-number"
          className={quietButtonClass}
          style={{ color: 'var(--body)' }}
        >
          {t('identity.changeNumber')}
        </button>
      </form>
    )
  }

  /**
   * F40 R12, R13. The note, or nothing.
   *
   * It yields to a real error — two sentences under one field is one too
   * many, and the one that stops the step is the one worth reading.
   */
  const noteKey = phoneLeft && phoneError === null ? frenchNumberNote(phone, locale) : null

  return (
    <form
      onSubmit={(event) => void onSubmitPhone(event)}
      data-testid="identity-phone"
      className="flex w-full flex-col gap-4"
      noValidate
    >
      <Intro heading={t('identity.phoneHeading')} lead={t('identity.phoneLead')} />

      <Field
        id="player-phone"
        label={t('identity.phoneLabel')}
        testId="phone-input"
        // `tel` rather than `number`: a numeric keypad on a phone, without a
        // spinner, and without a control that strips the leading zero.
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t('identity.phonePlaceholder')}
        value={phone}
        error={phoneError ?? undefined}
        note={noteKey === null ? undefined : t(noteKey)}
        onChange={(value) => {
          setPhone(value)
          // R14 again, from the other side: a number being edited is not a
          // number anybody has finished with.
          setPhoneLeft(false)
        }}
        onLeave={() => setPhoneLeft(true)}
        autoFocus
      />

      {failure !== null && <Failure message={failure} />}

      <button
        type="submit"
        disabled={busy}
        data-testid="phone-submit"
        className={buttonClass}
        style={buttonStyle}
      >
        {busy ? t('identity.checking') : t('identity.continue')}
      </button>
    </form>
  )
}

/**
 * Client-side problems, worded.
 *
 * Only `%max%` is ever needed, and only by the two length rules; passing it
 * to every key is harmless because an unused parameter is simply not
 * substituted.
 */
function render(problems: DetailsProblems, t: Translate): FieldErrors {
  const worded: FieldErrors = {}

  if (problems.firstName !== undefined) {
    worded.firstName = t(problems.firstName, { max: NAME_MAX_LENGTH })
  }

  if (problems.lastName !== undefined) {
    worded.lastName = t(problems.lastName, { max: NAME_MAX_LENGTH })
  }

  if (problems.birthday !== undefined) {
    worded.birthday = t(problems.birthday, { max: NAME_MAX_LENGTH })
  }

  return worded
}

function Intro({ heading, lead }: { heading: string; lead: string }) {
  const t = useT()

  return (
    <div className="text-center">
      {/* `--heading` rather than `--accent`: the accent is contrast-checked
          only where it is a hairline or a glow, never behind words. */}
      <p className="player-kicker" style={{ color: 'var(--heading)' }}>
        {t('identity.kicker')}
      </p>
      <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--heading)' }}>
        {heading}
      </h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--body)' }}>
        {lead}
      </p>
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  testId: string
  value: string
  onChange: (value: string) => void
  onLeave?: () => void
  error?: string
  /**
   * F40 R12. Something to read about the value, which is not a reason to
   * stop. Rendered in the body colour, never in `--danger`, and announced
   * as a status rather than an alert.
   */
  note?: string
  type?: string
  inputMode?: 'tel' | 'text'
  autoComplete?: string
  placeholder?: string
  autoFocus?: boolean
  max?: string
  min?: string
}

/**
 * F38 R2, R9. A day and a month, the month named by the browser in the
 * reader's own language.
 *
 * One label and one error for the pair, because they are one answer: being
 * told "choose a month" under the second list when the first is also empty
 * is two sentences for one mistake.
 */
function BirthdayFields({
  day,
  month,
  error,
  onDay,
  onMonth,
}: {
  day: string
  month: string
  error?: string
  onDay: (value: string) => void
  onMonth: (value: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const months = useMemo(() => monthNames(locale), [locale])
  const errorId = 'player-birthday-error'

  return (
    <div>
      <span className="player-kicker block" style={{ color: 'var(--body)' }}>
        {t('identity.birthday')}
      </span>

      <div className="mt-1 flex gap-2">
        <select
          id="player-birth-day"
          name="player-birth-day"
          value={day}
          aria-label={t('identity.birthDay')}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          data-testid="birth-day-input"
          onChange={(event) => onDay(event.target.value)}
          className={`${selectClass} w-24`}
          style={fieldStyle}
        >
          <option value="">{t('identity.birthDay')}</option>
          {DAYS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          id="player-birth-month"
          name="player-birth-month"
          value={month}
          aria-label={t('identity.birthMonth')}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          data-testid="birth-month-input"
          onChange={(event) => onMonth(event.target.value)}
          className={`${selectClass} flex-1`}
          style={fieldStyle}
        >
          <option value="">{t('identity.birthMonth')}</option>
          {months.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error !== undefined && (
        <p id={errorId} role="alert" className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

/** 1 to 31, built once rather than on every render. */
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

function Field({
  id,
  label,
  testId,
  value,
  onChange,
  onLeave,
  error,
  note,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  autoFocus,
  max,
  min,
}: FieldProps) {
  const errorId = `${id}-error`
  const noteId = `${id}-note`

  return (
    <div>
      <label htmlFor={id} className="player-kicker block" style={{ color: 'var(--body)' }}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        max={max}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onLeave}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : note !== undefined ? noteId : undefined}
        data-testid={testId}
        className={inputClass}
        style={{
          // The card's own surfaces, both of which are contrast-checked
          // against `--body` (F04 R11), so a themed input cannot become an
          // unreadable one.
          backgroundColor: 'var(--stage-edge)',
          borderColor: error !== undefined ? 'var(--danger)' : 'var(--stage-border)',
          color: 'var(--body)',
        }}
      />
      {error !== undefined && (
        <p id={errorId} role="alert" className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {/*
       * F40 R12. The body colour rather than a colour of its own: `--body` is
       * already contrast-checked against both of the card's surfaces (F04
       * R11), so this cannot become unreadable on a theme, and a seventh
       * token on six palettes is a lot of machinery for one sentence that is
       * not an error.
       *
       * `status`, not `alert`: a screen reader should mention it when it gets
       * there, not interrupt somebody mid-field for something that stops
       * nothing.
       */}
      {error === undefined && note !== undefined && (
        <p
          id={noteId}
          role="status"
          data-testid={`${testId}-note`}
          className="mt-1 text-xs"
          style={{ color: 'var(--body)' }}
        >
          {note}
        </p>
      )}
    </div>
  )
}

function Failure({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
      {message}
    </p>
  )
}

function messageFor(error: ApiValidationError, field: string): string | undefined {
  return error.violations.find((violation) => violation.field === field)?.message
}

/**
 * 16px text, not 14px. Anything smaller makes iOS Safari zoom the page when
 * the field takes focus, which on a step that must fit a 375px screen without
 * scrolling (F08 §9) undoes the whole layout at the moment of typing.
 */
const inputClass = [
  'mt-1 w-full rounded-xl border px-3 py-2.5 text-base',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[color:var(--accent)]',
].join(' ')

/** The same control, without the top margin the pair's own row provides. */
const selectClass = [
  'rounded-xl border px-3 py-2.5 text-base',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[color:var(--accent)]',
].join(' ')

/**
 * The card's own surfaces, both contrast-checked against `--body` (F04 R11),
 * so a themed control cannot become an unreadable one.
 */
const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--stage-edge)',
  borderColor: 'var(--stage-border)',
  color: 'var(--body)',
}

/** The game's own button, so the step is part of the game (F08 §9). */
const buttonClass = [
  'w-full rounded-full px-6 py-3 text-base font-semibold',
  'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-[color:var(--stage)]',
].join(' ')

const buttonStyle: React.CSSProperties = {
  backgroundColor: 'var(--button-bg)',
  backgroundImage: 'linear-gradient(180deg, var(--button-shine) 0%, var(--button-bg) 100%)',
  color: 'var(--button-text)',
  boxShadow: '0 12px 26px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
}

const quietButtonClass = [
  'player-kicker -mt-1 w-full py-1 underline decoration-dotted underline-offset-4',
  'hover:opacity-80 focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[color:var(--accent)]',
].join(' ')
