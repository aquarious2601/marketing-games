import { describe, expect, it } from 'vitest'
import { formatDayAndMonth, isADate, monthNames } from './months'

/**
 * F38 R9. The browser names the months, so what is worth testing is the
 * things that would be wrong if it were asked carelessly: the order, the
 * timezone, and the leap day.
 */
describe('monthNames', () => {
  it('gives twelve, January first', () => {
    const names = monthNames('en')

    expect(names).toHaveLength(12)
    expect(names[0]).toBe('January')
    expect(names[11]).toBe('December')
  })

  it('names them in the language asked for', () => {
    expect(monthNames('fr')[2]).toBe('mars')
  })
})

describe('formatDayAndMonth', () => {
  it('writes the date the way the language does', () => {
    expect(formatDayAndMonth(12, 3, 'en')).toContain('March')
    expect(formatDayAndMonth(12, 3, 'fr')).toContain('mars')
  })

  /** F38 R6. Two numbers go in; no year can come out. */
  it('writes no year', () => {
    expect(formatDayAndMonth(12, 3, 'en')).not.toMatch(/\d{4}/)
  })

  /**
   * The reason everything here formats in UTC: the first of a month in a
   * timezone behind Greenwich would otherwise be the last day of the one
   * before it.
   */
  it('does not slip a day for a reader west of Greenwich', () => {
    expect(formatDayAndMonth(1, 3, 'en')).toContain('1')
    expect(formatDayAndMonth(1, 3, 'en')).toContain('March')
  })

  it('gives nothing for a pair that is not a date', () => {
    expect(formatDayAndMonth(31, 2, 'en')).toBe('')
  })
})

describe('isADate', () => {
  it('accepts the 29th of February', () => {
    expect(isADate(29, 2)).toBe(true)
  })

  it.each([
    [31, 2],
    [31, 4],
    [31, 6],
    [31, 9],
    [31, 11],
  ])('refuses the 31st of month %i', (day, month) => {
    expect(isADate(day, month)).toBe(false)
  })

  it.each([
    [0, 3],
    [32, 3],
    [12, 0],
    [12, 13],
    [1.5, 3],
    [Number.NaN, 3],
  ])('refuses %p / %p', (day, month) => {
    expect(isADate(day, month)).toBe(false)
  })
})
