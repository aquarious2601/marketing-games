/**
 * How the admin tables render values (F11 R7).
 *
 * A module of its own rather than a few more exports from DataTable.tsx: a
 * file that exports both components and plain functions breaks React's fast
 * refresh, and the linter is right to say so.
 */

/**
 * A date, in the admin's own locale and at a stable width.
 *
 * `toLocaleDateString()` with no options was what both listings used, which
 * gives "15/11/2026" in one locale and "11/15/2026" in another and is fine —
 * but its sibling `toLocaleString()` gives "15/11/2026, 10:02:11", long
 * enough to be truncated in any column it fits in and a width that changes
 * with the hour. The explicit options here keep both compact and keep every
 * row the same length, while still reading the way the admin's machine reads
 * dates.
 *
 * An unparseable value comes back untouched rather than as "Invalid Date",
 * which tells the admin nothing about what went wrong.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  // No seconds and no year: a spin is read in the context of today or
  // yesterday, and the seconds are noise in a column being scanned.
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * What an empty cell says.
 *
 * A dash, so the cell is a stated fact rather than missing data: an empty
 * cell is ambiguous between "no value" and "we failed to load it".
 */
export const EMPTY = '—'
