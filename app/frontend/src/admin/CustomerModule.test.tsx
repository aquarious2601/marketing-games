import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCustomer,
  setSpinClaimed,
  type AdminPlayer,
  type CustomerWin,
  type LoggedSpin,
} from '../api/players'
import { CustomerModule } from './CustomerModule'

vi.mock('../api/players', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/players')>()),
  fetchCustomer: vi.fn(),
  setSpinClaimed: vi.fn(),
}))

const fetchCustomerMock = vi.mocked(fetchCustomer)
const setClaimedMock = vi.mocked(setSpinClaimed)

const ANH: AdminPlayer = {
  id: 1,
  phone: '0912345678',
  firstName: 'Anh',
  lastName: 'Le',
  birthday: '1994-03-12',
  createdAt: '2026-11-15T09:30:00+00:00',
  spinCount: 12,
}

function win(over: Partial<CustomerWin> = {}): CustomerWin {
  return {
    id: 7,
    prizeName: 'Free coffee',
    spunAt: '2026-11-18T10:00:00+00:00',
    rewardType: 'free_product',
    rewardValue: null,
    code: 'A7K3-M9PX',
    claimedAt: null,
    claimedBy: null,
    game: 'Spin to win',
    sheetId: null,
    ...over,
  }
}

/** What the claim endpoint answers with, of which the page reads two fields. */
function claimed(over: Partial<LoggedSpin> = {}): LoggedSpin {
  return {
    id: 7,
    prizeName: 'Free coffee',
    spunAt: '2026-11-18T10:00:00+00:00',
    rewardType: 'free_product',
    rewardValue: null,
    code: 'A7K3-M9PX',
    claimable: true,
    claimedAt: '2026-11-19T08:00:00+00:00',
    claimedBy: 'rosa',
    game: 'Spin to win',
    player: null,
    ...over,
  }
}

beforeEach(() => {
  fetchCustomerMock.mockReset()
  setClaimedMock.mockReset()
  fetchCustomerMock.mockResolvedValue({ player: ANH, wins: [win()], played: 12, won: 1 })
})

function renderCustomer(at = '/admin/players/1') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/admin/players/:id" element={<CustomerModule />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** F31 R10, R13 */
describe('who the customer is', () => {
  it('names them in the heading, with their number', async () => {
    renderCustomer()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Anh Le')
    expect(screen.getByTestId('customer-phone')).toHaveTextContent('0912345678')
  })

  /**
   * R13. The spins that won nothing are not listed anywhere, so the page
   * has to say how many there were — a number that does not match its list
   * is what makes a page look like it is hiding something.
   */
  it('says how many times they played and how many of those won', async () => {
    renderCustomer()

    expect(await screen.findByTestId('customer-plays')).toHaveTextContent('Played 12, won 1')
    expect(screen.getAllByTestId('win-card')).toHaveLength(1)
  })

  it('offers a way back to the list, keeping the search', async () => {
    renderCustomer('/admin/players/1?search=A7K3')

    expect(await screen.findByTestId('back-to-customers')).toHaveAttribute(
      'href',
      '/admin/players?search=A7K3',
    )
  })

  it('links back to the plain list when there was no search', async () => {
    renderCustomer()

    expect(await screen.findByTestId('back-to-customers')).toHaveAttribute(
      'href',
      '/admin/players',
    )
  })
})

/** F31 R11, R12 */
describe('what they are owed', () => {
  it('puts what is still to collect before what has been collected', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [
        win({ id: 7, prizeName: 'Free coffee' }),
        win({ id: 8, prizeName: 'Free cake', claimedAt: '2026-11-18T12:00:00+00:00', claimedBy: 'rosa' }),
      ],
      played: 12,
      won: 2,
    })

    renderCustomer()

    await screen.findByTestId('to-collect-section')

    const toCollect = screen.getByTestId('to-collect-section')
    const collected = screen.getByTestId('collected-section')

    expect(toCollect.querySelectorAll('[data-testid="win-card"]')).toHaveLength(1)
    expect(collected.querySelectorAll('[data-testid="win-card"]')).toHaveLength(1)
    expect(toCollect).toHaveTextContent('Free coffee')
    expect(collected).toHaveTextContent('Free cake')

    // The order on the page, not just the grouping: what is owed is the
    // question somebody is standing at the counter asking.
    expect(toCollect.compareDocumentPosition(collected)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows the code, the game and when it was won', async () => {
    renderCustomer()

    await screen.findByTestId('win-card')

    expect(screen.getByTestId('win-code')).toHaveTextContent('A7K3-M9PX')
    expect(screen.getByTestId('win-game')).toHaveTextContent('Spin to win')
    expect(screen.getByTestId('win-spun')).not.toHaveTextContent('')
  })

  /** R17. The code is how a win is found, not what makes it real. */
  it('lists a win that has no code at all', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [win({ code: null })],
      played: 1,
      won: 1,
    })

    renderCustomer()

    await screen.findByTestId('win-card')

    expect(screen.queryByTestId('win-code')).not.toBeInTheDocument()
    expect(screen.getByTestId('win-hand-over')).toBeInTheDocument()
  })

  it('says so when there is nothing to collect', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [win({ claimedAt: '2026-11-18T12:00:00+00:00', claimedBy: 'rosa' })],
      played: 4,
      won: 1,
    })

    renderCustomer()

    expect(await screen.findByTestId('to-collect-empty')).toBeInTheDocument()
  })

  it('says so when nothing has been collected', async () => {
    renderCustomer()

    expect(await screen.findByTestId('collected-empty')).toBeInTheDocument()
  })

  /** R14. One play produced them, so they are read as one thing. */
  it('groups the wins from one gift sheet', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [
        win({ id: 10, prizeName: 'Free coffee', sheetId: 'sheet-a' }),
        win({ id: 11, prizeName: 'Free cake', sheetId: 'sheet-a' }),
        win({ id: 12, prizeName: 'Ten off', sheetId: null }),
      ],
      played: 3,
      won: 3,
    })

    renderCustomer()

    await screen.findByTestId('sheet-group')

    const sheet = screen.getByTestId('sheet-group')

    expect(sheet.querySelectorAll('[data-testid="win-card"]')).toHaveLength(2)
    expect(screen.getByTestId('sheet-label')).toHaveTextContent('One gift sheet, 2 rewards')

    // Each is still handed over on its own: they leave the counter one at a
    // time, whatever issued them.
    expect(screen.getAllByTestId('win-hand-over')).toHaveLength(3)
  })

  it('keeps two sheets apart', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [
        win({ id: 10, sheetId: 'sheet-b' }),
        win({ id: 11, sheetId: 'sheet-a' }),
      ],
      played: 2,
      won: 2,
    })

    renderCustomer()

    await waitFor(() => expect(screen.getAllByTestId('sheet-group')).toHaveLength(2))
  })
})

/** F31 R15, R16, R18, R19 */
describe('handing a reward over', () => {
  it('moves the card to collected, and names who did it', async () => {
    const user = userEvent.setup()
    setClaimedMock.mockResolvedValue(claimed())

    renderCustomer()

    await user.click(await screen.findByTestId('win-hand-over'))

    expect(setClaimedMock).toHaveBeenCalledWith(7, true)

    const collected = await screen.findByTestId('collected-section')

    expect(collected.querySelectorAll('[data-testid="win-card"]')).toHaveLength(1)
    expect(screen.getByTestId('win-collected-by')).toHaveTextContent('rosa')

    // In place: the customer is not fetched again, so nothing on screen
    // jumps and the list behind this page keeps its search.
    expect(fetchCustomerMock).toHaveBeenCalledTimes(1)
  })

  /** R22. A claim nobody signed shows a dash, never a guess. */
  it('shows a dash for a claim with no author', async () => {
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [win({ claimedAt: '2026-11-18T12:00:00+00:00', claimedBy: null })],
      played: 1,
      won: 1,
    })

    renderCustomer()

    expect(await screen.findByTestId('win-collected-by')).toHaveTextContent('—')
  })

  /** R15, F13 R23: a mis-press at a counter must not be permanent. */
  it('takes a claim back', async () => {
    const user = userEvent.setup()
    fetchCustomerMock.mockResolvedValue({
      player: ANH,
      wins: [win({ claimedAt: '2026-11-18T12:00:00+00:00', claimedBy: 'rosa' })],
      played: 1,
      won: 1,
    })
    setClaimedMock.mockResolvedValue(claimed({ claimedAt: null, claimedBy: null }))

    renderCustomer()

    await user.click(await screen.findByTestId('win-undo'))

    expect(setClaimedMock).toHaveBeenCalledWith(7, false)
    expect(await screen.findByTestId('win-hand-over')).toBeInTheDocument()
  })

  it('says so when the hand-over could not be recorded', async () => {
    const user = userEvent.setup()
    setClaimedMock.mockRejectedValue(new Error('offline'))

    renderCustomer()

    await user.click(await screen.findByTestId('win-hand-over'))

    expect(await screen.findByTestId('win-failed')).toBeInTheDocument()
    // And the card stays where it was: nothing was handed over.
    expect(screen.getByTestId('win-card')).toHaveAttribute('data-collected', 'false')
  })
})

describe('when the customer cannot be loaded', () => {
  it('offers a retry', async () => {
    const user = userEvent.setup()
    fetchCustomerMock.mockRejectedValueOnce(new Error('offline'))
    fetchCustomerMock.mockResolvedValue({ player: ANH, wins: [win()], played: 12, won: 1 })

    renderCustomer()

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('win-card')).toBeInTheDocument()
  })
})
