import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiValidationError } from '../api/client'
import { fetchRewards } from '../api/rewards'
import { fetchWheel, saveWheel, type WheelConfiguration } from '../api/wheel'
import { GameModule } from './GameModule'

vi.mock('../api/rewards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/rewards')>()),
  fetchRewards: vi.fn(),
}))

vi.mock('../api/wheel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/wheel')>()),
  fetchWheel: vi.fn(),
  saveWheel: vi.fn(),
}))


const REWARDS = [
  { id: 1, name: 'Free sample', type: 'free_product' as const, value: null, createdAt: '2026-11-15T09:00:00+00:00', usedBy: [] },
  { id: 2, name: 'Ten off', type: 'percent_off' as const, value: 10, createdAt: '2026-11-15T09:00:00+00:00', usedBy: [] },
  { id: 3, name: 'Maybe next time', type: 'nothing' as const, value: null, createdAt: '2026-11-15T09:00:00+00:00', usedBy: [] },
]

const REWARD_TYPES = [
  { value: 'free_product' as const, label: 'Free product' },
  { value: 'percent_off' as const, label: 'Percentage off' },
  { value: 'amount_off' as const, label: 'Amount off' },
  { value: 'nothing' as const, label: 'Nothing' },
]

const fetchRewardsMock = vi.mocked(fetchRewards)
const fetchWheelMock = vi.mocked(fetchWheel)
const saveWheelMock = vi.mocked(saveWheel)

function configuration(
  prizes: Array<[name: string, probability: number]> = [
    ['Try again', 60],
    ['Free gift', 40],
  ],
): WheelConfiguration {
  return {
    id: 1,
    updatedAt: '2026-11-14T20:00:00+00:00',
    totalProbability: prizes.reduce((sum, [, p]) => sum + p, 0),
    includesLosingSlice: false,
    prizes: prizes.map(([name, probability], index) => ({
      id: index + 1,
      name,
      probability,
      position: index,
      colour: '#475569', rewardId: 1,
    })),
  }
}

function wheelOf(count: number): WheelConfiguration {
  return configuration(
    Array.from({ length: count }, (_, index) => [
      `Prize ${index}`,
      index === 0 ? 100 - (count - 1) : 1,
    ]),
  )
}

beforeEach(() => {
  fetchRewardsMock.mockReset()
  fetchRewardsMock.mockResolvedValue({ rewards: REWARDS, types: REWARD_TYPES })
  fetchWheelMock.mockReset()
  saveWheelMock.mockReset()
  fetchWheelMock.mockResolvedValue(configuration())
})

async function renderAdmin() {
  const user = userEvent.setup()
  render(<GameModule />)
  await screen.findByRole('heading', { level: 1 })

  return user
}

function nameField(index: number): HTMLInputElement {
  return within(screen.getAllByTestId('prize-row')[index]).getByLabelText(
    /name$/i,
  ) as HTMLInputElement
}

function probabilityField(index: number): HTMLInputElement {
  return within(screen.getAllByTestId('prize-row')[index]).getByLabelText(
    /percentage$/i,
  ) as HTMLInputElement
}

function total(): HTMLElement {
  return screen.getByTestId('probability-total')
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^save$/i })
}

describe('loading', () => {
  it('shows a loading state, then the wheel', async () => {
    fetchWheelMock.mockReturnValue(new Promise(() => {}))
    render(<GameModule />)

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders a row per prize, with its name and percentage', async () => {
    await renderAdmin()

    expect(screen.getAllByTestId('prize-row')).toHaveLength(2)
    expect(nameField(0)).toHaveValue('Try again')
    expect(probabilityField(0)).toHaveValue('60')
    expect(nameField(1)).toHaveValue('Free gift')
    expect(probabilityField(1)).toHaveValue('40')
  })

  /**
   * F04 R27. The scenery is for the player, whatever theme is stored: the
   * admin must never be mistaken for the player view, and an admin checking
   * the odds at a stall does not want snow falling behind the form.
   */
  it('stays undressed whatever theme is configured', async () => {
    await renderAdmin()

    expect(screen.queryByTestId('theme-scene')).not.toBeInTheDocument()
    expect(screen.queryByTestId('player-screen')).not.toBeInTheDocument()
    expect(document.querySelector('[data-theme]')).toBeNull()
  })

  it('shows the running total as valid when it reads 100', async () => {
    await renderAdmin()

    expect(total()).toHaveAttribute('data-valid', 'true')
    expect(total()).toHaveTextContent('100%')
  })

  /**
   * Regression: two loads used to overlap and both apply, so the later one
   * overwrote whatever the admin had typed in between. React's development
   * double-effect reproduces it; a retry over a slow connection would too.
   * The superseded load must now be dropped.
   */
  it('ignores a load that a newer one has superseded', async () => {
    fetchWheelMock
      .mockResolvedValueOnce(configuration([['Stale', 60], ['Also stale', 40]]))
      .mockResolvedValueOnce(configuration([['Fresh', 60], ['Also fresh', 40]]))

    render(
      <StrictMode>
        <GameModule />
      </StrictMode>,
    )

    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(nameField(0)).toHaveValue('Fresh'))

    expect(fetchWheelMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByDisplayValue('Stale')).not.toBeInTheDocument()
  })

  /** F01 section 9, "Load failed" */
  it('offers a retry on failure and shows no editable form', async () => {
    fetchWheelMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    render(<GameModule />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
    expect(screen.queryByTestId('prize-row')).not.toBeInTheDocument()

    fetchWheelMock.mockResolvedValue(configuration())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Wheel prizes')).toBeInTheDocument()
    expect(screen.getAllByTestId('prize-row')).toHaveLength(2)
  })
})

describe('validation while editing', () => {
  /** F01 R17, R9 */
  it('marks the total invalid and names the figure when it is not 100', async () => {
    const user = await renderAdmin()

    await user.clear(probabilityField(0))
    await user.type(probabilityField(0), '57')

    expect(total()).toHaveAttribute('data-valid', 'false')
    expect(total()).toHaveTextContent('97')
    expect(saveButton()).toBeDisabled()
  })

  /** F01 R4 */
  it('shows an error and disables saving when a name is blank', async () => {
    const user = await renderAdmin()

    await user.clear(nameField(0))

    expect(await screen.findByText('A prize needs a name.')).toBeInTheDocument()
    expect(nameField(0)).toHaveAttribute('aria-invalid', 'true')
    expect(saveButton()).toBeDisabled()
  })

  /** F01 R5 */
  it('rejects a decimal probability', async () => {
    const user = await renderAdmin()

    await user.clear(probabilityField(0))
    await user.type(probabilityField(0), '2.5')

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('shows no total at all while a probability is unreadable', async () => {
    const user = await renderAdmin()

    await user.clear(probabilityField(0))

    expect(total()).toHaveTextContent('—')
    expect(total()).toHaveAttribute('data-valid', 'false')
  })

  /** F01 R4 — the input itself stops at the limit */
  it('caps a name at forty characters', async () => {
    await renderAdmin()

    expect(nameField(0)).toHaveAttribute('maxlength', '40')
  })
})

describe('the live preview', () => {
  /** F01 R18 */
  it('shows a renamed prize before anything is saved', async () => {
    const user = await renderAdmin()

    await user.clear(nameField(0))
    await user.type(nameField(0), 'Nearly won')

    expect(await screen.findByText('Nearly won', { selector: 'tspan' })).toBeInTheDocument()
    expect(saveWheelMock).not.toHaveBeenCalled()
  })

  /** F01 R13 */
  it('draws one equal slice per prize', async () => {
    const user = await renderAdmin()

    expect(screen.getAllByTestId('wheel-slice')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /add prize/i }))

    expect(screen.getAllByTestId('wheel-slice')).toHaveLength(3)
  })
})

describe('adding, removing and reordering', () => {
  it('adds an empty row', async () => {
    const user = await renderAdmin()

    await user.click(screen.getByRole('button', { name: /add prize/i }))

    expect(screen.getAllByTestId('prize-row')).toHaveLength(3)
    expect(nameField(2)).toHaveValue('')
  })

  /**
   * Regression: the handlers once read the prize list from the render
   * closure, so two clicks landing before a re-render both applied to the
   * same stale array and one was lost. Found by the end-to-end suite when
   * six clicks produced ten rows instead of twelve.
   */
  it('counts every click when they arrive faster than a re-render', async () => {
    await renderAdmin()

    // fireEvent, not userEvent: userEvent awaits between clicks, which lets
    // React settle and hides exactly the bug this guards against.
    const add = screen.getByRole('button', { name: /add prize/i })

    act(() => {
      fireEvent.click(add)
      fireEvent.click(add)
      fireEvent.click(add)
    })

    expect(screen.getAllByTestId('prize-row')).toHaveLength(5)
  })

  /** F01 R19 */
  it('disables adding at twelve prizes', async () => {
    fetchWheelMock.mockResolvedValue(wheelOf(12))
    await renderAdmin()

    expect(screen.getByRole('button', { name: /add prize/i })).toBeDisabled()
    expect(screen.getByText(/at most 12 prizes/i)).toBeInTheDocument()
  })

  /** F01 R20 */
  it('disables removing at two prizes', async () => {
    await renderAdmin()

    for (const row of screen.getAllByTestId('prize-row')) {
      expect(within(row).getByRole('button', { name: /^remove/i })).toBeDisabled()
    }
  })

  it('removes a row when there are more than two', async () => {
    fetchWheelMock.mockResolvedValue(wheelOf(3))
    const user = await renderAdmin()

    await user.click(
      within(screen.getAllByTestId('prize-row')[1]).getByRole('button', { name: /^remove/i }),
    )

    expect(screen.getAllByTestId('prize-row')).toHaveLength(2)
    expect(nameField(1)).toHaveValue('Prize 2')
  })

  /** F01 R7 */
  it('moves a prize down and recolours the swatches by position', async () => {
    const user = await renderAdmin()

    const firstSwatchColour =
      within(screen.getAllByTestId('prize-row')[0]).getByTestId('prize-swatch').dataset.colour

    await user.click(
      within(screen.getAllByTestId('prize-row')[0]).getByRole('button', { name: /move down/i }),
    )

    expect(nameField(0)).toHaveValue('Free gift')
    expect(nameField(1)).toHaveValue('Try again')
    expect(
      within(screen.getAllByTestId('prize-row')[0]).getByTestId('prize-swatch').dataset.colour,
    ).toBe(firstSwatchColour)
  })

  it('disables moving the first prize up and the last one down', async () => {
    await renderAdmin()

    const rows = screen.getAllByTestId('prize-row')

    expect(within(rows[0]).getByRole('button', { name: /move up/i })).toBeDisabled()
    expect(within(rows[1]).getByRole('button', { name: /move down/i })).toBeDisabled()
  })
})

describe('saving', () => {
  it('is disabled until something changes', async () => {
    const user = await renderAdmin()

    expect(saveButton()).toBeDisabled()

    await user.type(nameField(0), '!')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the trimmed names and numeric probabilities', async () => {
    saveWheelMock.mockResolvedValue(configuration([['Changed', 60], ['Free gift', 40]]))
    const user = await renderAdmin()

    await user.clear(nameField(0))
    await user.type(nameField(0), '  Changed  ')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveWheelMock).toHaveBeenCalledWith(
        [
          // F13 R7: every slice says what it gives away.
          { id: 1, name: 'Changed', probability: 60, rewardId: 1 },
          { id: 2, name: 'Free gift', probability: 40, rewardId: 1 },
        ],
        // F13 R11: the toggle travels with the prizes, in one save.
        false,
      ),
    )
  })

  it('confirms a successful save and goes back to clean', async () => {
    saveWheelMock.mockResolvedValue(configuration([['Changed', 60], ['Free gift', 40]]))
    const user = await renderAdmin()

    await user.clear(nameField(0))
    await user.type(nameField(0), 'Changed')
    await user.click(saveButton())

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  /** F01 section 9, "Save failed" */
  it('keeps the admin edits when the server rejects the save', async () => {
    saveWheelMock.mockRejectedValue(
      new ApiValidationError('The wheel configuration is invalid.', [
        { field: 'prizes', message: 'The probabilities must total 100. They currently total 97.' },
      ]),
    )
    const user = await renderAdmin()

    await user.clear(nameField(0))
    await user.type(nameField(0), 'Still here')
    await user.click(saveButton())

    expect(await screen.findByText(/currently total 97/i)).toBeInTheDocument()
    expect(nameField(0)).toHaveValue('Still here')
  })

  /** F01 R12 — a field-level violation lands on that field */
  it('puts a server violation against the prize it names', async () => {
    saveWheelMock.mockRejectedValue(
      new ApiValidationError('Invalid', [
        { field: 'prizes[1].name', message: 'A prize needs a name.' },
      ]),
    )
    const user = await renderAdmin()

    await user.type(nameField(0), '!')
    await user.click(saveButton())

    await waitFor(() => expect(nameField(1)).toHaveAttribute('aria-invalid', 'true'))
    expect(
      within(screen.getAllByTestId('prize-row')[1]).getByText('A prize needs a name.'),
    ).toBeInTheDocument()
  })

  it('keeps the edits and explains when the server is unreachable', async () => {
    saveWheelMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderAdmin()

    await user.clear(nameField(0))
    await user.type(nameField(0), 'Still here')
    await user.click(saveButton())

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
    expect(nameField(0)).toHaveValue('Still here')
    expect(saveButton()).toBeEnabled()
  })
})
