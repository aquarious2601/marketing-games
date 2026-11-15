import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchSpinLog, setSpinClaimed, type LoggedSpin } from '../api/players'
import { SpinsModule } from './SpinsModule'

vi.mock('../api/players', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/players')>()),
  fetchSpinLog: vi.fn(),
  setSpinClaimed: vi.fn(),
}))

const fetchSpinLogMock = vi.mocked(fetchSpinLog)
const setSpinClaimedMock = vi.mocked(setSpinClaimed)

function spin(overrides: Partial<LoggedSpin> = {}): LoggedSpin {
  return {
    id: 9,
    prizeName: 'Free sample',
    spunAt: '2026-11-15T10:02:11+00:00',
    player: { id: 1, phone: '0912345678', firstName: 'Anh', lastName: 'Le' },
    // F13: a claimable discount with a code is the ordinary case; the
    // tests about a losing row or a free product say so explicitly.
    rewardType: 'percent_off',
    rewardValue: 10,
    code: 'A7K3-M9PX',
    claimable: true,
    claimedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  fetchSpinLogMock.mockReset()
  setSpinClaimedMock.mockReset()
  fetchSpinLogMock.mockResolvedValue({ spins: [spin()], total: 1 })
})

/** F09 R13, R14 */
describe('the spin log', () => {
  it('lists every spin with its prize, player and time', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [
        spin({ id: 9, prizeName: 'Free sample' }),
        spin({
          id: 8,
          prizeName: 'Try again',
          player: { id: 2, phone: '0987654321', firstName: 'Binh', lastName: 'Tran' },
        }),
      ],
      total: 2,
    })

    render(<SpinsModule />)

    await screen.findByTestId('spin-log')

    expect(screen.getAllByTestId('spin-row')).toHaveLength(2)
    expect(screen.getByText('Free sample')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()

    // F11: the name and the number are separate columns now, so each can be
    // read straight down. They used to be one cell of concatenated text.
    expect(screen.getAllByTestId('spin-player')[0]).toHaveTextContent('Anh Le')
    expect(screen.getAllByTestId('spin-row')[0].querySelectorAll('td')[2]).toHaveTextContent(
      '0912345678',
    )
  })

  it('keeps the order the server sent', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ id: 9, prizeName: 'Newest' }), spin({ id: 8, prizeName: 'Oldest' })],
      total: 2,
    })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    const prizes = screen
      .getAllByTestId('spin-row')
      .map((row) => row.firstElementChild?.textContent)

    expect(prizes).toEqual(['Newest', 'Oldest'])
  })

  it('counts one spin in the singular', async () => {
    render(<SpinsModule />)

    // Waited on the log, not on the count: the count is on screen from the
    // first render, reading 0 while the request is still in flight.
    await screen.findByTestId('spin-log')

    expect(screen.getByTestId('spins-total')).toHaveTextContent('1 spin')
  })

  /**
   * F09 R15 with F11 §9. A dash, not an empty cell and not a hidden row: an
   * empty cell is ambiguous between "no value" and "we failed to load it",
   * while a dash says the question was asked and the answer is nothing —
   * which for a player who was deleted (F08 R19) is exactly the fact.
   */
  it('shows a dash for a spin with no player rather than hiding it', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ player: null })],
      total: 1,
    })

    render(<SpinsModule />)

    await screen.findByTestId('spin-log')

    expect(screen.getAllByTestId('spin-row')).toHaveLength(1)
    expect(screen.getByText('Free sample')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-player')).not.toBeInTheDocument()

    // Both the player and the phone cell, so neither reads as missing.
    const cells = screen.getByTestId('spin-row').querySelectorAll('td')
    expect(cells[1]).toHaveTextContent('—')
    expect(cells[2]).toHaveTextContent('—')
    expect(screen.getByTestId('spin-anonymous')).toBe(cells[1])
  })

  /**
   * F09 R17. Asserted on the page as well as on the API, because a page that
   * fell back to the live prize list would silently show a blank here.
   */
  it('names a prize that no longer exists on the wheel', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ prizeName: 'A prize since deleted' })],
      total: 1,
    })

    render(<SpinsModule />)

    expect(await screen.findByText('A prize since deleted')).toBeInTheDocument()
  })

  it('offers a retry when the log cannot be loaded', async () => {
    fetchSpinLogMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<SpinsModule />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/spins could not be loaded/i)

    fetchSpinLogMock.mockResolvedValue({ spins: [spin()], total: 1 })
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('spin-log')).toBeInTheDocument()
  })
})

/** F11: the table standard, and that both listings really share it. */
describe('the table itself', () => {
  // F13 added Code and Status; Spun moved along with them.
  const HEADERS = ['Prize', 'Player', 'Phone', 'Code', 'Spun', 'Status']

  /** F11 R1, R2 */
  it('labels every column', async () => {
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    const headers = screen.getAllByRole('columnheader')

    expect(headers.map((header) => header.textContent)).toEqual(HEADERS)

    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col')
    }
  })

  /** F11 R1 */
  it('is a real table, not a list of rows', async () => {
    render(<SpinsModule />)

    const table = await screen.findByTestId('spin-log')

    expect(table.tagName).toBe('TABLE')
    expect(table).toHaveAccessibleName('Spin log')
    expect(table.querySelector('thead')).not.toBeNull()
  })

  /** F11 R3 */
  it('declares a width for every column and fixes the layout', async () => {
    render(<SpinsModule />)

    const table = await screen.findByTestId('spin-log')

    expect(table).toHaveClass('table-fixed')

    const widths = Array.from(table.querySelectorAll('col')).map((col) => col.style.width)

    expect(widths).toHaveLength(HEADERS.length)
    expect(widths.every((width) => width !== '')).toBe(true)
  })

  /**
   * F11 R3. A prize name of wildly different length used to move the phone
   * number along the row; now it cannot.
   */
  it('puts a field in the same column whatever the row beside it contains', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [
        spin({ id: 9, prizeName: 'Hat' }),
        spin({
          id: 8,
          prizeName: 'Twenty per cent off absolutely everything in the shop today',
          player: { id: 2, phone: '0987654321', firstName: 'Binh', lastName: 'Tran' },
        }),
      ],
      total: 2,
    })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    const [short, long] = screen.getAllByTestId('spin-row')

    expect(short.querySelectorAll('td')[2]).toHaveTextContent('0912345678')
    expect(long.querySelectorAll('td')[2]).toHaveTextContent('0987654321')
  })

  /** F11 R4 — a long prize name is truncated, not wrapped, and keeps its title */
  it('keeps a long prize name reachable', async () => {
    const name = 'Twenty per cent off absolutely everything in the shop today'
    fetchSpinLogMock.mockResolvedValue({ spins: [spin({ prizeName: name })], total: 1 })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    const prize = screen.getByTestId('spin-row').querySelectorAll('td')[0]

    expect(prize).toHaveClass('truncate')
    expect(prize).toHaveAttribute('title', name)
  })

  /** F11 R7 — a compact locale date, never the ISO string */
  it('does not print the raw timestamp', async () => {
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    const when = screen.getByTestId('spin-row').querySelectorAll('td')[4]

    expect(when).not.toHaveTextContent('2026-11-15T10:02:11+00:00')
    expect(when).toHaveClass('tabular-nums')
    expect(when.textContent).toMatch(/15/)
  })

  /** F11 R13 — the shared table means a label means one thing in both */
  it('uses the same Phone and Spun labels as the players listing', async () => {
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.getByTestId('th-phone')).toHaveTextContent('Phone')
    expect(screen.getByTestId('th-spun')).toHaveTextContent('Spun')
  })
})

/** F13 R19, R21–R24: the code, the status and the claim. */
describe('rewards on a log row', () => {
  it('shows the code for a discount', async () => {
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.getByTestId('spin-code')).toHaveTextContent('A7K3-M9PX')
  })

  /** F13 R19: a free product is claimed by showing the screen. */
  it('shows a dash where there is no code', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ rewardType: 'free_product', rewardValue: null, code: null })],
      total: 1,
    })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.getByTestId('spin-code')).toHaveTextContent('—')
    // Still claimable: it is a real prize, just one with no code.
    expect(screen.getByTestId('spin-claim')).toBeInTheDocument()
  })

  /** F13 R24 */
  it('offers nothing to press on a losing row', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ rewardType: 'nothing', rewardValue: null, code: null, claimable: false })],
      total: 1,
    })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.queryByTestId('spin-claim')).not.toBeInTheDocument()
    expect(screen.getByTestId('spin-status')).toHaveTextContent('—')
  })

  /** F13 R22 */
  it('marks a reward claimed', async () => {
    setSpinClaimedMock.mockResolvedValue(spin({ claimedAt: '2026-11-15T11:00:00+00:00' }))

    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.getByTestId('spin-claim')).toHaveTextContent('Claim')

    await user.click(screen.getByTestId('spin-claim'))

    await waitFor(() => expect(setSpinClaimedMock).toHaveBeenCalledWith(9, true))
    expect(await screen.findByTestId('spin-claim')).toHaveTextContent('Claimed')
  })

  /** F13 R23: the same control takes it back. */
  it('unclaims what was claimed by mistake', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ claimedAt: '2026-11-15T11:00:00+00:00' })],
      total: 1,
    })
    setSpinClaimedMock.mockResolvedValue(spin({ claimedAt: null }))

    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    await user.click(screen.getByTestId('spin-claim'))

    await waitFor(() => expect(setSpinClaimedMock).toHaveBeenCalledWith(9, false))
  })

  /**
   * The row is replaced rather than the log reloaded: a counter is no place
   * for the list to jump under somebody's finger between two taps.
   */
  it('does not reload the whole log to claim one row', async () => {
    setSpinClaimedMock.mockResolvedValue(spin({ claimedAt: '2026-11-15T11:00:00+00:00' }))

    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    fetchSpinLogMock.mockClear()
    await user.click(screen.getByTestId('spin-claim'))
    await waitFor(() => expect(setSpinClaimedMock).toHaveBeenCalled())

    expect(fetchSpinLogMock).not.toHaveBeenCalled()
  })

  it('reports a claim that could not be changed', async () => {
    setSpinClaimedMock.mockRejectedValue(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    await user.click(screen.getByTestId('spin-claim'))

    expect(await screen.findByTestId('spins-claim-error')).toBeInTheDocument()
  })
})

/** F09 R19 — two different facts, two different messages */
describe('the empty states', () => {
  it('says nothing has happened yet when the log is empty', async () => {
    fetchSpinLogMock.mockResolvedValue({ spins: [], total: 0 })

    render(<SpinsModule />)

    expect(await screen.findByTestId('spins-empty')).toHaveTextContent('No spins yet.')
  })

  it('says nothing matches when the filter is the reason', async () => {
    fetchSpinLogMock.mockResolvedValue({ spins: [], total: 0 })

    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spins-empty')

    await user.type(screen.getByTestId('spin-filter'), '0000')

    expect(await screen.findByTestId('spins-empty')).toHaveTextContent(
      'No spins from that number.',
    )
  })
})

/** F09 R18 */
describe('the phone filter', () => {
  it('asks the server for the filtered log', async () => {
    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    await user.type(screen.getByTestId('spin-filter'), '5678')

    // Filtered server-side, not in the loaded array: the log is capped, so
    // filtering what happens to be loaded would search the most recent page
    // only.
    await waitFor(() => expect(fetchSpinLogMock).toHaveBeenCalledWith('5678', expect.anything()))
  })

  it('does not ask once per keystroke', async () => {
    const user = userEvent.setup()
    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    fetchSpinLogMock.mockClear()
    await user.type(screen.getByTestId('spin-filter'), '5678')

    await waitFor(() => expect(fetchSpinLogMock).toHaveBeenCalled())

    expect(fetchSpinLogMock.mock.calls.length).toBeLessThan(4)
  })
})

/**
 * F09 R16. The rule a capped list exists to obey: it must never present
 * itself as the whole. The player list was breaking exactly this before F09
 * (see F09 section 12).
 */
describe('when the log is capped', () => {
  it('says how many of how many it is showing', async () => {
    fetchSpinLogMock.mockResolvedValue({
      spins: [spin({ id: 9 }), spin({ id: 8 })],
      total: 1432,
    })

    render(<SpinsModule />)

    const note = await screen.findByTestId('spins-capped')

    expect(note).toHaveTextContent('Showing the most recent 2 of 1432 spins.')
    expect(screen.getByTestId('spins-total')).toHaveTextContent('1432 spins')
  })

  it('says nothing when the log is complete', async () => {
    fetchSpinLogMock.mockResolvedValue({ spins: [spin()], total: 1 })

    render(<SpinsModule />)
    await screen.findByTestId('spin-log')

    expect(screen.queryByTestId('spins-capped')).not.toBeInTheDocument()
  })
})
