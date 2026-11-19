import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStore,
  removeLogo,
  saveStore,
  uploadLogo,
  type AdminStore,
  type LogoUpload,
} from '../api/branding'
import { ApiError, ApiValidationError } from '../api/client'
import { StoreModule } from './StoreModule'

vi.mock('../api/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/branding')>()),
  fetchStore: vi.fn(),
  saveStore: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))

const fetchMock = vi.mocked(fetchStore)
const saveMock = vi.mocked(saveStore)
const uploadMock = vi.mocked(uploadLogo)
const removeMock = vi.mocked(removeLogo)


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

function branding(overrides: Partial<AdminStore> = {}): AdminStore {
  return {
    companyName: null,
    // F27 R17: no choice, which is every shop until somebody picks one.
    language: null,
    // F27 R15: never null. The upgrade seeded it from APP_TIMEZONE.
    timezone: 'Europe/Paris',
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

async function renderSection(initial?: Partial<AdminStore>) {
  if (initial !== undefined) {
    fetchMock.mockResolvedValue(branding(initial))
  }

  const user = userEvent.setup()
  render(<StoreModule />)
  await screen.findByTestId('store-section')

  return user
}

const companyField = () => screen.getByLabelText(/company name/i)
const themeField = () => screen.getByLabelText(/^theme$/i)
const saveButton = () => screen.getByTestId('save-store')

describe('loading', () => {
  it('shows the stored values', async () => {
    await renderSection({ companyName: 'AA Store', theme: 'christmas' })

    expect(companyField()).toHaveValue('AA Store')
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

  it('offers a retry when the store cannot be loaded', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    render(<StoreModule />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchMock.mockResolvedValue(branding())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('store-section')).toBeInTheDocument()
  })

  it('caps the company name at sixty characters', async () => {
    await renderSection()

    expect(companyField()).toHaveAttribute('maxlength', '60')
  })
})

describe('saving', () => {
  it('is disabled until something changes', async () => {
    const user = await renderSection()

    expect(saveButton()).toBeDisabled()

    await user.type(companyField(), 'A')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the company name, the theme, the currency, the language and the clock', async () => {
    saveMock.mockResolvedValue(branding({ companyName: 'AA Store', theme: 'halloween' }))
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.selectOptions(themeField(), 'halloween')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        companyName: 'AA Store',
        theme: 'halloween',
        // F15 R10: the currency travels with the rest of the store.
        currency: 'VND',
        // F27 R17: null, because nothing is chosen and the browser decides.
        language: null,
        // F27 R15: the shop's clock, sent as it stands.
        timezone: 'Europe/Paris',
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

    await user.type(companyField(), 'AA Store')
    await user.click(saveButton())

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
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
/*
 * F23's daily-limit tests left with the field. The limit is the game's now
 * (F27 R29), so they are GameSettings.test.tsx's — including the one that
 * mattered most, that clearing the field is how a promotion goes back to no
 * limit at all.
 */
