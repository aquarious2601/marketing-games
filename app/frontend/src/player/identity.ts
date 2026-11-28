/**
 * The identity step's rules, client side (F08 R4, R10).
 *
 * A deliberate mirror of the backend's `PhoneNumber` and `PlayerInputParser`,
 * and the server stays the authority: nothing here decides whether a player
 * exists, and every message the server sends is shown in preference to one of
 * these. What this buys is the difference between "that does not look like a
 * phone number" appearing as you leave the field and appearing after a round
 * trip, which at a stall on a bad connection is the difference between a
 * player finishing the step and giving up.
 *
 * The canonical form is computed here too, but only so the page can show the
 * player what is about to be registered. What gets stored is whatever the
 * server canonicalises — the browser's copy of the rule is never the one that
 * writes a key.
 */

import type { MessageKey } from '../i18n/en'
import type { Locale } from '../i18n/locales'
import { isADate } from '../i18n/months'

/** F08 R4 */
export const MIN_PHONE_DIGITS = 6
export const MAX_PHONE_DIGITS = 20

/** F08 R10 */
export const NAME_MAX_LENGTH = 40

/**
 * Digits and a leading `+`, exactly as the backend does it (F08 R3).
 *
 * The non-breaking spaces are not decoration: a number pasted out of a
 * messaging app arrives wrapped in them, and `\s` in a JavaScript regex does
 * not match U+202F.
 */
export function canonicalisePhone(raw: string): string | null {
  const candidate = raw.replace(/[   ]/g, ' ').trim()
  const international = candidate.startsWith('+')
  const digits = candidate.replace(/\D+/g, '')

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null
  }

  return `${international ? '+' : ''}${digits}`
}

/**
 * The problem with a number, as a message **key** rather than a sentence
 * (F12 R15).
 *
 * This module decides *what* is wrong; the component decides what that is
 * called in the reader's language. Returning English here would put a
 * sentence in a file that has no idea what language the page is in.
 */
export function phoneProblem(raw: string): MessageKey | null {
  if (raw.trim() === '') {
    return 'identity.phoneRequired'
  }

  if (canonicalisePhone(raw) === null) {
    return 'identity.phoneInvalid'
  }

  return null
}

/** F40 R1. The one dialling code this feature knows anything about. */
const FRENCH_CODE = '33'

/**
 * F40. Whether the number does not look like a French one — and null
 * whenever that question does not apply.
 *
 * The one thing to understand before changing this: **it never refuses**
 * (R10). It returns something to read, and the step carries on whatever it
 * returns. That is not an oversight to be tidied up into a `Violation`; it
 * is the whole shape of the feature, and F40 §13 says why at length. The
 * short version is F08 §13's: a check that refuses a legitimate foreign
 * number at a counter costs more than a typo does.
 *
 * It also lives only here, with no counterpart on the server, for the same
 * reason — there is no authority to establish when nothing is being refused.
 */
export function frenchNumberNote(raw: string, locale: Locale): MessageKey | null {
  const canonical = canonicalisePhone(raw)

  // R13. A number F08 R4 already refuses has its own message, and two
  // sentences under one field is one too many.
  if (canonical === null) {
    return null
  }

  const abroad = internationalBody(canonical)

  if (abroad !== null) {
    // R1, R2. The number named a country. If it is not France there is
    // nothing here to check, in any language — the person has told us where
    // their number is from.
    return abroad.startsWith(FRENCH_CODE) && !frenchSubscriber(abroad.slice(FRENCH_CODE.length))
      ? 'identity.phoneNotFrench'
      : null
  }

  // R3. No prefix, so the only thing suggesting France is the page. On any
  // other language nothing is assumed: F18 is what assuming costs.
  if (locale !== 'fr') {
    return null
  }

  return frenchNational(canonical) ? null : 'identity.phoneNotFrench'
}

/**
 * The digits after an international prefix, or null for a number that named
 * no country.
 *
 * A leading `00` counts as one, because that is already what this
 * application believes a `00` is — see `PhoneMatch::significant`, which
 * strips it as "a way of writing `+`". Holding a second opinion about `00`
 * in a sibling module is how two rules that each look right produce a bug
 * neither of them describes.
 */
function internationalBody(canonical: string): string | null {
  if (canonical.startsWith('+')) {
    return canonical.slice(1)
  }

  return canonical.startsWith('00') ? canonical.slice(2) : null
}

/**
 * R6, R7. What follows `+33`: nine digits beginning 1-9, and optionally the
 * trunk `0` that people keep in when they write `+33 0 6 …`.
 *
 * That spelling is accepted rather than flagged because it is common and
 * because F19's matching already reads it as the same person as the national
 * number — flagging a number the application itself considers correct would
 * be the note contradicting the app.
 */
function frenchSubscriber(digits: string): boolean {
  const national = digits.startsWith('0') ? digits.slice(1) : digits

  return /^[1-9]\d{8}$/.test(national)
}

/**
 * R5. Ten digits, the first `0` and the second 1-9.
 *
 * The trunk `0` is required here, unlike in `frenchSubscriber`: a bare
 * `614856240` with no prefix at all is a dropped leading zero, which is
 * exactly the typo this note exists to catch.
 */
function frenchNational(digits: string): boolean {
  return /^0[1-9]\d{8}$/.test(digits)
}

export interface DetailsDraft {
  firstName: string
  lastName: string
  /**
   * F38 R1. What the two pickers hold: a chosen number as a string, or ''
   * for one nobody has touched. Strings because that is what a `select`
   * gives back, and converting once on the way out beats converting on
   * every render.
   */
  birthDay: string
  birthMonth: string
}

export interface DetailsProblems {
  firstName?: MessageKey
  lastName?: MessageKey
  birthday?: MessageKey
}

/**
 * Every problem at once (F08 R10).
 *
 * Returning all of them rather than the first matters more here than it looks:
 * somebody standing at a counter with a queue behind them should not discover
 * three mistakes in three submissions.
 */
export function detailsProblems(draft: DetailsDraft): DetailsProblems {
  const problems: DetailsProblems = {}

  const firstName = nameProblem(draft.firstName, 'first')
  if (firstName !== null) {
    problems.firstName = firstName
  }

  const lastName = nameProblem(draft.lastName, 'last')
  if (lastName !== null) {
    problems.lastName = lastName
  }

  const birthday = birthdayProblem(draft.birthDay, draft.birthMonth)
  if (birthday !== null) {
    problems.birthday = birthday
  }

  return problems
}

export function hasProblems(problems: DetailsProblems): boolean {
  return Object.keys(problems).length > 0
}

/*
 * A key per field rather than one with the field name interpolated in.
 * "Enter your %s" works in English and falls apart elsewhere: a translator
 * handed a sentence with a hole in it cannot reorder it, and Vietnamese and
 * Chinese both want to.
 */
function nameProblem(raw: string, which: 'first' | 'last'): MessageKey | null {
  const name = raw.trim()

  if (name === '') {
    return which === 'first' ? 'identity.firstNameRequired' : 'identity.lastNameRequired'
  }

  // Counted in code points, not UTF-16 units, so an accented Vietnamese name
  // is measured the way a person would count it.
  if ([...name].length > NAME_MAX_LENGTH) {
    return which === 'first' ? 'identity.firstNameTooLong' : 'identity.lastNameTooLong'
  }

  return null
}

/**
 * F38 R3, R4. Both chosen, and a pair that is a date.
 *
 * There is no "in the future" and no "before records began" any more: those
 * were questions about a year, and a birthday no longer has one.
 */
function birthdayProblem(day: string, month: string): MessageKey | null {
  if (day.trim() === '' || month.trim() === '') {
    return 'identity.birthdayRequired'
  }

  return isADate(Number(day), Number(month)) ? null : 'identity.birthdayImpossible'
}
