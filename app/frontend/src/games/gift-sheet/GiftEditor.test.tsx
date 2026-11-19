import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiValidationError } from '../../api/client'
import { fetchRewards } from '../../api/rewards'
import { I18nProvider } from '../../i18n/I18nContext'
import { fetchSheetGifts, saveSheetGifts, type AdminSheet } from './api'
import { GiftEditor } from './GiftEditor'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchSheetGifts: vi.fn(),
  saveSheetGifts: vi.fn(),
}))

vi.mock('../../api/rewards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/rewards')>()),
  fetchRewards: vi.fn(),
}))

const fetchGiftsMock = vi.mocked(fetchSheetGifts)
const saveGiftsMock = vi.mocked(saveSheetGifts)
const fetchRewardsMock = vi.mocked(fetchRewards)

const REWARDS = [
  { id: 1, name: 'Free coffee', type: 'free_product' as const, value: null, cost: null, createdAt: '2026-11-19T09:00:00+00:00', usedBy: [] },
  { id: 2, name: 'Ten off', type: 'percent_off' as const, value: 10, cost: null, createdAt: '2026-11-19T09:00:00+00:00', usedBy: [] },
  { id: 3, name: 'Tote bag', type: 'free_product' as const, value: null, cost: null, createdAt: '2026-11-19T09:00:00+00:00', usedBy: [] },
  // F28 R5: never offered, because a sheet gives everything on it.
  { id: 4, name: 'Maybe next time', type: 'nothing' as const, value: null, cost: null, createdAt: '2026-11-19T09:00:00+00:00', usedBy: [] },
]

function onSheet(...rewardIds: number[]): AdminSheet {
  return {
    gifts: rewardIds.map((rewardId, position) => ({
      id: position + 1,
      rewardId,
      name: REWARDS.find((reward) => reward.id === rewardId)?.name ?? '',
      position,
    })),
    maxGifts: 6,
  }
}

beforeEach(() => {
  fetchGiftsMock.mockReset()
  saveGiftsMock.mockReset()
  fetchRewardsMock.mockReset()

  fetchGiftsMock.mockResolvedValue(onSheet(1, 2))
  fetchRewardsMock.mockResolvedValue({ rewards: REWARDS, types: [] })
  saveGiftsMock.mockResolvedValue(onSheet(1, 2))
})

async function renderEditor() {
  const user = userEvent.setup()

  render(
    <I18nProvider>
      <GiftEditor gameId={7} />
    </I18nProvider>,
  )

  await screen.findByTestId('gift-editor')

  return user
}

const rows = () => screen.getAllByTestId('gift-row')
const picker = (index: number) =>
  within(rows()[index]).getByTestId('gift-reward') as HTMLSelectElement

describe('the list', () => {
  /** F28 R1, R21: rewards in an order, and nothing else. */
  it('shows a row per gift, in order', async () => {
    await renderEditor()

    expect(rows()).toHaveLength(2)
    expect(picker(0)).toHaveValue('1')
    expect(picker(1)).toHaveValue('2')
  })

  /** F28 R21: no odds, no total, no colour. */
  it('has no probability anywhere', async () => {
    await renderEditor()

    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('probability-total')).not.toBeInTheDocument()
  })

  /** F28 R23: what the player will read, in the order they will read it. */
  it('previews what the player sees', async () => {
    await renderEditor()

    const preview = screen.getByTestId('gift-preview')

    expect(within(preview).getByText('Free coffee')).toBeInTheDocument()
    expect(within(preview).getByText('Ten off')).toBeInTheDocument()
  })

  it('says so when the sheet is empty', async () => {
    fetchGiftsMock.mockResolvedValue(onSheet())
    await renderEditor()

    expect(screen.getByTestId('gift-empty')).toBeInTheDocument()
  })
})

describe('choosing what to give', () => {
  /**
   * F28 R5. Not offered at all rather than offered and refused: a sheet
   * gives everything on it, so "you have not won" on one is a contradiction.
   */
  it('never offers the losing reward', async () => {
    await renderEditor()

    expect(
      within(rows()[0]).queryByRole('option', { name: 'Maybe next time' }),
    ).not.toBeInTheDocument()
  })

  /** F28 R2, R24: a reward already on the sheet is not offered again. */
  it('does not offer a reward that is already on the sheet', async () => {
    await renderEditor()

    // Row 0 holds reward 1 and row 1 holds reward 2, so neither may offer
    // the other's.
    expect(within(rows()[0]).queryByRole('option', { name: 'Ten off' })).not.toBeInTheDocument()
    expect(within(rows()[1]).queryByRole('option', { name: 'Free coffee' })).not.toBeInTheDocument()
    // The one nobody has taken is offered by both.
    expect(within(rows()[0]).getByRole('option', { name: 'Tote bag' })).toBeInTheDocument()
  })

  it('adds a gift', async () => {
    const user = await renderEditor()

    await user.click(screen.getByTestId('gift-add'))

    expect(rows()).toHaveLength(3)
  })

  it('removes a gift', async () => {
    const user = await renderEditor()

    await user.click(within(rows()[0]).getByTestId('gift-remove'))

    expect(rows()).toHaveLength(1)
  })

  /** F28 R6: the order is the admin's. */
  it('reorders the list', async () => {
    const user = await renderEditor()

    await user.click(within(rows()[1]).getByLabelText(/move up/i))

    expect(picker(0)).toHaveValue('2')
    expect(picker(1)).toHaveValue('1')
  })

  /** F28 R3: the cap, and it says why rather than silently refusing. */
  it('stops at six gifts and says so', async () => {
    fetchGiftsMock.mockResolvedValue({ ...onSheet(1, 2, 3), maxGifts: 3 })
    await renderEditor()

    expect(screen.getByTestId('gift-add')).toBeDisabled()
    expect(screen.getByText(/at most 3 gifts/i)).toBeInTheDocument()
  })

  it('says to add a reward first when the catalogue has none to give', async () => {
    fetchRewardsMock.mockResolvedValue({ rewards: [REWARDS[3]], types: [] })
    fetchGiftsMock.mockResolvedValue(onSheet())
    await renderEditor()

    expect(screen.getByTestId('gift-no-rewards')).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('is disabled until something changes', async () => {
    const user = await renderEditor()

    expect(screen.getByTestId('save-sheet')).toBeDisabled()

    await user.click(within(rows()[0]).getByTestId('gift-remove'))

    expect(screen.getByTestId('save-sheet')).toBeEnabled()
  })

  /** F28 R21: the whole list, in order, by reward. */
  it('sends the rewards in the order shown', async () => {
    const user = await renderEditor()

    await user.click(within(rows()[1]).getByLabelText(/move up/i))
    await user.click(screen.getByTestId('save-sheet'))

    await waitFor(() =>
      expect(saveGiftsMock).toHaveBeenCalledWith(7, [{ rewardId: 2 }, { rewardId: 1 }]),
    )
  })

  it('puts a server violation against the row that caused it', async () => {
    saveGiftsMock.mockRejectedValue(
      new ApiValidationError('nope', [
        { field: 'gifts[1]', message: 'This reward is already on the sheet.' },
      ]),
    )
    const user = await renderEditor()

    // Reordered rather than shortened, so there is still a second row for
    // the violation to land against.
    await user.click(within(rows()[1]).getByLabelText(/move up/i))
    await user.click(screen.getByTestId('save-sheet'))

    expect(await screen.findByText(/already on the sheet/i)).toBeInTheDocument()
    expect(within(rows()[1]).getByRole('alert')).toBeInTheDocument()
  })
})
