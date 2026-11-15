import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchPlayerHistory, fetchPlayers, type AdminPlayer } from '../api/players'
import { PlayersModule } from './PlayersModule'

vi.mock('../api/players', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/players')>()),
  fetchPlayers: vi.fn(),
  fetchPlayerHistory: vi.fn(),
}))

const fetchPlayersMock = vi.mocked(fetchPlayers)
const fetchHistoryMock = vi.mocked(fetchPlayerHistory)

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
  fetchHistoryMock.mockReset()
  fetchPlayersMock.mockResolvedValue({ players: [ANH, BINH], total: 2 })
})

/** F08 R20 */
describe('the player list', () => {
  it('shows every player with their number and spin count', async () => {
    render(<PlayersModule />)

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
    fetchPlayersMock.mockResolvedValue({ players: [{ ...ANH, spinCount: 1 }], total: 1 })

    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    expect(screen.getByTestId('player-spin-count')).toHaveTextContent('1')
    expect(screen.getByTestId('players-total')).toHaveTextContent('1 player')
  })

  /**
   * F09 R21. The count comes from the server, not from the length of the
   * page it sent — which is what it used to be, so a shop with more players
   * than the cap would have read the cap forever.
   */
  it('reports the number of players that match, not the number shown', async () => {
    fetchPlayersMock.mockResolvedValue({ players: [ANH, BINH], total: 613 })

    render(<PlayersModule />)

    await screen.findByTestId('player-list')

    expect(screen.getByTestId('players-total')).toHaveTextContent('613 players')
    expect(screen.getByTestId('players-capped')).toHaveTextContent(
      'Showing the first 2 of 613 players.',
    )
  })

  /** F09 R16 — and it keeps quiet when the list really is everything */
  it('says nothing about a cap when the list is complete', async () => {
    render(<PlayersModule />)
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
    render(<PlayersModule />)

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
    fetchPlayersMock.mockResolvedValue({ players: [], total: 0 })

    render(<PlayersModule />)

    expect(await screen.findByTestId('players-empty')).toHaveTextContent(/nobody has played yet/i)
  })

  it('offers a retry when the list cannot be loaded', async () => {
    fetchPlayersMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<PlayersModule />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1 })
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
    render(<PlayersModule />)
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
    render(<PlayersModule />)

    const table = await screen.findByTestId('player-list')

    expect(table.tagName).toBe('TABLE')
    expect(table).toHaveAccessibleName('Players')
    expect(table.querySelector('thead')).not.toBeNull()
    expect(table.querySelector('tbody')).not.toBeNull()
  })

  /** F11 R3 */
  it('declares a width for every column and fixes the layout', async () => {
    render(<PlayersModule />)

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
    })

    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    const indexOfPhone = (row: HTMLElement, phone: string) =>
      Array.from(row.querySelectorAll('td')).findIndex((cell) => cell.textContent === phone)

    const [short, long] = screen.getAllByTestId('player-row')

    expect(indexOfPhone(short, '0912345678')).toBe(1)
    expect(indexOfPhone(long, '0987654321')).toBe(1)
  })

  /** F11 R5 — a count is a number, and its header agrees with its cells */
  it('right-aligns the spin count and its header', async () => {
    render(<PlayersModule />)
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
    render(<PlayersModule />)
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
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockResolvedValue({ players: [ANH], total: 1 })
    await user.type(screen.getByTestId('player-filter'), '5678')

    // Filtered server-side, not in the loaded array: the list is capped, so
    // filtering what happens to be loaded would search the first page only.
    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalledWith('5678', expect.anything()))

    await waitFor(() => expect(screen.getAllByTestId('player-row')).toHaveLength(1))
  })

  it('says so when the filter matches nobody', async () => {
    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockResolvedValue({ players: [], total: 0 })
    await user.type(screen.getByTestId('player-filter'), '0000')

    expect(await screen.findByTestId('players-empty')).toHaveTextContent(/no players match/i)
  })

  /** The pause is what keeps a four-digit search to one request, not four. */
  it('does not ask once per keystroke', async () => {
    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    fetchPlayersMock.mockClear()
    await user.type(screen.getByTestId('player-filter'), '5678')

    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalled())

    expect(fetchPlayersMock.mock.calls.length).toBeLessThan(4)
  })
})

/** F08 R22 */
describe('one player history', () => {
  /**
   * F11 R11, R12. The history is a row of the same table, spanning every
   * column, so the grid above and below it stays aligned — and the control
   * that opens it is a button in the first cell, which is the only way to
   * make a row openable from a keyboard.
   */
  it('opens as a spanning row of the same table', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [{ id: 9, prizeName: 'Free sample', spunAt: '2026-11-15T10:02:11+00:00' }],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    const toggle = screen.getAllByTestId('player-open')[0]
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.closest('td')).toBe(
      screen.getAllByTestId('player-row')[0].querySelectorAll('td')[0],
    )

    await user.click(toggle)
    await screen.findByTestId('player-history')

    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const spanning = screen.getByTestId('player-history-row-group')
    expect(spanning.tagName).toBe('TR')
    expect(spanning.querySelector('td')).toHaveAttribute('colspan', '5')
    expect(screen.getByTestId('player-list')).toContainElement(spanning)
  })

  /** F11 R2 — the history has labelled columns of its own */
  it('labels the history columns', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [{ id: 9, prizeName: 'Free sample', spunAt: '2026-11-15T10:02:11+00:00' }],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])

    const history = await screen.findByTestId('player-history')
    const headers = Array.from(history.querySelectorAll('th')).map((th) => th.textContent)

    expect(headers).toEqual(['Prize', 'Spun'])
  })

  it('opens the spins beneath the row', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [
        { id: 9, prizeName: 'Free sample', spunAt: '2026-11-15T10:02:11+00:00' },
        { id: 8, prizeName: 'Try again', spunAt: '2026-11-15T09:58:00+00:00' },
      ],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])

    expect(await screen.findByTestId('player-history')).toBeInTheDocument()
    expect(screen.getAllByTestId('player-history-row')).toHaveLength(2)
    expect(screen.getByText('Free sample')).toBeInTheDocument()
    expect(fetchHistoryMock).toHaveBeenCalledWith(ANH.id)
  })

  it('keeps the order the server sent', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [
        { id: 9, prizeName: 'Newest', spunAt: '2026-11-15T10:02:11+00:00' },
        { id: 8, prizeName: 'Oldest', spunAt: '2026-11-15T09:58:00+00:00' },
      ],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])
    await screen.findByTestId('player-history')

    const names = screen
      .getAllByTestId('player-history-row')
      .map((row) => row.firstElementChild?.textContent)

    expect(names).toEqual(['Newest', 'Oldest'])
  })

  it('says so when a player has never spun', async () => {
    fetchHistoryMock.mockResolvedValue({ player: BINH, spins: [] })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[1])

    expect(await screen.findByTestId('player-history-empty')).toBeInTheDocument()
  })

  it('closes again when the row is pressed a second time', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [{ id: 9, prizeName: 'Free sample', spunAt: '2026-11-15T10:02:11+00:00' }],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    const row = screen.getAllByTestId('player-open')[0]

    await user.click(row)
    await screen.findByTestId('player-history')

    await user.click(row)

    expect(screen.queryByTestId('player-history')).not.toBeInTheDocument()
  })

  it('opens one player at a time', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [{ id: 9, prizeName: 'Free sample', spunAt: '2026-11-15T10:02:11+00:00' }],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])
    await screen.findByTestId('player-history')

    fetchHistoryMock.mockResolvedValue({ player: BINH, spins: [] })
    await user.click(screen.getAllByTestId('player-open')[1])

    expect(await screen.findByTestId('player-history-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('player-history')).not.toBeInTheDocument()
  })

  it('reports a history that cannot be loaded without losing the list', async () => {
    fetchHistoryMock.mockRejectedValue(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(/history could not be loaded/i)
    // The filter the admin typed to find this row is still there.
    expect(screen.getByTestId('player-list')).toBeInTheDocument()
  })

  /**
   * F08 R22. The history reads the spin's own snapshot (F02 R10), so a prize
   * the admin has since deleted still has a name here. Asserted on the page
   * as well as on the API, because a page that fell back to the live prize
   * list would silently show a blank.
   */
  it('names a prize that no longer exists on the wheel', async () => {
    fetchHistoryMock.mockResolvedValue({
      player: ANH,
      spins: [{ id: 9, prizeName: 'A prize since deleted', spunAt: '2026-11-15T10:02:11+00:00' }],
    })

    const user = userEvent.setup()
    render(<PlayersModule />)
    await screen.findByTestId('player-list')

    await user.click(screen.getAllByTestId('player-open')[0])

    expect(await screen.findByText('A prize since deleted')).toBeInTheDocument()
  })
})
