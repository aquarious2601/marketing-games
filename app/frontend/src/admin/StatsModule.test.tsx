import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStats, type Stats, type StatsDay } from '../api/stats'
import { StatsModule } from './StatsModule'

vi.mock('../api/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/stats')>()),
  fetchStats: vi.fn(),
}))

const fetchStatsMock = vi.mocked(fetchStats)

function day(over: Partial<StatsDay> = {}): StatsDay {
  return {
    day: '2026-11-19',
    customers: 0,
    newCustomers: 0,
    returningCustomers: 0,
    plays: 0,
    wins: 0,
    wonNothing: 0,
    issuedCost: 0,
    unpricedIssued: 0,
    collected: 0,
    collectedCost: 0,
    unpricedCollected: 0,
    outstanding: 0,
    collectionRate: null,
    ...over,
  }
}

function stats(over: Partial<Stats> = {}): Stats {
  return {
    from: '2026-11-13',
    to: '2026-11-19',
    totals: { ...day(), medianDelaySeconds: null },
    days: [day()],
    currency: 'VND',
    currencySymbol: '₫',
    averageBasket: 200_000,
    games: [{ id: 1, name: 'Spin to win' }],
    ...over,
  }
}

beforeEach(() => {
  fetchStatsMock.mockReset()
  fetchStatsMock.mockResolvedValue(stats())
})

/** F32 R12-R14, R23 */
describe('what it brings', () => {
  it('opens on the last seven days', async () => {
    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.getByTestId('stats-range')).toHaveValue('7')
    expect(fetchStatsMock).toHaveBeenCalledWith(7, null, expect.anything())
  })

  it('shows the customers, the plays and the wins', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({
        totals: {
          ...day({ customers: 9, newCustomers: 4, returningCustomers: 5, plays: 14, wins: 6, wonNothing: 8 }),
          medianDelaySeconds: null,
        },
      }),
    )

    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.getByTestId('stat-customers')).toHaveTextContent('9')
    expect(screen.getByTestId('stat-new')).toHaveTextContent('4 / 5')
    expect(screen.getByTestId('stat-plays')).toHaveTextContent('14')
    // R14: the losses are stated, not left to subtraction.
    expect(screen.getByTestId('stat-wins')).toHaveTextContent('6 (8 won nothing)')
  })

  it('asks the server for a longer stretch', async () => {
    const user = userEvent.setup()

    render(<StatsModule />)
    await screen.findByTestId('stats-summary')

    await user.selectOptions(screen.getByTestId('stats-range'), '30')

    await waitFor(() => expect(fetchStatsMock).toHaveBeenLastCalledWith(30, null, expect.anything()))
  })
})

/** F32 R15, R16, R17, R20, R21, R26 */
describe('what it costs', () => {
  it('shows what was spent in the store’s currency', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({
        totals: {
          ...day({ wins: 4, collected: 2, collectedCost: 50_000, issuedCost: 100_000, outstanding: 2 }),
          medianDelaySeconds: null,
        },
      }),
    )

    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.getByTestId('stat-spent')).toHaveTextContent('₫50,000')
    // R15: and what is still owed, which is never added to the above.
    expect(screen.getByTestId('stat-owed')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-owed')).toHaveTextContent('₫50,000')
  })

  /** R16. The rate, and the sentence that stops it being read as final. */
  it('shows the collection rate as of now', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({ totals: { ...day({ wins: 3, collected: 1, collectionRate: 0.3333 }), medianDelaySeconds: null } }),
    )

    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.getByTestId('stat-rate')).toHaveTextContent('33%')
    expect(screen.getByText(/as of now/i)).toBeInTheDocument()
  })

  /** R21. Nothing to divide by reads as nothing, never as 0%. */
  it('shows a dash for a rate with nothing behind it', async () => {
    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.getByTestId('stat-rate')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-rate')).not.toHaveTextContent('0%')
  })

  /** R17. Read as "about this long", which is all a median claims. */
  it('shows the typical wait before a collection', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({ totals: { ...day(), medianDelaySeconds: 7_200 } }),
    )

    render(<StatsModule />)

    expect(await screen.findByTestId('stat-delay')).toHaveTextContent('about 2 h')
  })

  it('shows a long wait in days', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({ totals: { ...day(), medianDelaySeconds: 60 * 60 * 72 } }),
    )

    render(<StatsModule />)

    expect(await screen.findByTestId('stat-delay')).toHaveTextContent('about 3 days')
  })

  /** R20. A total that silently omits rows is worse than no total. */
  it('says how many wins it could not price', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({ totals: { ...day({ unpricedIssued: 3 }), medianDelaySeconds: null } }),
    )

    render(<StatsModule />)

    expect(await screen.findByTestId('stats-unpriced')).toHaveTextContent(
      '3 of these could not be priced.',
    )
  })

  it('points at the average basket when there is none', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({
        averageBasket: null,
        totals: { ...day({ unpricedIssued: 1 }), medianDelaySeconds: null },
      }),
    )

    render(<StatsModule />)

    expect(await screen.findByTestId('stats-unpriced')).toHaveTextContent(/average basket/i)
  })

  it('says nothing about pricing when everything is priced', async () => {
    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.queryByTestId('stats-unpriced')).not.toBeInTheDocument()
  })
})

/** F32 R19, R24, R25 */
describe('day by day', () => {
  it('lists a row for each day, newest first', async () => {
    fetchStatsMock.mockResolvedValue(
      stats({
        days: [
          day({ day: '2026-11-19', plays: 4 }),
          day({ day: '2026-11-18', plays: 0 }),
        ],
      }),
    )

    render(<StatsModule />)

    await screen.findByTestId('stats-days')

    const rows = screen.getAllByTestId('stats-day-row')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-day', '2026-11-19')
    expect(rows[1]).toHaveAttribute('data-day', '2026-11-18')
  })

  /** R25. A gap in a table of days reads as a fault. */
  it('shows a quiet day as a row of zeros', async () => {
    fetchStatsMock.mockResolvedValue(stats({ days: [day({ day: '2026-11-18' })] }))

    render(<StatsModule />)

    await screen.findByTestId('stats-days')

    expect(screen.getByTestId('stats-day-plays')).toHaveTextContent('0')
    expect(screen.getByTestId('stats-day-rate')).toHaveTextContent('—')
  })

  /** R19. One game, or all of them. */
  it('asks the server for one game', async () => {
    const user = userEvent.setup()

    fetchStatsMock.mockResolvedValue(
      stats({
        games: [
          { id: 1, name: 'Spin to win' },
          { id: 2, name: 'Gift sheet' },
        ],
      }),
    )

    render(<StatsModule />)
    await screen.findByTestId('stats-game')

    await user.selectOptions(screen.getByTestId('stats-game'), '2')

    await waitFor(() => expect(fetchStatsMock).toHaveBeenLastCalledWith(7, 2, expect.anything()))
  })

  it('offers no game selector while there is one game', async () => {
    render(<StatsModule />)

    await screen.findByTestId('stats-summary')

    expect(screen.queryByTestId('stats-game')).not.toBeInTheDocument()
  })
})

describe('when the numbers cannot be worked out', () => {
  it('offers a retry', async () => {
    const user = userEvent.setup()
    fetchStatsMock.mockRejectedValueOnce(new Error('offline'))
    fetchStatsMock.mockResolvedValue(stats())

    render(<StatsModule />)

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('stats-summary')).toBeInTheDocument()
  })
})
