import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBranding,
  removeLogo,
  saveBranding,
  uploadLogo,
  type AdminBranding,
  type LogoUpload,
} from '../api/branding'
import { ApiError, ApiValidationError } from '../api/client'
import { BrandingSection } from './BrandingSection'

vi.mock('../api/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/branding')>()),
  fetchBranding: vi.fn(),
  saveBranding: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))

const fetchMock = vi.mocked(fetchBranding)
const saveMock = vi.mocked(saveBranding)
const uploadMock = vi.mocked(uploadLogo)
const removeMock = vi.mocked(removeLogo)

const DEFAULT_TAGLINE = 'One spin, one prize. Good luck.'

const THEMES = [
  { value: 'plain', label: 'Plain' },
  { value: 'black-friday', label: 'Black Friday' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'new-year', label: 'New Year' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'birthday', label: 'Happy Birthday' },
]

/** F15 R1, R14: the list the server sends, symbols and all. */
const CURRENCIES = [
  { value: 'VND', label: 'VND', symbol: '₫' },
  { value: 'EUR', label: 'EUR', symbol: '€' },
  { value: 'CNY', label: 'CNY', symbol: '¥' },
]

function upload(overrides: Partial<LogoUpload> = {}): LogoUpload {
  return { ...branding(), notice: null, ...overrides }
}

function branding(overrides: Partial<AdminBranding> = {}): AdminBranding {
  return {
    companyName: null,
    campaignName: null,
    tagline: DEFAULT_TAGLINE,
    ownTagline: null,
    defaultTagline: DEFAULT_TAGLINE,
    // F23 R1: a campaign with no limit, which is every campaign
    // until an admin sets one.
    dailySpinLimit: null,
    maxDailySpinLimit: 99,
    theme: 'plain',
    currency: 'VND',
    currencySymbol: '₫',
    ownCurrency: 'VND',
    defaultCurrency: 'VND',
    logoUrl: null,
    themes: THEMES,
    currencies: CURRENCIES,
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  saveMock.mockReset()
  uploadMock.mockReset()
  removeMock.mockReset()
  fetchMock.mockResolvedValue(branding())
})

async function renderSection(initial?: Partial<AdminBranding>) {
  if (initial !== undefined) {
    fetchMock.mockResolvedValue(branding(initial))
  }

  const user = userEvent.setup()
  render(<BrandingSection />)
  await screen.findByTestId('branding-section')

  return user
}

const companyField = () => screen.getByLabelText(/company name/i)
const campaignField = () => screen.getByLabelText(/campaign name/i)
const taglineField = () => screen.getByLabelText(/^tagline$/i)
const themeField = () => screen.getByLabelText(/^theme$/i)
const saveButton = () => screen.getByTestId('save-branding')

describe('loading', () => {
  it('shows the stored values', async () => {
    await renderSection({ companyName: 'AA Store', campaignName: 'Noel', theme: 'christmas' })

    expect(companyField()).toHaveValue('AA Store')
    expect(campaignField()).toHaveValue('Noel')
    expect(themeField()).toHaveValue('christmas')
  })

  /** F04 R7 */
  it('offers every theme the server knows about', async () => {
    await renderSection()

    const options = Array.from(themeField().querySelectorAll('option')).map((o) => o.textContent)

    expect(options).toEqual([
      'Plain',
      'Black Friday',
      'Christmas',
      'New Year',
      'Halloween',
      'Happy Birthday',
    ])
  })

  it('offers a retry when the branding cannot be loaded', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    render(<BrandingSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchMock.mockResolvedValue(branding())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('branding-section')).toBeInTheDocument()
  })

  it('caps the name fields at sixty characters', async () => {
    await renderSection()

    expect(companyField()).toHaveAttribute('maxlength', '60')
    expect(campaignField()).toHaveAttribute('maxlength', '60')
  })
})

describe('saving', () => {
  it('is disabled until something changes', async () => {
    const user = await renderSection()

    expect(saveButton()).toBeDisabled()

    await user.type(companyField(), 'A')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the names, the tagline, the theme and the currency', async () => {
    saveMock.mockResolvedValue(branding({ companyName: 'AA Store', theme: 'halloween' }))
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.selectOptions(themeField(), 'halloween')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        companyName: 'AA Store',
        campaignName: '',
        tagline: '',
        theme: 'halloween',
        // F15 R10: the currency travels with the rest of the branding.
        currency: 'VND',
        // F23 R1: and the limit, as null, because the field is empty. The
        // key is always sent from this form — it is the thing that edits
        // it — so "absent leaves it alone" is for other clients.
        dailySpinLimit: null,
      }),
    )
  })

  /** F15 R10 */
  describe('the currency', () => {
    function currencyField(): HTMLSelectElement {
      return screen.getByTestId('currency-select') as HTMLSelectElement
    }

    it('opens on the campaign currency and offers the rest', async () => {
      await renderSection()

      expect(currencyField()).toHaveValue('VND')
      expect(
        Array.from(currencyField().options).map((option) => option.value),
      ).toEqual(['VND', 'EUR', 'CNY'])
    })

    /** F15 R14: the symbol comes from the server, beside the code. */
    it('shows each code with its symbol', async () => {
      await renderSection()

      expect(currencyField()).toHaveTextContent('EUR €')
      expect(currencyField()).toHaveTextContent('CNY ¥')
    })

    it('saves a change', async () => {
      saveMock.mockResolvedValue(branding({ currency: 'EUR', currencySymbol: '€' }))
      const user = await renderSection()

      await user.selectOptions(currencyField(), 'EUR')
      await user.click(saveButton())

      await waitFor(() =>
        expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' })),
      )
    })

    /**
     * F15 R8: a campaign nobody has chosen for opens on what the admin's
     * language suggests, which the server has already resolved into
     * `currency`.
     */
    it('opens on the language default when nothing has been chosen', async () => {
      fetchMock.mockResolvedValue(
        branding({ ownCurrency: null, defaultCurrency: 'EUR', currency: 'EUR', currencySymbol: '€' }),
      )

      await renderSection()

      expect(currencyField()).toHaveValue('EUR')
    })

    /** F15 R11: the hint exists because the obvious guess is the wrong one. */
    it('says that changing it does not convert the amounts', async () => {
      await renderSection()

      expect(screen.getByText(/does not convert them/i)).toBeInTheDocument()
    })

    it('does not count as a change until it is changed', async () => {
      await renderSection()

      expect(saveButton()).toBeDisabled()
    })
  })

  it('sends a tagline the admin typed', async () => {
    saveMock.mockResolvedValue(branding())
    const user = await renderSection()

    await user.type(taglineField(), 'Spin for a treat!')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ tagline: 'Spin for a treat!' }),
      ),
    )
  })

  it('shows the admin their own tagline, not the default', async () => {
    await renderSection({ ownTagline: 'Spin for a treat!', tagline: 'Spin for a treat!' })

    expect(taglineField()).toHaveValue('Spin for a treat!')
  })

  it('leaves the field empty when the default is in use, and offers it', async () => {
    await renderSection()

    expect(taglineField()).toHaveValue('')
    expect(taglineField()).toHaveAttribute('placeholder', DEFAULT_TAGLINE)
    expect(screen.getByText(new RegExp(DEFAULT_TAGLINE.replace(/[.!]/g, '\$&')))).toBeInTheDocument()
  })

  it('caps the tagline at 120 characters', async () => {
    await renderSection()

    expect(taglineField()).toHaveAttribute('maxlength', '120')
  })

  it('confirms a save and returns to clean', async () => {
    saveMock.mockResolvedValue(branding({ companyName: 'AA Store' }))
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.click(saveButton())

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('keeps the edits and shows the reason when the server rejects them', async () => {
    saveMock.mockRejectedValue(
      new ApiValidationError('invalid', [
        { field: 'companyName', message: 'This can be at most 60 characters.' },
      ]),
    )
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.click(saveButton())

    expect(await screen.findByText(/at most 60 characters/i)).toBeInTheDocument()
    expect(companyField()).toHaveValue('AA Store')
    expect(companyField()).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the edits when the server is unreachable', async () => {
    saveMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderSection()

    await user.type(campaignField(), 'Noel')
    await user.click(saveButton())

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
    expect(campaignField()).toHaveValue('Noel')
  })
})

describe('the logo', () => {
  const file = (name = 'logo.png', type = 'image/png') =>
    new File(['fake-bytes'], name, { type })

  it('uploads a chosen file', async () => {
    uploadMock.mockResolvedValue(upload({ logoUrl: '/api/branding/logo?v=2' }))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file())

    await waitFor(() => expect(uploadMock).toHaveBeenCalledOnce())
    expect(await screen.findByTestId('current-logo')).toHaveAttribute(
      'src',
      '/api/branding/logo?v=2',
    )
  })

  /** F05 R16 — SVG joined the list */
  it('only accepts the formats the server will take', async () => {
    await renderSection()

    expect(screen.getByLabelText(/^logo$/i)).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/svg+xml',
    )
  })

  it('tells the admin exactly why the server refused a file', async () => {
    uploadMock.mockRejectedValue(
      new ApiValidationError('invalid', [
        { field: 'logo', message: 'That SVG declares XML entities, which are not allowed.' },
      ]),
    )
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    expect(await screen.findByText(/declares XML entities/i)).toBeInTheDocument()
  })

  it('reports an upload that fails for other reasons', async () => {
    uploadMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file())

    expect(await screen.findByText(/could not be uploaded/i)).toBeInTheDocument()
  })

  it('offers no Remove button when there is no logo', async () => {
    await renderSection()

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('current-logo')).not.toBeInTheDocument()
  })

  it('removes the logo', async () => {
    removeMock.mockResolvedValue(branding({ logoUrl: null }))
    const user = await renderSection({ logoUrl: '/api/branding/logo?v=1' })

    expect(screen.getByTestId('current-logo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(removeMock).toHaveBeenCalledOnce())
    expect(screen.queryByTestId('current-logo')).not.toBeInTheDocument()
  })

  /** F05 R17 */
  /** F05 R10 */
  it('reports what sanitising removed from an SVG', async () => {
    uploadMock.mockResolvedValue(
      upload({
        logoUrl: '/api/branding/logo?v=3',
        notice: 'Some content was removed from the SVG for safety: scripts.',
      }),
    )
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    const notice = await screen.findByTestId('logo-notice')
    expect(notice).toHaveTextContent(/scripts/)
    // The upload worked, so this is information rather than a failure.
    expect(notice).not.toHaveAttribute('role', 'alert')
    expect(screen.getByTestId('current-logo')).toBeInTheDocument()
  })

  /** F05 R11 */
  it('shows no notice when the file came through untouched', async () => {
    uploadMock.mockResolvedValue(upload({ logoUrl: '/api/branding/logo?v=4', notice: null }))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    await screen.findByTestId('current-logo')
    expect(screen.queryByTestId('logo-notice')).not.toBeInTheDocument()
  })

  it('says what is allowed, and that SVGs are cleaned', async () => {
    await renderSection()

    expect(screen.getByText(/PNG, JPEG, WebP or SVG, up to 2MB/i)).toBeInTheDocument()
    expect(screen.getByText(/cleaned before use/i)).toBeInTheDocument()
  })
})

/** F23 R20, R21 — the campaign's daily spin limit. */
describe('the daily spin limit', () => {
  const limitField = () => screen.getByLabelText(/spins per person per day/i)

  /** F23 R1: blank is no limit, and it is the common case. */
  it('is empty when the campaign has none', async () => {
    await renderSection({ dailySpinLimit: null })

    expect(limitField()).toHaveValue(null)
  })

  it('shows the limit the campaign has', async () => {
    await renderSection({ dailySpinLimit: 3 })

    expect(limitField()).toHaveValue(3)
  })

  it('saves a limit that was typed in', async () => {
    const user = await renderSection({ dailySpinLimit: null })

    await user.type(limitField(), '2')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ dailySpinLimit: 2 })),
    )
  })

  /** F23 R1: clearing the field is how a campaign goes back to no limit. */
  it('sends null when the field is cleared', async () => {
    const user = await renderSection({ dailySpinLimit: 5 })

    await user.clear(limitField())
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ dailySpinLimit: null })),
    )
  })

  /**
   * F23 R21. The server decides what a valid limit is — one place, because
   * it is the one that also has to refuse the next client — and its answer
   * lands on the field that caused it (F01 R12).
   */
  it('shows the server violation under the field', async () => {
    saveMock.mockRejectedValue(
      new ApiValidationError('The branding is invalid.', [
        { field: 'dailySpinLimit', message: 'Spins per day must be a whole number from 1 to 99.' },
      ]),
    )

    const user = await renderSection({ dailySpinLimit: null })

    await user.type(limitField(), '0')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/whole number from 1 to 99/i)).toBeInTheDocument()
  })

  /** F23 R2 is the part an admin would not guess from the label. */
  it('says that it counts the person rather than the phone', async () => {
    await renderSection({ dailySpinLimit: null })

    expect(screen.getByText(/counts the person, not the phone/i)).toBeInTheDocument()
  })
})
