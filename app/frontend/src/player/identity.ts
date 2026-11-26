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
