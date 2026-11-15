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
  today,
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
  const valid = { firstName: 'Anh', lastName: 'Le', birthday: '1994-03-12' }

  it('passes a complete set of details', () => {
    expect(detailsProblems(valid)).toEqual({})
    expect(hasProblems(detailsProblems(valid))).toBe(false)
  })

  /**
   * F08 R10. Somebody at a counter with a queue behind them should not
   * discover three mistakes in three submissions.
   */
  it('reports every problem at once', () => {
    const problems = detailsProblems({ firstName: '', lastName: '  ', birthday: '' })

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
    const problems = detailsProblems({ firstName: '', lastName: '', birthday: '' })

    expect(problems.firstName).toBe('identity.firstNameRequired')
    expect(problems.lastName).toBe('identity.lastNameRequired')
    expect(problems.birthday).toBe('identity.birthdayRequired')
  })

  /** Counted in characters, so a Vietnamese name is not measured in bytes. */
  it('accepts an accented name up to the character limit', () => {
    expect(detailsProblems({ ...valid, lastName: 'ễ'.repeat(NAME_MAX_LENGTH) })).toEqual({})
  })

  it.each([
    ['empty', ''],
    ['prose', 'sometime in the nineties'],
    ['the wrong way round', '12/03/1994'],
    ['a datetime', '1994-03-12T00:00:00Z'],
    // Date rolls this into 2 March rather than rejecting it, so the parsed
    // value is compared back against the input.
    ['a day that does not exist', '1994-02-30'],
    ['the future', '2099-01-01'],
    ['before records', '1823-04-01'],
  ])('rejects %s as a birthday', (_name, birthday) => {
    expect(detailsProblems({ ...valid, birthday }).birthday).toBeDefined()
  })

  it('accepts a birthday of today', () => {
    expect(detailsProblems({ ...valid, birthday: today() })).toEqual({})
  })

  /**
   * The reason `today()` reads a local clock rather than a UTC one: a player
   * in Hanoi filling this in during the morning is seven hours ahead of UTC,
   * and would be told their own birthday is in the future.
   */
  it('does not call a birthday in the future when the browser is ahead of UTC', () => {
    vi.useFakeTimers()
    // 07:00 in Hanoi on 15 November is still 14 November in UTC.
    vi.setSystemTime(new Date('2026-11-15T00:00:00+07:00'))
    const offset = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-420)

    try {
      expect(detailsProblems({ ...valid, birthday: '2026-11-15' })).toEqual({})
    } finally {
      offset.mockRestore()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
