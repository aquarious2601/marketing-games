/**
 * The one table the admin listings are built from (F11 R1, R13).
 *
 * Both listings were hand-built lists of flex rows before F11, and had
 * already drifted apart: different hover treatment, different date
 * formatting, one of them writing "2 spins" inside a row while the other
 * wrote a bare number. Declaring a column's label, width and alignment in
 * one place means they cannot drift again, and the next listing starts
 * correct rather than starting from whichever of the two got copied.
 *
 * What this owns: the scroll frame, the column widths, the header row, and
 * the cell primitives. What the caller owns: its own rows. A generic row
 * renderer was the other option and it falls over on the first row that
 * opens (F11 R11), so rows stay the caller's job.
 */

export interface Column {
  /** Used as the React key and in the cell's test id. */
  key: string
  /** F11 R2: never optional. There is no such thing as an unlabelled column. */
  label: string
  /** F11 R3: a CSS width for the `<col>`; percentages across one table. */
  width: string
  /**
   * F11 R5. Set it here and the header follows automatically — the header and
   * its cells cannot end up disagreeing, which is what happens when each
   * side carries its own class.
   */
  align?: 'left' | 'right'
}

interface DataTableProps {
  /** Names the table for assistive technology. */
  label: string
  columns: Column[]
  /**
   * The width below which the columns stop being readable. Under it the
   * table scrolls inside its own card (F11 R9) rather than widening the
   * module or dropping a column (F11 R10).
   */
  minWidth: string
  testId?: string
  children: React.ReactNode
}

export function DataTable({ label, columns, minWidth, testId, children }: DataTableProps) {
  return (
    // The frame that scrolls, not the page (F11 R9). `-mx-4 px-4` lets the
    // scrolling area run to the edges of the card's padding, so a row does
    // not appear to be cut off inside a visible margin.
    <div className="-mx-4 mt-4 overflow-x-auto px-4">
      <table
        aria-label={label}
        data-testid={testId}
        // F11 R3. `table-fixed` is the rule, not a detail: without it the
        // browser sizes columns from their content, every row negotiates its
        // own layout, and the phone column lands in a different place on
        // each line — which is the fault this component exists to remove.
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth }}
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>

        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-testid={`th-${column.key}`}
                className={[
                  'pb-2 pr-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500',
                  column.align === 'right' ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

interface RowProps {
  testId?: string
  /** Extra attributes a listing wants on its rows, e.g. `data-phone`. */
  attrs?: Record<string, string>
  children: React.ReactNode
}

/** F11 R8: the pointer's row is marked. */
export function Row({ testId, attrs, children }: RowProps) {
  return (
    <tr data-testid={testId} {...attrs} className="hover:bg-slate-50">
      {children}
    </tr>
  )
}

interface CellProps {
  align?: 'left' | 'right'
  /** F11 R6: digits read as digits line up down the column. */
  numeric?: boolean
  /** Phone numbers, where a monospace face makes a mistyped digit visible. */
  mono?: boolean
  strong?: boolean
  muted?: boolean
  testId?: string
  /**
   * The full value, for the `title` when the cell truncates (F11 R4).
   * Defaults to the children when they are a plain string.
   */
  title?: string
  children: React.ReactNode
}

export function Cell({
  align = 'left',
  numeric = false,
  mono = false,
  strong = false,
  muted = false,
  testId,
  title,
  children,
}: CellProps) {
  return (
    <td
      data-testid={testId}
      // F11 R4: the full value stays reachable when the column cannot show
      // it all. Taken from the children when they are already a string, so
      // the common case needs nothing at the call site.
      title={title ?? (typeof children === 'string' ? children : undefined)}
      className={[
        'truncate py-2.5 pr-3 align-middle',
        align === 'right' ? 'text-right' : 'text-left',
        // `tabular-nums` is why a column of numbers can be read at all: with
        // proportional figures a 1 is narrower than a 0 and nothing lines up.
        numeric ? 'tabular-nums' : '',
        mono ? 'font-mono text-[13px] tabular-nums' : '',
        strong ? 'font-medium text-slate-900' : '',
        muted ? 'text-xs text-slate-500' : 'text-slate-700',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  )
}

/**
 * A row that spans the whole table — a player's history (F11 R11).
 *
 * Inside the same table rather than after it, so the columns above and below
 * it stay aligned. A separate element would have its own width and the grid
 * would break exactly where somebody is reading closely.
 */
export function SpanningRow({
  columns,
  testId,
  children,
}: {
  columns: number
  testId?: string
  children: React.ReactNode
}) {
  return (
    <tr data-testid={testId} className="bg-slate-50/60">
      <td colSpan={columns} className="px-0 pb-3 pt-1">
        {children}
      </td>
    </tr>
  )
}

/*
 * How values are rendered — dates, and what an empty cell says — lives in
 * `tableFormat.ts`, because a file that exports both components and plain
 * functions breaks React's fast refresh.
 */
