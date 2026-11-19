import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchPlayers, type AdminPlayer } from '../api/players'
import { PlayersModule } from './PlayersModule'

vi.mock('../api/players', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/players')>()),
  fetchPlayers: vi.fn(),
}))

const fetchPlayersMock = vi.mocked(fetchPlayers)

/**
 * F31 R1, R18. The module reads its filter from the URL and links to a
 * customer's own page, so every render needs a router — and the stand-in
 * page below is what a test asserts navigation against.
 */
function renderList(at = '/admin/players') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/admin/players" element={<PlayersModule />} />
        <Route path="/admin/players/:id" element={<CustomerStandIn />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Stands in for the customer's page, which has its own tests. */
function CustomerStandIn() {
  return <p data-testid="customer-page">the customer</p>
}

const ANH: AdminPlayer = {
  id: 1,
  phone: '0912345678',
  firstName: 'Anh',
  lastName: 'Le',
  birthday: '1994-03-12',
  createdAt: '2026-11-15T09:30:00+00:00',
  spinCount: 2,
}

const BINH: AdminPlayer = {
  id: 2,
  phone: '0987654321',
  firstName: 'Binh',
  lastName: 'Tran',
  birthday: '1988-07-04',
  createdAt: '2026-11-15T10:00:00+00:00',
  spinCount: 0,
}

beforeEach(() => {
  fetchPlayersMock.mockReset()
  fetchPlayersMock.mockResolvedValue({ players: [ANH, BINH], total: 2, winWithoutCustomer: false })
})

/** F08 R20 */
describe('the player list', () => {
  it('shows every player with their number and spin count', async () => {
    renderList()

    await screen.findByTestId('player-list')

    expect(screen.getAllByTestId('player-row')).toHaveLength(2)
    expect(screen.getByText('Anh Le')).toBeInTheDocument()
    expect(screen.getByText('0912345678')).toBeInTheDocument()

    // F11 R5: a bare number in its own labelled column, not "2 spins" glued
    // into the row. The word belongs in the header, once.
    const counts = screen.getAllByTestId('player-spin-count')
    expect(counts.map((cell) => cell.textContent)).toEqual(['2', '0'])
  })

  it('counts a player with one spin', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [{ ...ANH, spinCount: 1 }], total: 1, winWithoutCustomer: false })

    renderList()
    await screen.findByTestId('player-list')

    expect(screen.getByTestId('player-spin-count')).toHaveTextContent('1')
    expect(screen.getByTestId('players-total')).toHaveTextContent('1 customer')
  })

  /**
   * F09 R21. The count comes from the server, not from the length of the
   * page it sent — which is what it used to be, so a shop with more players
   * than the cap would have read the cap forever.
   */
  it('reports the number of players that match, not the number shown', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [ANH, BINH], total: 613, winWithoutCustomer: false })

    renderList()

    await screen.findByTestId('player-list')

    expect(screen.getByTestId('players-total')).toHaveTextContent('613 customers')
    expect(screen.getByTestId('players-capped')).toHaveTextContent(
      'Showing the first 2 of 613 customers.',
    )
  })

  /** F09 R16 — and it keeps quiet when the list really is everything */
  it('says nothing about a cap when the list is complete', async () => {
    renderList()
    await screen.findByTestId('player-list')

    expect(screen.queryByTestId('players-capped')).not.toBeInTheDocument()
  })

  /**
   * F11 R7. The birthday is in its own labelled column now, rendered
   * compactly rather than as the ISO string the API sends — "Born
   * 1994-03-12 · joined 15/11/2026" in one cell was the presentation this
   * feature removed.
   */
  it('shows the birthday in its own column, formatted', async () => {
    renderList()

    await screen.findByTestId('player-list')

    expect(screen.getByTestId('th-birthday')).toHaveTextContent('Birthday')
    expect(screen.queryByText(/^Born /)).not.toBeInTheDocument()
    expect(screen.queryByText('1994-03-12')).not.toBeInTheDocument()

    // Rendered in the test runner's locale, so the assertion is on the
    // parts rather than on one locale's spelling of them.
    const row = screen.getAllByTestId('player-row')[0]
    expect(row).toHaveTextContent('1994')
    expect(row).toHaveTextContent(/Mar/i)
  })

  it('says so when nobody has played', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [], total: 0, winWithoutCustomer: false })

    renderList()

    expect(await screen.findByTestId('players-empty')).toHaveTextContent(/nobody has played yet/i)
  })

  it('offers a retry when the list cannot be loaded', async () => {
    fetchPlayersMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    renderList()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('player-list')).toBeInTheDocument()
  })
})

/**
 * F11: the table standard.
 *
 * These are the assertions the old flex-row listing could not have passed,
 * and they are what stops a later "quick fix" to one cell's class from
 * quietly undoing the alignment again.
 */
describe('the table itself', () => {
  const HEADERS = ['Name', 'Phone', 'Birthday', 'Joined', 'Spins']

  /** F11 R1, R2 */
  it('labels every column', async () => {
    renderList()
    await screen.findByTestId('player-list')

    const headers = screen.getAllByRole('columnheader')

    expect(headers.map((header) => header.textContent)).toEqual(HEADERS)

    // scope="col" is what associates a cell with its label; without it the
    // header is decoration and a screen reader reads five bare values.
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col')
    }
  })

  /** F11 R1 */
  it('is a real table, not a list of rows', async () => {
    renderList()

    const table = await screen.findByTestId('player-list')

    expect(table.tagName).toBe('TABLE')
    expect(table).toHaveAccessibleName('Customers')
    expect(table.querySelector('thead')).not.toBeNull()
    expect(table.querySelector('tbody')).not.toBeNull()
  })

  /** F11 R3 */
  it('declares a width for every column and fixes the layout', async () => {
    renderList()

    const table = await screen.findByTestId('player-list')

    // `table-fixed` is the rule and not a detail: without it the browser
    // sizes columns from their content and every row negotiates its own
    // layout.
    expect(table).toHaveClass('table-fixed')

    const widths = Array.from(table.querySelectorAll('col')).map((col) => col.style.width)

    expect(widths).toHaveLength(HEADERS.length)
    expect(widths.every((width) => width !== '')).toBe(true)
  })

  /**
   * F11 R3, and the whole point of the feature. Two names twenty characters
   * apart used to push the phone number to a different place on each line;
   * in a fixed table it is the same cell index in both rows.
   */
  it('puts a field in the same column whatever the row beside it contains', async () => {
    fetchPlayersMock.mockResolvedValue({
      players: [
        { ...ANH, firstName: 'Bo', lastName: 'Vu' },
        { ...BINH, firstName: 'Maximilian-Alexander', lastName: 'Van Der Westhuizen' },
      ],
      total: 2,
      winWithoutCustomer: false,
    })

    renderList()
    await screen.findByTestId('player-list')

    const indexOfPhone = (row: HTMLElement, phone: string) =>
      Array.from(row.querySelectorAll('td')).findIndex((cell) => cell.textContent === phone)

    const [short, long] = screen.getAllByTestId('player-row')

    expect(indexOfPhone(short, '0912345678')).toBe(1)
    expect(indexOfPhone(long, '0987654321')).toBe(1)
  })

  /** F11 R5 — a count is a number, and its header agrees with its cells */
  it('right-aligns the spin count and its header', async () => {
    renderList()
    await screen.findByTestId('player-list')

    expect(screen.getByTestId('th-spins')).toHaveClass('text-right')

    for (const cell of screen.getAllByTestId('player-spin-count')) {
      expect(cell).toHaveClass('text-right')
      // F11 R6: proportional figures make a 1 narrower than a 0, and then
      // a column of numbers cannot be read down at all.
      expect(cell).toHaveClass('tabular-nums')
    }
  })

  /** F11 R4 */
  it('keeps the full value reachable when a cell truncates', async () => {
    renderList()
    await screen.findByTestId('player-list')

    const phone = screen.getAllByTestId('player-row')[0].querySelectorAll('td')[1]

    expect(phone).toHaveClass('truncate')
    expect(phone).toHaveAttribute('title', '0912345678')
  })
})

/** F08 R21 */
describe('the phone filter', () => {
  it('asks the server for the filtered list', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })
    await user.type(screen.getByTestId('player-filter'), '5678')

    // Filtered server-side, not in the loaded array: the list is capped, so
    // filtering what happens to be loaded would search the first page only.
    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalledWith('5678', expect.anything()))

    await waitFor(() => expect(screen.getAllByTestId('player-row')).toHaveLength(1))
  })

  it('says so when the filter matches nobody', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockResolvedValue({ players: [], total: 0, winWithoutCustomer: false })
    await user.type(screen.getByTestId('player-filter'), '0000')

    expect(await screen.findByTestId('players-empty')).toHaveTextContent(/no customers match/i)
  })

  /** The pause is what keeps a four-digit search to one request, not four. */
  it('does not ask once per keystroke', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockClear()
    await user.type(screen.getByTestId('player-filter'), '5678')

    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalled())

    expect(fetchPlayersMock.mock.calls.length).toBeLessThan(4)
  })
})

/** F08 R22 */

/** F31 R1, R6, R7, R10: the list is the way in to a customer. */
describe('opening a customer', () => {
  it('links to the customer page, carrying the search that found them', async () => {
    const user = userEvent.setup()

    renderList()
    await screen.findByTestId('player-list')

    await user.type(screen.getByTestId('player-filter'), '5678')
    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalledWith('5678', expect.anything()))

    const link = screen.getAllByTestId('player-open')[0]

    // The filter travels in the URL, which is what lets the customer's page
    // link back to the list somebody typed to find them (F09 R12's reason,
    // kept true for a page).
    expect(link).toHaveAttribute('href', '/admin/players/1?search=5678')
  })

  it('opens the customer when the row is pressed', async () => {
    const user = userEvent.setup()

    renderList()
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])

    expect(await screen.findByTestId('customer-page')).toBeInTheDocument()
  })

  /**
   * R6. A complete code that found one customer opens them, so a ticket is
   * one action. Narrowed to a complete code while building: see the module.
   */
  it('opens the one customer a complete code found', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })

    renderList('/admin/players?search=A7K3-M9PX')

    expect(await screen.findByTestId('customer-page')).toBeInTheDocument()
  })

  it('stays on the list when one customer matched a phone fragment', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })

    renderList('/admin/players?search=5678')

    await screen.findByTestId('player-list')

    expect(screen.queryByTestId('customer-page')).not.toBeInTheDocument()
  })

  it('reads its filter from the URL', async () => {
    renderList('/admin/players?search=A7K3')

    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalledWith('A7K3', expect.anything()))

    expect(screen.getByTestId('player-filter')).toHaveValue('A7K3')
  })
})

/** F33 R20 to R23: the counter's half of a scan. */
describe('a scanned code', () => {
  /*
   * R20. A scanner types into whatever is focused, and a scan that lands
   * nowhere is lost without a sound: no beep to say it went missing, nothing
   * on screen, and a customer waiting.
   */
  it('has somewhere to land when the module opens', async () => {
    renderList()

    await screen.findByTestId('player-list')

    expect(screen.getByTestId('player-filter')).toHaveFocus()
  })

  /**
   * R21, on R20's focus: nothing is clicked here, so this only passes while
   * the box is the thing a scanner would have typed into.
   */
  it('opens the one customer on Enter', async () => {
    const user = userEvent.setup()
    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })

    renderList('/admin/players?search=5678')
    await screen.findByTestId('player-list')

    await user.keyboard('{Enter}')

    expect(await screen.findByTestId('customer-page')).toBeInTheDocument()
  })

  it('does nothing on Enter while several customers match', async () => {
    const user = userEvent.setup()

    renderList('/admin/players?search=09')
    await screen.findByTestId('player-list')

    await user.keyboard('{Enter}')

    expect(screen.queryByTestId('customer-page')).not.toBeInTheDocument()
  })

  /*
   * R22. Scanners ship configured differently and the shop that buys one is
   * not the shop that configures it: a space either side, a tab, a carriage
   * return. None of it is the code.
   */
  it.each([' A7K3-M9PX ', 'A7K3M9PX', 'a7k3-m9px', 'A7K3-M9PX\r'])(
    'reads %j as the same code',
    async (scanned) => {
      fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1, winWithoutCustomer: false })

      renderList(`/admin/players?search=${encodeURIComponent(scanned)}`)

      expect(await screen.findByTestId('customer-page')).toBeInTheDocument()
    },
  )

  /*
   * R23. A field that blanks itself on a bad scan throws away the one clue
   * there was — what the scanner actually made of the label.
   */
  it('keeps what was scanned when it matches nobody', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [], total: 0, winWithoutCustomer: false })

    renderList('/admin/players?search=A7K3-M9PX')

    expect(await screen.findByTestId('players-empty')).toBeInTheDocument()
    expect(screen.getByTestId('player-filter')).toHaveValue('A7K3-M9PX')
    expect(screen.queryByTestId('customer-page')).not.toBeInTheDocument()
  })
})

/** F31 R7: a prize the shop owes somebody nobody can name. */
describe('a code whose win has no customer', () => {
  it('says where it can still be handed over', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [], total: 0, winWithoutCustomer: true })

    renderList('/admin/players?search=A7K3-M9PX')

    const message = await screen.findByTestId('players-orphan-win')

    expect(message).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Spins' })).toHaveAttribute('href', '/admin/spins')

    // And not the flat nothing, which would read as "that code is not real".
    expect(screen.queryByTestId('players-empty')).not.toBeInTheDocument()
  })

  it('reports an ordinary nothing as an ordinary nothing', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [], total: 0, winWithoutCustomer: false })

    renderList('/admin/players?search=KKKK')

    expect(await screen.findByTestId('players-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('players-orphan-win')).not.toBeInTheDocument()
  })
})
