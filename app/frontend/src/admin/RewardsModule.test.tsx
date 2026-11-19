import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStore, type AdminStore } from '../api/branding'
import { ApiError, ApiValidationError } from '../api/client'
import {
  createReward,
  deleteReward,
  fetchRewards,
  updateReward,
  type Reward,
} from '../api/rewards'
import { RewardsModule } from './RewardsModule'

vi.mock('../api/rewards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/rewards')>()),
  fetchRewards: vi.fn(),
  createReward: vi.fn(),
  updateReward: vi.fn(),
  deleteReward: vi.fn(),
}))

vi.mock('../api/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/branding')>()),
  fetchStore: vi.fn(),
}))

const fetchRewardsMock = vi.mocked(fetchRewards)
const createRewardMock = vi.mocked(createReward)
const updateRewardMock = vi.mocked(updateReward)
const deleteRewardMock = vi.mocked(deleteReward)
const fetchStoreMock = vi.mocked(fetchStore)

function reward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: 1,
    name: 'Free coffee',
    type: 'free_product',
    value: null,
    createdAt: '2026-11-15T09:00:00+00:00',
    usedBy: [],
    ...overrides,
  }
}

const TYPES = [
  { value: 'free_product' as const, label: 'Free product' },
  { value: 'percent_off' as const, label: 'Percentage off' },
  { value: 'amount_off' as const, label: 'Amount off' },
  { value: 'nothing' as const, label: 'Nothing' },
]

beforeEach(() => {
  fetchRewardsMock.mockReset()
  createRewardMock.mockReset()
  updateRewardMock.mockReset()
  deleteRewardMock.mockReset()
  fetchStoreMock.mockReset()

  fetchRewardsMock.mockResolvedValue({ rewards: [reward()], types: TYPES })
  fetchStoreMock.mockResolvedValue(branding())
})

/** A campaign counted in đồng, which is what the catalogue reads it in. */
function branding(overrides: Partial<AdminStore> = {}): AdminStore {
  return {
    companyName: null,
    language: null,
    timezone: 'Europe/Paris',
    theme: 'plain',
    currency: 'VND',
    currencySymbol: '₫',
    logoUrl: null,
    themes: [{ value: 'plain', label: 'Plain' }],
    currencies: [
      { value: 'VND', label: 'VND', symbol: '₫' },
      { value: 'EUR', label: 'EUR', symbol: '€' },
      { value: 'CNY', label: 'CNY', symbol: '¥' },
    ],
    ownCurrency: 'VND',
    defaultCurrency: 'VND',
    ...overrides,
  }
}

/** F13 R1, R5 */
describe('the catalogue', () => {
  it('lists each reward with its type and value', async () => {
    fetchRewardsMock.mockResolvedValue({
      rewards: [
        reward({ id: 1, name: 'Free coffee', type: 'free_product', value: null }),
        reward({ id: 2, name: 'Ten off', type: 'percent_off', value: 10 }),
      ],
      types: TYPES,
    })

    render(<RewardsModule />)

    await screen.findByTestId('reward-list')

    expect(screen.getAllByTestId('reward-row')).toHaveLength(2)
    expect(screen.getAllByTestId('reward-type')[1]).toHaveTextContent('Percentage off')
    expect(screen.getAllByTestId('reward-value')[1]).toHaveTextContent('10%')
  })

  /** F13 R3: a type that takes no value shows a dash, not a blank. */
  it('shows a dash where a type carries no value', async () => {
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    expect(screen.getByTestId('reward-value')).toHaveTextContent('—')
  })

  /**
   * F13 R28. The symbol comes from the campaign's currency, which is why
   * the module loads the branding alongside the catalogue — a value column
   * that cannot say what the number means is not worth rendering.
   */
  it('shows an amount in the campaign currency', async () => {
    fetchRewardsMock.mockResolvedValue({
      rewards: [reward({ type: 'amount_off', value: 50000 })],
      types: TYPES,
    })

    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    expect(screen.getByTestId('reward-value')).toHaveTextContent('₫')
  })

  /** F13 R6: what is in the way, before delete is pressed. */
  /**
   * F26 R24: by position, not by label. A label would be this reward's own
   * name, so the column would have repeated it back.
   */
  it('points at the slices using a reward', async () => {
    fetchRewardsMock.mockResolvedValue({
      rewards: [reward({ usedBy: [1, 4] })],
      types: TYPES,
    })

    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    expect(screen.getByTestId('reward-used-by')).toHaveTextContent('#1, #4')
  })

  it('says when a reward is on no slice', async () => {
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    expect(screen.getByTestId('reward-used-by')).toHaveTextContent('Not used')
  })

  it('says when the catalogue is empty', async () => {
    fetchRewardsMock.mockResolvedValue({ rewards: [], types: TYPES })

    render(<RewardsModule />)

    expect(await screen.findByTestId('rewards-empty')).toBeInTheDocument()
  })

  it('offers a retry when it cannot be loaded', async () => {
    fetchRewardsMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<RewardsModule />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchRewardsMock.mockResolvedValue({ rewards: [reward()], types: TYPES })
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('reward-list')).toBeInTheDocument()
  })
})

/** F13 R1, R3 */
describe('adding a reward', () => {
  it('sends the name and type', async () => {
    createRewardMock.mockResolvedValue(reward({ id: 2, name: 'Free tea' }))

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-add'))
    await user.type(screen.getByTestId('reward-name'), 'Free tea')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(createRewardMock).toHaveBeenCalledWith({ name: 'Free tea', type: 'free_product' }),
    )
  })

  /**
   * F13 R3. The field is not merely ignored for the types that take no
   * value — it is not there, so the admin never types a number that will
   * be rejected.
   */
  it('offers a value field only for the types that take one', async () => {
    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-add'))

    expect(screen.queryByTestId('reward-value-input')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'percent_off')
    expect(screen.getByTestId('reward-value-input')).toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'nothing')
    expect(screen.queryByTestId('reward-value-input')).not.toBeInTheDocument()
  })

  it('sends a value for a percentage', async () => {
    createRewardMock.mockResolvedValue(reward({ type: 'percent_off', value: 15 }))

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-add'))
    await user.type(screen.getByTestId('reward-name'), 'Fifteen off')
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'percent_off')
    await user.type(screen.getByTestId('reward-value-input'), '15')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(createRewardMock).toHaveBeenCalledWith({
        name: 'Fifteen off',
        type: 'percent_off',
        value: 15,
      }),
    )
  })

  it('puts a rejection against the field that caused it', async () => {
    createRewardMock.mockRejectedValue(
      new ApiValidationError('nope', [
        { field: 'name', message: 'There is already a reward called that.' },
      ]),
    )

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-add'))
    await user.type(screen.getByTestId('reward-name'), 'Free coffee')
    await user.click(screen.getByTestId('reward-save'))

    expect(await screen.findByText('There is already a reward called that.')).toBeInTheDocument()
    // What was typed stays in the form.
    expect(screen.getByTestId('reward-name')).toHaveValue('Free coffee')
  })
})

describe('changing a reward', () => {
  it('opens the row and saves the change', async () => {
    updateRewardMock.mockResolvedValue(reward({ name: 'Free tea' }))

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-open'))

    expect(screen.getByTestId('reward-name')).toHaveValue('Free coffee')

    await user.clear(screen.getByTestId('reward-name'))
    await user.type(screen.getByTestId('reward-name'), 'Free tea')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(updateRewardMock).toHaveBeenCalledWith(1, { name: 'Free tea', type: 'free_product' }),
    )
  })
})

/** F13 R6 */
describe('deleting a reward', () => {
  it('deletes one nothing is using', async () => {
    deleteRewardMock.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-open'))
    await user.click(screen.getByTestId('reward-delete'))

    await waitFor(() => expect(deleteRewardMock).toHaveBeenCalledWith(1))
  })

  /**
   * The server names the slices in the way, and its message is more useful
   * than anything this page could compose from a status code.
   */
  it('shows the server reason when a slice is using it', async () => {
    deleteRewardMock.mockRejectedValue(
      new ApiValidationError('nope', [
        { field: '', message: 'This reward is on the wheel, used by: Lucky you!.' },
      ]),
    )

    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    await user.click(screen.getByTestId('reward-open'))
    await user.click(screen.getByTestId('reward-delete'))

    expect(await screen.findByTestId('rewards-error')).toHaveTextContent('Lucky you!')
  })
})

/** F15 R5, R7, R8 as F27 R16 leaves them: stated, never offered. */
describe('the currency on an amount', () => {

  async function openTheEditor(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')
    await user.click(screen.getByTestId('reward-add'))

    return user
  }

  /** R7: only the type that is counted in money asks what it is counted in. */
  /** F27 R16: stated, not offered — and only where an amount is counted. */
  it('names the currency only for an amount off', async () => {
    const user = await openTheEditor()

    expect(screen.queryByTestId('reward-currency')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'percent_off')
    expect(screen.queryByTestId('reward-currency')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')
    expect(screen.getByTestId('reward-currency')).toBeInTheDocument()
  })

  /** F27 R16: no picker anywhere in the editor, for any type. */
  it('offers no way to change it', async () => {
    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(screen.queryByTestId('currency-select')).not.toBeInTheDocument()
  })

  /** F15 R5, F27 R16: the shop's effective currency, which the server resolved. */
  it('names the shop currency', async () => {
    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(screen.getByTestId('reward-currency')).toHaveTextContent('VND')
  })

  /**
   * R8 again, and the point of the whole feature: a French admin whose
   * campaign has chosen nothing gets euros without going to look for them.
   */
  it('opens on what the language suggests when nothing has been chosen', async () => {
    // The server resolved it: nothing chosen, so `currency` is already
    // the default this admin's language suggests (F15 R5).
    fetchStoreMock.mockResolvedValue(
      branding({
        ownCurrency: null,
        defaultCurrency: 'EUR',
        currency: 'EUR',
        currencySymbol: '€',
      }),
    )

    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(screen.getByTestId('reward-currency')).toHaveTextContent('EUR')
  })

  /** The unit is stated on the field's label as well, and follows the select. */
  /**
   * F21 R4: the amount field says what it is counted in. It no longer
   * changes while the editor is open, because there is nothing to change it
   * with (F27 R16) — the Store module is where that happens, and the editor
   * is re-read afterwards.
   */
  it('labels the amount field with the shop currency', async () => {
    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(screen.getByText(/Value \(₫\)/)).toBeInTheDocument()
  })

  /*
   * F15 R9's test — that saving an amount-off reward settled the campaign's
   * currency — is gone with the behaviour. F27 R16: nothing about one reward
   * moves what the whole shop is counted in, and the test that proves no
   * currency goes up is the one below.
   */

  /**
   * R7. A free product is not counted in anything, so a save about one
   * must not carry a currency — it would move what the shop trades in from
   * a form that never mentioned it.
   */
  it('sends no currency for a type that takes no amount', async () => {
    createRewardMock.mockResolvedValue(reward({ id: 2, name: 'Free tea' }))

    const user = await openTheEditor()
    await user.type(screen.getByTestId('reward-name'), 'Free tea')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(createRewardMock).toHaveBeenCalledWith({ name: 'Free tea', type: 'free_product' }),
    )
  })

  /**
   * F27 R16, which is stronger than R7 was: no save from this editor carries
   * a currency, not even the one counted in money. The shop's currency is the
   * Store module's, and one reward cannot move it.
   */
  it('sends no currency even for an amount off', async () => {
    createRewardMock.mockResolvedValue(reward({ type: 'amount_off', value: 50000 }))

    const user = await openTheEditor()
    await user.type(screen.getByTestId('reward-name'), 'Fifty off')
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')
    await user.type(screen.getByTestId('reward-value-input'), '50000')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(createRewardMock).toHaveBeenCalledWith({
        name: 'Fifty off',
        type: 'amount_off',
        value: 50000,
      }),
    )
  })

  it('puts a rejected currency against its own field', async () => {
    createRewardMock.mockRejectedValue(
      new ApiValidationError('nope', [
        { field: 'currency', message: 'Choose one of: VND, EUR, USD, GBP, CNY.' },
      ]),
    )

    const user = await openTheEditor()
    await user.type(screen.getByTestId('reward-name'), 'Fifty off')
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')
    await user.type(screen.getByTestId('reward-value-input'), '50000')
    await user.click(screen.getByTestId('reward-save'))

    expect(await screen.findByText(/Choose one of/)).toBeInTheDocument()
  })
})
