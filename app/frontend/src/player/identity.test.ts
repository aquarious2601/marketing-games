import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en'
import {
  MAX_PHONE_DIGITS,
  MIN_PHONE_DIGITS,
  NAME_MAX_LENGTH,
  canonicalisePhone,
  detailsProblems,
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
