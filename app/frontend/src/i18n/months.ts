/**
 * Months, named by the browser in the reader's own language (F38 R9).
 *
 * Twelve names in four languages would be forty-eight strings to keep in
 * `en.ts` and its siblings, each one a chance to be subtly wrong in a
 * language nobody on the project reads. Every browser already knows them.
 *
 * Everything here formats in UTC. The dates below are not instants — they
 * are a day and a month being turned into words — and formatting them in the
 * reader's timezone would move "1 March" to the last day of February for
 * anybody west of Greenwich.
 */

/** A year with a 29th of February in it, so every day of every month exists. */
const LEAP_YEAR = 2024

/** The twelve names, in order, January first. */
export function monthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })

  return Array.from({ length: 12 }, (_, index) =>
    format.format(new Date(Date.UTC(LEAP_YEAR, index, 1))),
  )
}

/**
 * A birthday as a reader of this language would write it: "12 March",
 * "12 mars", "3月12日" (F38 R7).
 *
 * The order is the locale's, which is the point of asking it rather than
 * joining the two with a space.
 */
export function formatDayAndMonth(day: number, month: number, locale: string): string {
  if (!isADate(day, month)) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(LEAP_YEAR, month - 1, day)))
}

/**
 * F38 R3. Whether the pair is a day somebody can be born on.
 *
 * Checked in a leap year, so 29 February is a birthday rather than a typo in
 * the three years out of four when that date does not come round.
 */
export function isADate(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) {
    return false
  }

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return false
  }

  // Date rolls 31 February into March rather than refusing it, so what comes
  // back is compared against what went in.
  const rolled = new Date(Date.UTC(LEAP_YEAR, month - 1, day))

  return rolled.getUTCMonth() === month - 1 && rolled.getUTCDate() === day
}
