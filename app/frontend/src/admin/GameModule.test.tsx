import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError, ApiValidationError } from '../api/client'
import { fetchGame, fetchGames } from '../api/games'
import { fetchRewards } from '../api/rewards'
import { fetchWheel, saveWheel, type WheelConfiguration } from '../games/wheel/api'
import { GameModule } from './GameModule'

vi.mock('../api/rewards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/rewards')>()),
  fetchRewards: vi.fn(),
}))

vi.mock('../games/wheel/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../games/wheel/api')>()),
  fetchWheel: vi.fn(),
  saveWheel: vi.fn(),
}))

vi.mock('../api/games', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/games')>()),
  fetchGame: vi.fn(),
  fetchGames: vi.fn(),
}))

/** F27 R38: the game this editor is for, as the server reports it. */
const GAME = {
  id: 1,
  name: 'Test campaign',
  type: 'wheel',
  ownTagline: null,
  defaultTagline: 'One spin, one prize. Good luck.',
  dailyLimit: null,
  linkKey: 'q7mfd2xkbnrt',
  // F30 R1, R9: a game starts plain.
  theme: 'plain',
  playPath: '/play/q7mfd2xkbnrt',
  isLive: true,
  plays: 0,
  notReady: null,
}


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
const fetchGameMock = vi.mocked(fetchGame)
const fetchGamesMock = vi.mocked(fetchGames)
const saveWheelMock = vi.mocked(saveWheel)

/**
 * F26 R1, R12: a slice is its reward and its odds, nothing else. These
 * fixtures therefore name a reward id where they used to name a label, and
 * reward 1 reads "Free sample" while reward 2 reads "Ten off".
 */
function configuration(
  prizes: Array<[rewardId: number, probability: number]> = [
    [1, 60],
    [2, 40],
  ],
): WheelConfiguration {
  return {
    id: 1,
    updatedAt: '2026-11-14T20:00:00+00:00',
    totalProbability: prizes.reduce((sum, [, p]) => sum + p, 0),
    includesLosingSlice: false,
    prizes: prizes.map(([rewardId, probability], index) => ({
      id: index + 1,
      probability,
      position: index,
      colour: '#475569',
      rewardId,
    })),
  }
}

function wheelOf(count: number): WheelConfiguration {
  return configuration(
    Array.from({ length: count }, (_, index) => [
      // Alternating, so adjacent rows are told apart by what they give.
      index % 2 === 0 ? 1 : 2,
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
  fetchGameMock.mockReset()
  fetchGamesMock.mockReset()
  fetchGameMock.mockResolvedValue(GAME)
  fetchGamesMock.mockResolvedValue({
    games: [GAME],
    types: [{ value: 'wheel', label: 'Prize wheel' }],
    themes: [
      { value: 'plain', label: 'Plain' },
      { value: 'christmas', label: 'Christmas' },
    ],
    maxDailyLimit: 99,
  })
})

/**
 * F27 R38. The editor takes its game from the URL, so every render needs a
 * route to take it from.
 */
function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/admin/games/1']}>
      <Routes>
        <Route path="/admin/games/:id" element={<GameModule />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function renderAdmin() {
  const user = userEvent.setup()
  renderEditor()
  await screen.findByRole('heading', { level: 1 })

  return user
}

/** F26 R14, R15: the reward selector is a row's identity and its first field. */
function rewardField(index: number): HTMLSelectElement {
  return within(screen.getAllByTestId('prize-row')[index]).getByTestId(
    'prize-reward',
  ) as HTMLSelectElement
}

/** What the row says it gives, which since F26 R1 is what it is called. */
function labelOf(index: number): string {
  const select = rewardField(index)

  return select.selectedOptions[0]?.textContent ?? ''
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
  return screen.getByTestId('save-wheel')
}

describe('loading', () => {
  it('shows a loading state, then the wheel', async () => {
    fetchWheelMock.mockReturnValue(new Promise(() => {}))
    renderEditor()

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders a row per prize, with its reward and percentage', async () => {
    await renderAdmin()

    expect(screen.getAllByTestId('prize-row')).toHaveLength(2)
    expect(labelOf(0)).toBe('Free sample')
    expect(probabilityField(0)).toHaveValue('60')
    expect(labelOf(1)).toBe('Ten off')
    expect(probabilityField(1)).toHaveValue('40')
  })

  /** F26 R14: there is no label to type any more. */
  it('renders no name input on a row', async () => {
    await renderAdmin()

    // Scoped to a row since F27: the game itself has a name field now, and
    // what F26 took away was the one on each slice.
    expect(
      within(screen.getAllByTestId('prize-row')[0]).queryByLabelText(/name$/i),
    ).not.toBeInTheDocument()
  })

  /**
   * F26 R19, R20: one column, the list first and the preview after it.
   *
   * Asserted on document order rather than on classes, because what the
   * rule is about is what an admin meets as they scroll — edit the rows,
   * then see the wheel — and that survives the styling being rewritten.
   */
  it('puts the prize list before the preview', async () => {
    await renderAdmin()

    const list = screen.getByRole('region', { name: 'Prize list' })
    const preview = screen.getByRole('region', { name: 'Wheel preview' })

    expect(list.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.contains(preview)).toBe(false)
  })

  /** F26 R15: the reward comes before the percentage. */
  it('puts the reward before the percentage', async () => {
    await renderAdmin()

    const row = screen.getAllByTestId('prize-row')[0]
    const controls = Array.from(row.querySelectorAll('select, input'))

    expect(controls[0]).toHaveAttribute('data-testid', 'prize-reward')
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
      .mockResolvedValueOnce(configuration([[1, 60], [1, 40]]))
      .mockResolvedValueOnce(configuration([[2, 60], [2, 40]]))

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/admin/games/1']}>
          <Routes>
            <Route path="/admin/games/:id" element={<GameModule />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )

    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(labelOf(0)).toBe('Ten off'))

    expect(fetchWheelMock).toHaveBeenCalledTimes(2)
    expect(labelOf(1)).toBe('Ten off')
  })

  /** F01 section 9, "Load failed" */
  it('offers a retry on failure and shows no editable form', async () => {
    fetchWheelMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    renderEditor()

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

  /**
   * F13 R7 in place of F01 R4's blank name, which F26 R10 removed: the one
   * thing a slice can now be missing is the reward it gives.
   */
  it('shows an error and disables saving when a slice gives nothing', async () => {
    const user = await renderAdmin()

    await user.selectOptions(rewardField(0), '')

    expect(await screen.findByText(/choose what this slice gives away/i)).toBeInTheDocument()
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

  // F01 R4's forty-character cap went with the field (F26 R10, R25). What a
  // name may be is the catalogue's rule now, and the server's.
})

describe('the live preview', () => {
  /** F01 R18 with F26 R1: the label follows the reward, live. */
  it('redraws a slice when its reward changes, before anything is saved', async () => {
    const user = await renderAdmin()

    expect(await screen.findByText('Free sample', { selector: 'tspan' })).toBeInTheDocument()

    await user.selectOptions(rewardField(0), '2')

    // Both slices give reward 2 now, so both read it — which is F26 R4: two
    // slices on one reward are alike on purpose.
    expect(await screen.findAllByText('Ten off', { selector: 'tspan' })).toHaveLength(2)
    expect(screen.queryByText('Free sample', { selector: 'tspan' })).not.toBeInTheDocument()
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
    expect(rewardField(2)).toHaveValue('')
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
    // The third row survives: wheelOf alternates, so it gives reward 1.
    expect(rewardField(1)).toHaveValue('1')
  })

  /** F01 R7 */
  it('moves a prize down and recolours the swatches by position', async () => {
    const user = await renderAdmin()

    const firstSwatchColour =
      within(screen.getAllByTestId('prize-row')[0]).getByTestId('prize-swatch').dataset.colour

    await user.click(
      within(screen.getAllByTestId('prize-row')[0]).getByRole('button', { name: /move down/i }),
    )

    expect(labelOf(0)).toBe('Ten off')
    expect(labelOf(1)).toBe('Free sample')
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

    // F26: changing the reward is the content change a slice now has.
    await user.selectOptions(rewardField(0), '2')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the rewards and numeric probabilities, and no label', async () => {
    saveWheelMock.mockResolvedValue(configuration([[2, 60], [2, 40]]))
    const user = await renderAdmin()

    await user.selectOptions(rewardField(0), '2')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveWheelMock).toHaveBeenCalledWith(
        // F27 R40: one wheel per game, so the save says which game's.
        1,
        [
          // F13 R7: every slice says what it gives away. F26 R12: and that
          // is the whole of it — no name goes up.
          { id: 1, probability: 60, rewardId: 2 },
          { id: 2, probability: 40, rewardId: 2 },
        ],
        // F13 R11: the toggle travels with the prizes, in one save.
        false,
      ),
    )
  })

  it('confirms a successful save and goes back to clean', async () => {
    saveWheelMock.mockResolvedValue(configuration([[2, 60], [2, 40]]))
    const user = await renderAdmin()

    await user.selectOptions(rewardField(0), '2')
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

    await user.selectOptions(rewardField(0), '2')
    await user.click(saveButton())

    expect(await screen.findByText(/currently total 97/i)).toBeInTheDocument()
    expect(rewardField(0)).toHaveValue('2')
  })

  /**
   * F01 R12 — a field-level violation lands on that field. With the name
   * gone (F26 R14) a violation that names no field of its own goes to the
   * reward selector, the only thing left on the row to point at.
   */
  it('puts a server violation against the prize it names', async () => {
    saveWheelMock.mockRejectedValue(
      new ApiValidationError('Invalid', [
        { field: 'prizes[1].id', message: 'That slice no longer exists.' },
      ]),
    )
    const user = await renderAdmin()

    await user.selectOptions(rewardField(0), '2')
    await user.click(saveButton())

    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('prize-row')[1]).getByText('That slice no longer exists.'),
      ).toBeInTheDocument(),
    )
  })

  it('keeps the edits and explains when the server is unreachable', async () => {
    saveWheelMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderAdmin()

    await user.selectOptions(rewardField(0), '2')
    await user.click(saveButton())

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
    expect(rewardField(0)).toHaveValue('2')
    expect(saveButton()).toBeEnabled()
  })
})

/** F14 R1, R2, R3, R6, R7, R9 */
describe('the losing slice in the prize list', () => {
  /**
   * A wheel whose second slice points at the catalogue's `nothing` reward.
   *
   * Three slices rather than two, because a wheel at MIN_PRIZES refuses to
   * give up a row and the removal test would prove nothing.
   */
  function withALosingSlice(): WheelConfiguration {
    const wheel = configuration([
      [3, 50],
      [1, 30],
      [2, 20],
    ])

    wheel.includesLosingSlice = true

    return wheel
  }

  function rows(): HTMLElement[] {
    return screen.getAllByTestId('prize-row')
  }

  it('marks the losing row and leaves the others alone', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    await renderAdmin()

    expect(rows()[0]).toHaveAttribute('data-losing', 'true')
    expect(rows()[1]).not.toHaveAttribute('data-losing')

    expect(screen.getAllByTestId('prize-losing-mark')).toHaveLength(1)
    expect(within(rows()[0]).getByTestId('prize-losing-mark')).toHaveTextContent(/losing item/i)
  })

  /**
   * R2. The reward is settled by the toggle above, so a dropdown here could
   * only ever be used to contradict it.
   */
  it('offers no reward to choose on the losing row', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    await renderAdmin()

    expect(within(rows()[0]).queryByTestId('prize-reward')).not.toBeInTheDocument()
    expect(within(rows()[1]).getByTestId('prize-reward')).toBeInTheDocument()
  })

  /** R3: a sentence, not a blank — a missing control reads as a bug. */
  it('says that the losing row gives nothing away', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    await renderAdmin()

    expect(within(rows()[0]).getByTestId('prize-gives-nothing')).toHaveTextContent(
      /this is the losing item/i,
    )
  })

  /**
   * F14 R4 as F26 R16 amends it: the odds are still the admin's to set, and
   * where the label used to be editable the row now shows the losing
   * reward's name as text — so the admin can read what the player will read
   * without being able to make the two differ.
   */
  it('keeps the percentage and shows the losing reward it reads', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    await renderAdmin()

    expect(probabilityField(0)).toHaveValue('50')
    expect(within(rows()[0]).getByTestId('prize-label')).toHaveTextContent('Maybe next time')
    expect(within(rows()[0]).queryByLabelText(/name$/i)).not.toBeInTheDocument()
  })

  /**
   * R6. The toggle and the list are two views of one fact, so removing the
   * row has to take the toggle with it — otherwise the toggle goes on
   * claiming a slice that is not there, and the next save puts it back.
   */
  it('turns the toggle off when the losing row is removed', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    const user = await renderAdmin()

    expect(screen.getByTestId('losing-toggle')).toBeChecked()

    await user.click(within(rows()[0]).getByRole('button', { name: /remove/i }))

    expect(screen.getAllByTestId('prize-row')).toHaveLength(2)
    expect(screen.getByTestId('losing-toggle')).not.toBeChecked()
    expect(screen.queryByTestId('prize-losing-mark')).not.toBeInTheDocument()
  })

  /** F14 R5: the toggle puts it at the top, not at the bottom. */
  it('adds the losing slice as the first row', async () => {
    const user = await renderAdmin()

    await user.click(screen.getByTestId('losing-toggle'))

    expect(rows()).toHaveLength(3)
    expect(rows()[0]).toHaveAttribute('data-losing', 'true')
  })

  /**
   * F14 R5, R5b. A wheel saved with its losing slice elsewhere opens in the
   * right order — and must not open looking unsaved over a reordering the
   * admin did not ask for.
   */
  it('moves a loaded losing slice to the front without making the page dirty', async () => {
    const wheel = configuration([
      [1, 50],
      [2, 20],
      [3, 30],
    ])

    wheel.includesLosingSlice = true
    fetchWheelMock.mockResolvedValue(wheel)

    await renderAdmin()

    expect(rows()[0]).toHaveAttribute('data-losing', 'true')
    expect(within(rows()[0]).getByTestId('prize-label')).toHaveTextContent('Maybe next time')
    expect(labelOf(1)).toBe('Free sample')
    expect(saveButton()).toBeDisabled()
  })

  /** F14 R5: the third way a slice becomes the losing one. */
  it('moves a slice to the front when it is pointed at the losing reward', async () => {
    const user = await renderAdmin()

    await user.selectOptions(
      within(rows()[1]).getByTestId('prize-reward'),
      '3',
    )

    expect(rows()[0]).toHaveAttribute('data-losing', 'true')
    expect(labelOf(1)).toBe('Free sample')
  })

  /** F14 R5a */
  it('offers no arrow that would unpin the losing slice', async () => {
    fetchWheelMock.mockResolvedValue(withALosingSlice())
    await renderAdmin()

    expect(within(rows()[0]).getByRole('button', { name: /move down/i })).toBeDisabled()
    expect(within(rows()[1]).getByRole('button', { name: /move up/i })).toBeDisabled()

    // The rows below it still move among themselves.
    expect(within(rows()[1]).getByRole('button', { name: /move down/i })).toBeEnabled()
    expect(within(rows()[2]).getByRole('button', { name: /move up/i })).toBeEnabled()
  })

  /** R9: nothing changes for a wheel that has no losing slice. */
  it('marks nothing on a wheel without one', async () => {
    await renderAdmin()

    expect(screen.queryByTestId('prize-losing-mark')).not.toBeInTheDocument()
    expect(screen.queryByTestId('prize-gives-nothing')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('prize-reward')).toHaveLength(2)
  })

  /**
   * R7: every field is labelled, which is what makes them line up. Two of
   * them since F26 R14, where there were three.
   */
  it('gives every field on a row a visible label', async () => {
    await renderAdmin()

    const row = within(rows()[0])

    expect(row.getByText('Gives away')).toBeInTheDocument()
    expect(row.getByText('Percentage')).toBeInTheDocument()
    expect(row.queryByText('Prize name')).not.toBeInTheDocument()
  })
})
