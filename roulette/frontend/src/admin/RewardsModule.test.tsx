import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBranding, type AdminBranding } from '../api/branding'
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
  fetchBranding: vi.fn(),
}))

const fetchRewardsMock = vi.mocked(fetchRewards)
const createRewardMock = vi.mocked(createReward)
const updateRewardMock = vi.mocked(updateReward)
const deleteRewardMock = vi.mocked(deleteReward)
const fetchBrandingMock = vi.mocked(fetchBranding)

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
  fetchBrandingMock.mockReset()

  fetchRewardsMock.mockResolvedValue({ rewards: [reward()], types: TYPES })
  fetchBrandingMock.mockResolvedValue(branding())
})

/** A campaign counted in đồng, which is what the catalogue reads it in. */
function branding(overrides: Partial<AdminBranding> = {}): AdminBranding {
  return {
    companyName: null,
    campaignName: null,
    tagline: 'One spin, one prize. Good luck.',
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
    ownTagline: null,
    ownCurrency: 'VND',
    defaultCurrency: 'VND',
    defaultTagline: 'One spin, one prize. Good luck.',
    // F23 R1: a campaign with no limit, which is every campaign
    // until an admin sets one.
    dailySpinLimit: null,
    maxDailySpinLimit: 99,
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
  it('names the slices using a reward', async () => {
    fetchRewardsMock.mockResolvedValue({
      rewards: [reward({ usedBy: ['Lucky you!', 'Second chance'] })],
      types: TYPES,
    })

    render(<RewardsModule />)
    await screen.findByTestId('reward-list')

    expect(screen.getByTestId('reward-used-by')).toHaveTextContent('Lucky you!, Second chance')
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

/** F15 R7, R8, R9 */
describe('the currency on an amount', () => {
  function currencyField(): HTMLSelectElement {
    return screen.getByTestId('currency-select') as HTMLSelectElement
  }

  async function openTheEditor(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup()
    render(<RewardsModule />)
    await screen.findByTestId('reward-list')
    await user.click(screen.getByTestId('reward-add'))

    return user
  }

  /** R7: only the type that is counted in money asks what it is counted in. */
  it('offers a currency only for an amount off', async () => {
    const user = await openTheEditor()

    expect(screen.queryByTestId('currency-select')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'percent_off')
    expect(screen.queryByTestId('currency-select')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')
    expect(screen.getByTestId('currency-select')).toBeInTheDocument()
  })

  /** R8: on the campaign's effective currency, which the server resolved. */
  it('opens on the campaign currency', async () => {
    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(currencyField()).toHaveValue('VND')
  })

  /**
   * R8 again, and the point of the whole feature: a French admin whose
   * campaign has chosen nothing gets euros without going to look for them.
   */
  it('opens on what the language suggests when nothing has been chosen', async () => {
    // The server resolved it: nothing chosen, so `currency` is already
    // the default this admin's language suggests (F15 R5).
    fetchBrandingMock.mockResolvedValue(
      branding({
        ownCurrency: null,
        defaultCurrency: 'EUR',
        currency: 'EUR',
        currencySymbol: '€',
      }),
    )

    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(currencyField()).toHaveValue('EUR')
  })

  /** The unit is stated on the field's label as well, and follows the select. */
  it('relabels the amount field as the currency changes', async () => {
    const user = await openTheEditor()
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')

    expect(screen.getByText(/Value \(₫\)/)).toBeInTheDocument()

    await user.selectOptions(currencyField(), 'EUR')
    expect(screen.getByText(/Value \(€\)/)).toBeInTheDocument()
  })

  /** R9: one save, and the campaign's currency is settled by it. */
  it('sends the currency with the amount', async () => {
    createRewardMock.mockResolvedValue(reward({ type: 'amount_off', value: 50000 }))

    const user = await openTheEditor()
    await user.type(screen.getByTestId('reward-name'), 'Fifty off')
    await user.selectOptions(screen.getByTestId('reward-type-select'), 'amount_off')
    await user.selectOptions(currencyField(), 'EUR')
    await user.type(screen.getByTestId('reward-value-input'), '50000')
    await user.click(screen.getByTestId('reward-save'))

    await waitFor(() =>
      expect(createRewardMock).toHaveBeenCalledWith({
        name: 'Fifty off',
        type: 'amount_off',
        value: 50000,
        currency: 'EUR',
      }),
    )
  })

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
