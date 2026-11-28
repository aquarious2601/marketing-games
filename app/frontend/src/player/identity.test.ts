import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en'
import {
  MAX_PHONE_DIGITS,
  MIN_PHONE_DIGITS,
  NAME_MAX_LENGTH,
  canonicalisePhone,
  detailsProblems,
  frenchNumberNote,
  hasProblems,
  phoneProblem,
} from './identity'

/**
 * F08 R4, R10.
 *
 * These rules exist twice — here and in the backend's PhoneNumber and
 * PlayerInputParser — and the copies must agree, or the page rejects what the
 * server would have taken, or worse, accepts what it will not. The cases
 * below are deliberately the same cases as PhoneNumberTest.php, so a change
 * to one side fails on the other.
 */
describe('canonicalisePhone', () => {
  it.each([
    ['plain', '0912345678'],
    ['spaced', '0912 345 678'],
    ['dotted', '091.234.5678'],
    ['dashed', '091-234-5678'],
    ['bracketed', '(091) 234 5678'],
    ['padded', '  0912345678  '],
    ['mixed punctuation', '091/234.5678'],
    // Pasted out of a messaging app, which is where most of them come from.
    // `\s` in a JavaScript regex does not match U+202F.
    ['non-breaking spaces', '0912 345 678'],
    ['narrow no-break space', '0912 345678'],
  ])('reads the %s spelling as one number', (_name, typed) => {
    expect(canonicalisePhone(typed)).toBe('0912345678')
  })

  it('keeps a leading plus', () => {
    expect(canonicalisePhone('+84 912 345 678')).toBe('+84912345678')
  })

  it('discards a plus that is not at the front', () => {
    expect(canonicalisePhone('091+234+5678')).toBe('0912345678')
  })

  /**
   * The accepted cost of canonicalising loosely rather than per country
   * (F08 section 13). Asserted so that the day a country setting is added,
   * this fails and points at the decision it changes.
   */
  it('treats a national and an international spelling as different keys', () => {
    expect(canonicalisePhone('0912345678')).not.toBe(canonicalisePhone('+84912345678'))
  })

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['no digits', 'not a number'],
    ['punctuation only', '+++'],
    ['too short', '12345'],
    ['too long', '123456789012345678901'],
    ['non-ASCII digits', '٠٩١٢٣٤٥٦'],
  ])('rejects %s', (_name, typed) => {
    expect(canonicalisePhone(typed)).toBeNull()
  })

  it('accepts exactly the allowed lengths', () => {
    expect(canonicalisePhone('1'.repeat(MIN_PHONE_DIGITS))).toBe('1'.repeat(MIN_PHONE_DIGITS))
    expect(canonicalisePhone('1'.repeat(MAX_PHONE_DIGITS))).toBe('1'.repeat(MAX_PHONE_DIGITS))
  })

  it('does not count the plus towards the length', () => {
    const longest = `+${'1'.repeat(MAX_PHONE_DIGITS)}`

    expect(canonicalisePhone(longest)).toBe(longest)
  })
})

/**
 * F12 R15: these return message **keys**, not sentences.
 *
 * This module decides what is wrong; the component decides what that is
 * called in the reader's language. The keys are asserted against the English
 * dictionary rather than written out twice, so a rename fails here instead
 * of silently producing a key on screen.
 */
describe('phoneProblem', () => {
  it('asks for a number when the field is empty', () => {
    expect(phoneProblem('')).toBe('identity.phoneRequired')
    expect(phoneProblem('   ')).toBe('identity.phoneRequired')
    expect(en['identity.phoneRequired']).toContain('phone number')
  })

  it('explains what is wrong with an unusable number', () => {
    expect(phoneProblem('123')).toBe('identity.phoneInvalid')

    // The wording lives in the dictionary, and carries the limits as
    // placeholders the component fills in.
    expect(en['identity.phoneInvalid']).toContain('%min%')
    expect(en['identity.phoneInvalid']).toContain('%max%')
  })

  it('is silent about a usable number', () => {
    expect(phoneProblem('0912 345 678')).toBeNull()
  })
})

describe('detailsProblems', () => {
  const valid = { firstName: 'Anh', lastName: 'Le', birthDay: '12', birthMonth: '3' }

  it('passes a complete set of details', () => {
    expect(detailsProblems(valid)).toEqual({})
    expect(hasProblems(detailsProblems(valid))).toBe(false)
  })

  /**
   * F08 R10. Somebody at a counter with a queue behind them should not
   * discover three mistakes in three submissions.
   */
  it('reports every problem at once', () => {
    const problems = detailsProblems({
      firstName: '',
      lastName: '  ',
      birthDay: '',
      birthMonth: '',
    })

    expect(Object.keys(problems).sort()).toEqual(['birthday', 'firstName', 'lastName'])
  })

  it('accepts a name that is trimmed into range', () => {
    expect(detailsProblems({ ...valid, firstName: '  Anh  ' })).toEqual({})
  })

  it('rejects a name beyond the limit', () => {
    const problems = detailsProblems({ ...valid, lastName: 'x'.repeat(NAME_MAX_LENGTH + 1) })

    expect(problems.lastName).toBe('identity.lastNameTooLong')
    expect(en['identity.lastNameTooLong']).toContain('%max%')
  })

  /**
   * F12: a key per field, not one sentence with the field name dropped into
   * it. "Enter your %s" works in English and falls apart elsewhere, because
   * Vietnamese and Chinese both want to reorder the sentence.
   */
  it('names the field that is wrong rather than interpolating it', () => {
    const problems = detailsProblems({
      firstName: '',
      lastName: '',
      birthDay: '',
      birthMonth: '',
    })

    expect(problems.firstName).toBe('identity.firstNameRequired')
    expect(problems.lastName).toBe('identity.lastNameRequired')
    expect(problems.birthday).toBe('identity.birthdayRequired')
  })

  /** Counted in characters, so a Vietnamese name is not measured in bytes. */
  it('accepts an accented name up to the character limit', () => {
    expect(detailsProblems({ ...valid, lastName: 'ễ'.repeat(NAME_MAX_LENGTH) })).toEqual({})
  })

  /** F38 R4. Both, or neither is an answer. */
  it.each([
    ['neither chosen', '', ''],
    ['no month', '12', ''],
    ['no day', '', '3'],
  ])('rejects a birthday with %s', (_name, birthDay, birthMonth) => {
    expect(detailsProblems({ ...valid, birthDay, birthMonth }).birthday).toBe(
      'identity.birthdayRequired',
    )
  })

  /**
   * F38 R3. The pickers cannot offer a 31st of February, but they can be
   * left on one: choosing 31 and then changing the month is two presses.
   */
  it.each([
    ['the 31st of February', '31', '2'],
    ['the 31st of April', '31', '4'],
    ['the 31st of November', '31', '11'],
  ])('rejects %s', (_name, birthDay, birthMonth) => {
    expect(detailsProblems({ ...valid, birthDay, birthMonth }).birthday).toBe(
      'identity.birthdayImpossible',
    )
  })

  /** F38 R3. It comes round every four years; the birthday is every year. */
  it('accepts the 29th of February', () => {
    expect(detailsProblems({ ...valid, birthDay: '29', birthMonth: '2' })).toEqual({})
  })

  /** F38 R1. There is no year to be in the future, or before records began. */
  it('asks nothing about a year', () => {
    expect(detailsProblems({ ...valid, birthDay: '1', birthMonth: '1' })).toEqual({})
    expect(detailsProblems({ ...valid, birthDay: '31', birthMonth: '12' })).toEqual({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})

/**
 * F40 — the French check.
 *
 * Two things are being tested here and the second matters more than the
 * first. One: that the shapes are right. Two: that the check keeps its hands
 * off everything it was not asked about — a foreign number, a page in
 * another language, a number F08 already refuses. Every bug this feature
 * could have is in that second list, because the cost of a wrong note is
 * paid by somebody whose number was correct.
 */
describe('frenchNumberNote', () => {
  const NOTE = 'identity.phoneNotFrench'

  /** R5. Ten digits, the first 0 and the second 1-9. */
  it.each(['0614856240', '0123456789', '0987654321', '0712345678'])(
    'says nothing about %s on a French page',
    (typed) => {
      expect(frenchNumberNote(typed, 'fr')).toBeNull()
    },
  )

  /** R8. The grouping is not part of the question (F08 R3). */
  it.each(['06 14 85 62 40', '06.14.85.62.40', '06-14-85-62-40', '  0614856240  '])(
    'reads %j as the French number it is',
    (typed) => {
      expect(frenchNumberNote(typed, 'fr')).toBeNull()
    },
  )

  /** R9. Where the typos are: a dropped digit, a doubled one, a lost zero. */
  it.each([
    ['nine digits', '061485624'],
    ['eleven digits', '06148562400'],
    ['no leading zero', '6614856240'],
    ['six digits', '061485'],
  ])('notes %s', (_name, typed) => {
    expect(frenchNumberNote(typed, 'fr')).toBe(NOTE)
  })

  /** R6. The international form, which needs no help from the language. */
  it.each(['+33614856240', '+33 6 14 85 62 40', '0033614856240'])(
    'says nothing about %j',
    (typed) => {
      expect(frenchNumberNote(typed, 'fr')).toBeNull()
    },
  )

  /**
   * R7. The trunk zero people keep after the dialling code. F19's matching
   * already calls this the same person as `0614856240`, so a note here would
   * be the page contradicting the application.
   */
  it('accepts a trunk zero after the dialling code', () => {
    expect(frenchNumberNote('+33 0 6 14 85 62 40', 'fr')).toBeNull()
    expect(frenchNumberNote('0033614856240', 'fr')).toBeNull()
  })

  /** R6, R9. Wrong after the code is still wrong. */
  it.each(['+3361485624', '+336148562400', '+330014856240'])('notes %j', (typed) => {
    expect(frenchNumberNote(typed, 'fr')).toBe(NOTE)
  })

  /**
   * R1. A number that named France is checked whatever the page is in,
   * because there is no assumption left to be wrong about.
   */
  it.each(['en', 'zh', 'vi'] as const)('checks a +33 number on a %s page', (locale) => {
    expect(frenchNumberNote('+3361485624', locale)).toBe(NOTE)
    expect(frenchNumberNote('+33614856240', locale)).toBeNull()
  })

  /**
   * R2. The important half. Somebody has said where their number is from and
   * it is not France — a note here is the feature being wrong at the one
   * person it must not be wrong at.
   */
  it.each([
    ['Vietnam', '+84912345678'],
    ['the United Kingdom', '+447700900123'],
    ['the United States', '+14155552671'],
    ['China', '+8613800138000'],
    ['Réunion', '+262262123456'],
    ['Vietnam, written with 00', '0084912345678'],
  ])('says nothing about a number from %s on a French page', (_name, typed) => {
    expect(frenchNumberNote(typed, 'fr')).toBeNull()
  })

  /** R3. No prefix and no French page is no question. */
  it.each(['en', 'zh', 'vi'] as const)('asks nothing on a %s page', (locale) => {
    expect(frenchNumberNote('061485624', locale)).toBeNull()
    expect(frenchNumberNote('0912345678', locale)).toBeNull()
    expect(frenchNumberNote('6614856240', locale)).toBeNull()
  })

  /**
   * R13. A number F08 R4 refuses outright has its own message, and two
   * sentences under one field is one too many.
   */
  it.each(['', '   ', 'abc', '12345', '123456789012345678901'])(
    'leaves %j to F08',
    (typed) => {
      expect(frenchNumberNote(typed, 'fr')).toBeNull()
    },
  )

  /**
   * R10, in the one place a pure function can show it: the note is a value,
   * not a refusal. `phoneProblem` is what the step obeys, and it has not
   * learned anything about France.
   */
  it('does not change what the step will accept', () => {
    expect(frenchNumberNote('061485624', 'fr')).toBe(NOTE)
    expect(phoneProblem('061485624')).toBeNull()
  })

  /** Every language can show it: a +33 number is checked in all four. */
  it('is a key that exists', () => {
    expect(en[NOTE]).toBeTruthy()
  })
})
